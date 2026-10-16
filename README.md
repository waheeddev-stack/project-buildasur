# SlotSync — Clash-Free College Timetable Generator

MERN monorepo with **separate** `backend/` and `frontend/` (per PRD v1.0).

- **backend/** — Node + Express REST, Zod, JWT (15m access + 7d httpOnly refresh), JSON file store for local dev + `prisma/schema.prisma` for PostgreSQL prod, backtracking solver with forward-checking, async jobs.
- **frontend/** — React 18 + Vite, Router, TanStack Query, Zustand, Framer Motion, glass-minimal UI.

## Quick start

```powershell
# 1. backend
cd backend
cp .env.example .env   # Windows: Copy-Item .env.example .env
npm install
npm start              # http://localhost:4000, health: /api/health

# 2. frontend (new terminal)
cd ../frontend
npm install
npm run dev            # http://localhost:5173
```

Demo logins (seeded):
- `admin@slotsync.local / admin12345678`
- `hod.cse@slotsync.local / hod12345678`
- `teacher1@slotsync.local / teach12345678`
- `student1@slotsync.local / stud12345678`

## Flow
1. Login → Dashboard
2. Setup wizard (`/setup`) or `POST /api/seed` (admin)
3. Generate (`/generate`) → polls `GET /api/jobs/:id`
4. Grid (`/timetable/:id`) — Batch/Teacher/Room views, drag-drop with validation, lock, publish, export CSV/ICS
5. Today (`/today`) — mobile view

## Prod DB
`backend/prisma/schema.prisma` is PostgreSQL-ready with `UNIQUE(timetable,slot,teacher/room/batch)` anti-clash constraints. Point `DATABASE_URL` at Postgres and run `prisma migrate deploy`.

See `PRD Clash-Free College Timetable Generator.md` for spec.
