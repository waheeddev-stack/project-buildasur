# SlotSync Backend

Clash-Free College Timetable Generator — Node.js + Express REST API.

- **SQLite (default):** `data/slotsync.sqlite` via built-in `node:sqlite`, zero-config. Old `data/db.json` auto-migrates on first boot.
- **MySQL (local):** MySQL 9.x, same API — switch with `DB_DIALECT=mysql`. Tables `records` + `meta` auto-created.
- **TiDB Cloud:** managed, MySQL-compatible — provision with `npm run tidb:setup` (see below).
- `prisma/schema.prisma` documents the relational schema for reference.

## Run — SQLite (default)

```powershell
cd R:\mernstack\backend
Copy-Item .env.example .env
npm install
npm start
# verify
curl http://localhost:4000/api/health
# -> { ok:true, db:{ dialect:"sqlite", ok:true } }
```

## Run — MySQL local

```powershell
# 1. create db + user (once, in MySQL):
# CREATE DATABASE slotsync CHARACTER SET utf8mb4;
# -- use existing root or: CREATE USER 'slotsync'@'localhost' IDENTIFIED BY 'secret'; GRANT ALL ON slotsync.* TO 'slotsync'@'localhost';

# 2. backend .env:
# DB_DIALECT=mysql
# MYSQL_HOST=localhost
# MYSQL_PORT=3306
# MYSQL_USER=root
# MYSQL_PASSWORD=<your-password>
# MYSQL_DATABASE=slotsync

$env:DB_DIALECT="mysql"
npm start
npm run db:health
```

## Provision — TiDB Cloud

```powershell
# .env (from TiDB Cloud console → Connect → MySQL client):
# TIDB_HOST=gateway01.<region>.prod.aws.tidbcloud.com
# TIDB_PORT=4000
# TIDB_USER=<prefix>.root
# TIDB_PASSWORD=<password>
# TIDB_DATABASE=slotsync

npm run tidb:setup
```

Creates the database + `records`/`meta` tables over TLS and loads the demo rows.
Re-running replaces the rows. To run the API against TiDB Cloud, set
`DB_DIALECT=mysql` and copy the `TIDB_*` values into the matching `MYSQL_*` vars.

- `npm run dev` — auto-reload (`node --watch`)
- `npm run seed` — reseed demo data (or `POST /api/seed` as admin)
- Default port `4000` (`PORT` env). CORS allows `FRONTEND_URL` (default `http://localhost:5173`).

## Demo accounts (seeded)

| Email | Password | Role |
|---|---|---|
| admin@slotsync.local | admin12345678 | admin |
| hod.cse@slotsync.local | hod12345678 | hod (CSE) |
| teacher1@slotsync.local | teach12345678 | teacher |
| student1@slotsync.local | stud12345678 | student |

Passwords hashed with bcryptjs, min 10 chars. JWT access 15m + refresh in httpOnly cookie 7d.

## Key endpoints

- `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/me`
- CRUD `GET/POST/PUT|PATCH/DELETE /api/teachers /api/rooms /api/subjects /api/batches /api/assignments`
- `GET /api/departments` (read-only); teacher `department_id` accepts an id or a name
- `GET,PUT /api/time-grid`
- `POST /api/timetables/generate` → `{jobId}`, `GET /api/jobs/:id`
- `GET /api/timetables`, `GET /api/timetables/:id?vie w=batch|teacher|room&filter=id`
- `PATCH /api/sessions/:id`, `POST /api/timetables/:id/publish|snapshot|lock-sessions`
- `GET /api/timetables/:id/export?format=csv|ics` (pdf → 501 in v1)
- `GET /api/rooms/free?day=&period=`, `GET /api/audit-log`, `POST /api/seed` (admin)
- AI stubs (off by default, `AI_ENABLED=false`): `POST /api/ai/rules/parse|explain|ask`, `GET /api/ai/status`
