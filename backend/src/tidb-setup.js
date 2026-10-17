// Provision TiDB Cloud: create the database + tables, then load the demo rows.
//
//   node src/tidb-setup.js          (or: npm run tidb:setup)
//
// Reads connection details from backend/.env (or the process env):
//   TIDB_HOST=gateway01.<region>.prod.aws.tidbcloud.com
//   TIDB_PORT=4000
//   TIDB_USER=<prefix>.root
//   TIDB_PASSWORD=<password>
//   TIDB_DATABASE=slotsync
//   TIDB_CA=/path/to/ca.pem     # optional — verify TLS with the TiDB Cloud CA
//   TIDB_SSL=require|disable    # default require (TiDB Cloud always supports TLS)
//
// Falls back to MYSQL_* vars if TIDB_* are not set. Safe to re-run: it recreates
// the tables if missing and replaces all rows with a fresh seed.
try { require('dotenv').config(); } catch (e) {}
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildSeedData } = require('./seed');

// Same collection list as db.js so the app sees identical data.
const COLLECTIONS = [
  'departments', 'users', 'teachers', 'teacher_unavailability', 'availability_requests',
  'rooms', 'subjects', 'batches', 'assignments', 'time_slots',
  'timetables', 'sessions', 'jobs', 'audit_log', 'refresh_tokens',
];

function pick(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return undefined;
}

function sslOptions() {
  const mode = String(pick('TIDB_SSL', 'MYSQL_SSL') || 'require').toLowerCase();
  if (mode === 'disable' || mode === 'false' || mode === 'off') return undefined;
  const caFile = pick('TIDB_CA', 'MYSQL_CA');
  if (caFile) {
    const resolved = path.resolve(caFile);
    try { return { ca: fs.readFileSync(resolved), minVersion: 'TLSv1.2', rejectUnauthorized: true }; }
    catch (e) { throw new Error(`Could not read TIDB_CA (${resolved}): ${e.message}`); }
  }
  return { minVersion: 'TLSv1.2', rejectUnauthorized: String(pick('TIDB_SSL_VERIFY', 'MYSQL_SSL_VERIFY') || '').toLowerCase() === 'true' };
}

function buildConfig(withDatabase) {
  const conf = {
    host: pick('TIDB_HOST', 'MYSQL_HOST') || 'localhost',
    port: Number(pick('TIDB_PORT', 'MYSQL_PORT') || 4000),
    user: pick('TIDB_USER', 'MYSQL_USER') || 'root',
    password: pick('TIDB_PASSWORD', 'MYSQL_PASSWORD') || '',
    connectTimeout: 15000,
  };
  const ssl = sslOptions();
  if (ssl) conf.ssl = ssl;
  if (withDatabase) conf.database = pick('TIDB_DATABASE', 'MYSQL_DATABASE') || 'slotsync';
  return conf;
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

async function main() {
  const base = buildConfig(false);
  const database = pick('TIDB_DATABASE', 'MYSQL_DATABASE') || 'slotsync';

  console.log(`Connecting to TiDB at ${base.host}:${base.port} (TLS ${base.ssl ? 'on' : 'off'})…`);

  let conn;
  try {
    conn = await mysql.createConnection(base);
  } catch (e) {
    console.error(`\nCould not connect: ${e.code || ''} ${e.message}`);
    if (e.code === 'ENOTFOUND') console.error('Check TIDB_HOST (e.g. gateway01.<region>.prod.aws.tidbcloud.com).');
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check TIDB_USER / TIDB_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`Database \`${database}\` ready.`);
  await conn.end();

  const pool = mysql.createPool({ ...base, database, charset: 'utf8mb4_unicode_ci', connectionLimit: 4, waitForConnections: true });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS records (
        collection VARCHAR(64) NOT NULL, id VARCHAR(128) NOT NULL,
        data JSON NOT NULL, PRIMARY KEY (collection, id),
        INDEX idx_collection (collection)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v JSON NOT NULL)
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Tables `records` and `meta` ready.');

    const data = buildSeedData();

    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      await c.query('DELETE FROM records');
      let inserted = 0;
      for (const col of COLLECTIONS) {
        for (const row of (data[col] || [])) {
          if (!row.id) row.id = uid(col.slice(0, 3));
          await c.query('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)', [col, String(row.id), JSON.stringify(row)]);
          inserted += 1;
        }
      }
      await c.query(
        "INSERT INTO meta (k, v) VALUES ('time_grid', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        [JSON.stringify(data.time_grid || null)]
      );
      await c.commit();
      console.log(`Inserted ${inserted} rows + time_grid.`);
    } catch (e) {
      try { await c.rollback(); } catch (x) {}
      throw e;
    } finally {
      c.release();
    }

    const [rows] = await pool.query('SELECT collection, COUNT(*) AS n FROM records GROUP BY collection ORDER BY collection');
    console.log('\nRow counts by collection:');
    for (const r of rows) console.log(`  ${String(r.n).padStart(3)}  ${r.collection}`);
    const [[total]] = await pool.query('SELECT COUNT(*) AS n FROM records');
    console.log(`\nDone — ${total.n} rows in \`${database}\`.records.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(`\nSetup failed: ${e.code || ''} ${e.message}`); process.exitCode = 1; });
