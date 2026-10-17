// Dual-DB store: SQLite (default, zero-config) + MySQL (local server).
// Keeps the SAME sync API (read/persist/all/find/insert/...) so routes don't change.
// Backed by real SQL tables: one generic `records` table (collection,id,data JSON)
// + `meta` table for time_grid. Works identically on both dialects.
//
// Env:
//   DB_DIALECT=sqlite|mysql (default sqlite)
//   SQLITE_FILE=./data/slotsync.sqlite
//   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//   MYSQL_SSL=require|disable, MYSQL_CA=/path/ca.pem   (TiDB Cloud needs TLS)
// For TiDB Cloud: MYSQL_HOST=gateway01.<region>.prod.aws.tidbcloud.com, MYSQL_PORT=4000
try { require('dotenv').config(); } catch (e) {}
const fs = require('fs');
const path = require('path');

const DIALECT = String(process.env.DB_DIALECT || 'sqlite').toLowerCase() === 'mysql' ? 'mysql' : 'sqlite';
const SQLITE_FILE = process.env.SQLITE_FILE || path.join(__dirname, '..', 'data', 'slotsync.sqlite');
const LEGACY_JSON = path.join(__dirname, '..', 'data', 'db.json');

const COLLECTIONS = [
  'departments', 'users', 'teachers', 'teacher_unavailability', 'availability_requests',
  'rooms', 'subjects', 'batches', 'assignments', 'time_slots',
  'timetables', 'sessions', 'jobs', 'audit_log', 'refresh_tokens',
];

const DEFAULTS = {
  departments: [], users: [], teachers: [], teacher_unavailability: [],
  availability_requests: [], rooms: [], subjects: [], batches: [],
  assignments: [], time_slots: [], time_grid: null,
  timetables: [], sessions: [], jobs: [], audit_log: [], refresh_tokens: [],
};

let cache = null;
let sqliteDb = null;
let mysqlPool = null;
let mysqlReady = false;
let saveTimer = null;

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// ---------- SQLite (node:sqlite, built-in, sync) ----------
function sqliteOpen() {
  if (sqliteDb) return sqliteDb;
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
  sqliteDb = new DatabaseSync(SQLITE_FILE);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);
  return sqliteDb;
}

function sqliteLoad() {
  const db = sqliteOpen();
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const rows = db.prepare('SELECT collection, id, data FROM records').all();
    for (const r of rows) {
      if (out[r.collection]) {
        try { out[r.collection].push(JSON.parse(r.data)); } catch (e) {}
      }
    }
    const m = db.prepare("SELECT v FROM meta WHERE k='time_grid'").get();
    if (m) { try { out.time_grid = JSON.parse(m.v); } catch (e) {} }
    if (rows.length === 0 && !m) migrateLegacyJson(out);
  } catch (e) { /* fresh db */ }
  return out;
}

function sqliteSave(data) {
  const db = sqliteOpen();
  const tx = db.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
  const metaUp = db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('time_grid', ?)");
  // Full rewrite is fine for college-scale data (<10k rows).
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM records').run();
    for (const col of COLLECTIONS) {
      for (const row of (data[col] || [])) {
        if (!row.id) row.id = uid(col.slice(0, 3));
        tx.run(col, String(row.id), JSON.stringify(row));
      }
    }
    metaUp.run(JSON.stringify(data.time_grid || null));
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (x) {}
    throw e;
  }
}

// ---------- MySQL (mysql2/promise, async) ----------
// TLS options for managed MySQL providers (TiDB Cloud requires TLS).
//   MYSQL_SSL=disable            -> plaintext
//   MYSQL_CA=/path/ca.pem        -> verify against the provider CA
//   MYSQL_SSL_VERIFY=true        -> verify the chain with the system store
// Default: TLS on, chain not verified (fine for TiDB Cloud's public gateway).
function mysqlSsl() {
  const mode = String(process.env.MYSQL_SSL || '').toLowerCase();
  if (mode === 'disable' || mode === 'false' || mode === 'off') return undefined;
  const caFile = process.env.MYSQL_CA;
  if (caFile) {
    try { return { ca: fs.readFileSync(caFile), minVersion: 'TLSv1.2', rejectUnauthorized: true }; }
    catch (e) { console.error(`Could not read MYSQL_CA (${caFile}): ${e.message}`); }
  }
  return { minVersion: 'TLSv1.2', rejectUnauthorized: String(process.env.MYSQL_SSL_VERIFY || '').toLowerCase() === 'true' };
}

function mysqlConfig() {
  const cfg = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'slotsync',
    waitForConnections: true, connectionLimit: 5,
  };
  const ssl = mysqlSsl();
  if (ssl) cfg.ssl = ssl;
  return cfg;
}

async function mysqlPoolGet() {
  if (mysqlPool) return mysqlPool;
  const mysql = require('mysql2/promise');
  // First connect without db to CREATE DATABASE if missing.
  const cfg = mysqlConfig();
  // Bootstrap connection (no database yet) — must still use TLS for managed MySQL/TiDB.
  const tmp = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, ...(cfg.ssl ? { ssl: cfg.ssl } : {}) });
  await tmp.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await tmp.end();
  mysqlPool = mysql.createPool({ ...cfg, charset: 'utf8mb4_unicode_ci' });
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS records (
      collection VARCHAR(64) NOT NULL, id VARCHAR(128) NOT NULL,
      data JSON NOT NULL, PRIMARY KEY (collection, id),
      INDEX idx_collection (collection)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v JSON NOT NULL)
    ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  mysqlReady = true;
  return mysqlPool;
}

async function mysqlLoadAll() {
  const pool = await mysqlPoolGet();
  const [rows] = await pool.query('SELECT collection, id, data FROM records');
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of rows) {
    if (out[r.collection]) {
      const obj = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      out[r.collection].push(obj);
    }
  }
  const [m] = await pool.query("SELECT v FROM meta WHERE k='time_grid'");
  if (m && m[0]) {
    const v = m[0].v;
    out.time_grid = typeof v === 'string' ? JSON.parse(v) : v;
  }
  if (rows.length === 0) {
    const legacy = readLegacyJson();
    if (legacy) {
      Object.assign(out, legacy);
      await mysqlSaveAll(out);
    }
  }
  return out;
}

async function mysqlSaveAll(data) {
  const pool = await mysqlPoolGet();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM records');
    for (const col of COLLECTIONS) {
      for (const row of (data[col] || [])) {
        if (!row.id) row.id = uid(col.slice(0, 3));
        await conn.query('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)', [col, String(row.id), JSON.stringify(row)]);
      }
    }
    await conn.query("INSERT INTO meta (k, v) VALUES ('time_grid', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)", [JSON.stringify(data.time_grid || null)]);
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch (x) {}
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- legacy JSON migration (one-time) ----------
function readLegacyJson() {
  try {
    if (fs.existsSync(LEGACY_JSON)) {
      const j = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
      for (const k of Object.keys(DEFAULTS)) if (!(k in j)) j[k] = DEFAULTS[k];
      return j;
    }
  } catch (e) {}
  return null;
}

function migrateLegacyJson(out) {
  const legacy = readLegacyJson();
  if (!legacy) return false;
  Object.assign(out, legacy);
  try { sqliteSave(out); } catch (e) {}
  return true;
}

// ---------- public sync API ----------
function read() {
  if (cache) return cache;
  if (DIALECT === 'sqlite') {
    cache = sqliteLoad();
    // If sqlite was empty but legacy json exists, sqliteLoad already migrated.
  } else {
    // mysql: start from legacy/memory sync, refresh async in background.
    cache = readLegacyJson() || JSON.parse(JSON.stringify(DEFAULTS));
    mysqlLoadAll().then((fromSql) => {
      // Only overwrite if SQL has data (avoid wiping fresh seed on boot race).
      const hasData = Object.values(fromSql).some((v) => Array.isArray(v) ? v.length > 0 : !!v);
      if (hasData) { cache = fromSql; }
      else { mysqlSaveAll(cache).catch(() => {}); }
    }).catch(() => {});
  }
  for (const k of Object.keys(DEFAULTS)) if (!(k in cache)) cache[k] = DEFAULTS[k];
  return cache;
}

function persist() {
  if (!cache) return;
  if (DIALECT === 'sqlite') {
    try { sqliteSave(cache); } catch (e) { console.error('sqlite persist failed:', e.message); }
  } else {
    // Debounced async save (routes stay sync).
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { mysqlSaveAll(cache).catch((e) => console.error('mysql persist failed:', e.message)); }, 200);
  }
}

function flush() {
  // For tests/scripts: force immediate save.
  if (DIALECT === 'sqlite') { if (cache) sqliteSave(cache); return Promise.resolve(); }
  if (cache) return mysqlSaveAll(cache);
  return Promise.resolve();
}

function all(col) { return read()[col] || []; }
function find(col, fn) { return all(col).filter(fn); }
function findById(col, id) { return all(col).find((r) => String(r.id) === String(id)) || null; }

function insert(col, obj) {
  const db = read();
  const row = Object.assign({}, obj);
  if (!row.id) row.id = uid(col.slice(0, 3));
  if (!row.created_at) row.created_at = new Date().toISOString();
  db[col].push(row);
  persist();
  return row;
}

function update(col, id, patch) {
  const db = read();
  const i = db[col].findIndex((r) => String(r.id) === String(id));
  if (i === -1) return null;
  db[col][i] = Object.assign({}, db[col][i], patch);
  persist();
  return db[col][i];
}

function remove(col, id) {
  const db = read();
  const i = db[col].findIndex((r) => String(r.id) === String(id));
  if (i === -1) return false;
  db[col].splice(i, 1);
  persist();
  return true;
}

function addAudit(entry) {
  try { insert('audit_log', Object.assign({ created_at: new Date().toISOString() }, entry)); } catch (e) {}
}

async function health() {
  if (DIALECT === 'sqlite') {
    try { sqliteOpen().prepare('SELECT 1 AS ok').get(); return { dialect: 'sqlite', ok: true, file: SQLITE_FILE }; }
    catch (e) { return { dialect: 'sqlite', ok: false, error: e.message }; }
  }
  try { await mysqlPoolGet(); const p = mysqlPool; await p.query('SELECT 1 AS ok'); return { dialect: 'mysql', ok: true, database: mysqlConfig().database }; }
  catch (e) { return { dialect: 'mysql', ok: false, error: e.message }; }
}

module.exports = {
  read, persist, flush, all, find, findById, insert, update, remove, uid, addAudit,
  dialect: DIALECT, health, DB_FILE: DIALECT === 'sqlite' ? SQLITE_FILE : undefined,
};
