# SlotSync — Clash-Free College Timetable Generator

SlotSync replaces hand-built spreadsheet timetables with a one-click generator that
produces a full weekly timetable with **zero hard conflicts** (or a plain-language
report explaining exactly what blocks a solution). Admins build the data once, hit
**Generate**, then tweak, publish and share. Students and teachers get a clean,
mobile-first view instead of a PDF from a 2009 ERP.

Monorepo with **separate** `backend/` and `frontend/` (per `PRD Clash-Free College Timetable Generator.md`).

- **backend/** — Node + Express REST, Zod validation, JWT auth, SQLite/MySQL store for local dev, PostgreSQL schema for prod, backtracking solver with forward-checking, async generation jobs.
- **frontend/** — React 18 + Vite, React Router, TanStack Query, Zustand, Framer Motion, glass-minimal UI.

---

## Table of contents

- [Features](#features)
- [Roles and permissions](#roles-and-permissions)
- [AI assistant](#ai-assistant)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [End-to-end flow](#end-to-end-flow)
- [Frontend routes and screens](#frontend-routes-and-screens)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Scheduling engine](#scheduling-engine)
- [Design system](#design-system)
- [Environment variables](#environment-variables)
- [npm scripts](#npm-scripts)
- [Testing and verification](#testing-and-verification)
- [Production database](#production-database)
- [Non-goals and roadmap](#non-goals-and-roadmap)

---

## Features

### Data management (setup)
- **Teachers** — create, **edit and delete** name, department, max hours/day, max hours/week, plus a built-in **availability editor** (tick the unavailable day+period slots).
- **Rooms** — name, capacity, type (`lecture` / `lab` / `seminar`).
- **Subjects** — code, name, type (`theory` / `lab`), weekly sessions, session length in periods.
- **Batches** — program, semester, division, strength; optional parent batch for split-lab sub-batches.
- **Assignments** — link subject + batch + teacher (+ required room type).
- **Time grid** — working days, periods per day, period timings, break periods (admin only). The seeded grid reserves **period 5 (13:00–14:00) as a lunch break on every day**; sessions are never placed there.
- **Accounts** — admins and HODs create, **edit and delete the teacher and student logins** (email, password, role, and optional link to a teacher record or batch). Users sign in with email + password only; the server returns their role.
- Guard rails baked in: unique room names and subject codes, referential checks on assignments, HOD department scoping, and audit logging on every write.
- **One source of truth per role** — everyone (admin, HOD, teacher, student) reads the *same* teachers, rooms and availability lists, so a batch, teacher or room view never disagrees across roles. Writes stay role-scoped; only reads are unified.

### Timetable generation
- **One-click generate** for a term (`POST /api/timetables/generate`) returning a `jobId`.
- **Async jobs** with live progress polling (`GET /api/jobs/:id`) so long runs never block the API.
- **Hard-constraint guarantee** — teacher, room and batch never double-booked; teacher availability respected; room capacity + type enforced; multi-period blocks stay consecutive and never cross a break; every required weekly session placed.
- **Infeasibility report** — when no valid arrangement exists, the solver returns a human-readable report plus the **top 3 fixes** it computed.
- **Soft-constraint optimisation** — spreads subjects across days, reduces gaps in a batch's day, respects teacher daily/weekly caps, and favours sensible placement; results carry a soft `score`.
- **Locking** — lock sessions so re-generation keeps them fixed.

### Manual editing (grid)
- **Drag-and-drop** sessions on the grid, with **click-to-move** and keyboard alternatives.
- **Live validation** — every move is validated server-side; blocked moves return a plain-language reason (e.g. "Prof. Kumar is already teaching at Mon Period 2 (10 AM).") plus **suggested valid slots**.
- **Locked sessions** cannot move until unlocked.

### Views and publishing
- **Batch / Teacher / Room** view switcher with free-text filter.
- **Deep links** — jump from the Ctrl/Cmd+K palette straight to a batch, teacher or room view (`/timetable?batch=ID`).
- **Publish** — a published timetable is audited for clashes first; a failure blocks publishing.
- **Read-only public access** — published timetables are served anonymously for share links and the Today view; drafts stay private.
- **Export** — CSV and iCal (`.ics`). (PDF returns `501` with a "print the CSV" hint.)
- **Snapshot** — copy the current timetable to a new version.

### Student / teacher view
- **Today** (`/today`) — mobile-first day view with a swipeable schedule, next-class card, and batch/teacher filter.
- **Free-room finder** — `GET /api/rooms/free?day=Tue&period=3`.

### UX / platform
- **Bulba chatbot** 🌱 — multilingual, read-only AI assistant (see the AI section).
- **Command palette** (`Ctrl/Cmd + K`) to jump to any batch, teacher or room.
- **Bulbasaur theme** — a leafy green/teal palette with dark and light modes, persisted.
- **Audit log** of sensitive actions (create/update/delete, move, publish, snapshot, generate, seed, login).
- **Responsive** across phones, tablets and desktop: hamburger navigation, 44px touch targets, fluid typography, stacking layouts.
- **Graceful states** — designed loading, empty and error states on every screen, plus a global error boundary that prevents white screens.

---

## Roles and permissions

Server-enforced on every request (never UI-only).

| Action | Admin | HOD (own dept) | Teacher | Student |
| --- | --- | --- | --- | --- |
| Manage teachers / assignments / availability | All | Own department | No | No |
| Manage rooms / subjects / batches / time grid | Yes | No | No | No |
| Manage teacher & student accounts | All | Own department | No | No |
| Generate, edit, publish timetables | Yes | Yes | No | No |
| View teachers / rooms / availability | All | All | All | All |
| View timetables | All | All (read-only for others) | Own schedule | Own batch, published only |
| Seed demo data | Yes | No | No | No |

Auth details: email + password, bcrypt hashing, 15-minute access token + 7-day rotating
refresh token in an httpOnly cookie, account lockout after 5 failed logins in 15 minutes,
and no hard-deletion of teachers who own scheduled sessions (they are deactivated instead).
Admins and HODs can deactivate a login instead of deleting it, and a user can never delete
their own account or manage an admin account.

---

## AI assistant — Bulba 🌱

AI is an **assistant, never the scheduler**: the solver and database constraints own
correctness; AI only reads, translates, explains and summarises. It **works with no keys
at all** via an on-device engine, and upgrades to a hosted multilingual chatbot when you
add a provider key. Nothing here ever writes timetable data.

The floating **🌱 Ask** button (bottom-right, on every signed-in screen) opens **Bulba**,
a multi-turn chatbot with a language switcher (Auto, English, हिन्दी, తెలుగు, தமிழ், বাংলা,
मराठी, Español, Français, Deutsch, العربية, 日本語, 中文, …). It replies in the language you
write in.

| ID | Feature | Endpoint | Status |
| --- | --- | --- | --- |
| A0 | Multilingual chat (Bulba) — hosted provider with on-device fallback | `POST /api/ai/chat` | Live |
| A1 | Rules in plain English → structured availability suggestion (admin previews/confirms) | `POST /api/ai/rules/parse` | Live (hosted + on-device) |
| A2 | Infeasibility explainer (plain words + top fixes) | `POST /api/ai/explain` | Live (hosted + on-device) |
| A3 | Smart CSV import — map messy headers, flag likely typos | `POST /api/ai/import/map-columns` | Planned |
| A4 | Ask SlotSync — natural-language Q&A over the timetable | `POST /api/ai/ask` | Live (on-device) |
| A5 | Change notes — friendly summary when a timetable changes | `POST /api/ai/explain` | Live (hosted + on-device) |
| — | Provider + health for the assistant badge | `GET /api/ai/status` | Live |

**Providers** live in `backend/src/llm.js` and speak the OpenAI-compatible
`/chat/completions` protocol. **A self-hosted server on your VM is primary; any error/timeout/
rate-limit rolls to the next configured provider** (default order
`local → openrouter → google → nvidia`, overridable with `AI_FALLBACK_ORDER`). Only providers
that are configured are in the chain (`local` needs `LOCAL_AI_BASE_URL`; the hosted ones need
a key). When any provider is ready, chat, rules-parsing and explanations all use it; otherwise
the on-device engine handles everything.

| Order | Provider | `AI_PROVIDER` | Default model | Config |
| --- | --- | --- | --- | --- |
| 1 | Local VM *(primary)* | `local` | `local-model` | `LOCAL_AI_BASE_URL` (no key needed) |
| 2 | OpenRouter | `openrouter` | `poolside/laguna-xs-2.1:free` | `OPENROUTER_API_KEY` |
| 3 | Google AI Studio | `google` | `gemini-3.8-flash` | `GEMINI_API_KEY` |
| 4 | NVIDIA NIM | `nvidia` | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` |

Setup: for your own VM, paste your endpoint into `LOCAL_AI_BASE_URL` and set `LOCAL_AI_MODEL`
to the model id it serves. **A bare Cloudflare Tunnel link works as-is** — e.g.
`https://random-words.trycloudflare.com` (the client appends `/v1` for you; a pasted path like
`http://my-vm:11434/v1` is kept unchanged). If the tunnel is behind Cloudflare Access, set
`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` and the service-token headers are added
automatically. Add any hosted keys too, then restart the backend — `AI_PROVIDER=local` and
`AI_FALLBACK_ORDER` are already set. A local server needs no API key unless it enforces one
(`LOCAL_AI_API_KEY`). Swap the OpenRouter model with
`AI_MODEL_OPENROUTER` (e.g. `openrouter/auto`). Keys are never logged or returned to the client.
Each attempt has a 30 s timeout; if every provider fails, the endpoint falls back to the
on-device engine and marks the reply `fallback: true`. The chat response also reports
`provider`, `tried` and `fellBack`.

Guardrails: AI never writes timetable data; the on-device path is deterministic and
offline; the hosted path sends only a compact data digest (codes, names, counts) — no
student PII; and a 30 s timeout protects the UI.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, React Router 6, TanStack Query 5, Zustand 4, Framer Motion 11 |
| Backend | Node.js, Express 4, Zod, jsonwebtoken, bcryptjs, cookie-parser, morgan, cors |
| Database (dev) | `node:sqlite` (default) or MySQL (`mysql2`) via a generic `records` store |
| Database (prod) | PostgreSQL via `backend/prisma/schema.prisma` |
| Solver | Pure-JS backtracking with forward-checking + hill-climbing (`backend/src/solver.js`) |

---

## Repository structure

```
mernstack/
├─ backend/
│  ├─ prisma/schema.prisma      # PostgreSQL schema with anti-clash UNIQUE constraints
│  └─ src/
│     ├─ index.js               # Express app, route mounting, error handler
│     ├─ db.js                  # SQLite/MySQL generic record store (sync API)
│     ├─ auth.js                # JWT, requireAuth/optionalAuth/requireRole, dept scoping
│     ├─ validate.js            # Zod middleware
│     ├─ solver.js              # Timetable engine
│     ├─ ai.js                  # on-device assistant engine (parse/explain/ask)
│     ├─ llm.js                 # multi-provider LLM client (Local VM/OpenRouter/Google/NVIDIA)
│     ├─ seed.js                # Demo data seeder
│     └─ routes/                # auth, users, availability, masters, grid, timetables, jobs, ai, misc
├─ frontend/
│  └─ src/
│     ├─ App.jsx                # Router, auth guards, error boundary, ScrollToTop
│     ├─ api.js                 # fetch wrapper with token refresh
│     ├─ store.js               # Zustand: auth, theme, timetable view
│     ├─ index.css              # Glass-minimal design system
│     ├─ components/            # Layout, SessionChip, StatTile, Assistant (Bulba chat)
│     └─ pages/                 # Login, Dashboard, Setup, Generate, Grid, Today
├─ package.json                 # Workspace scripts
└─ PRD Clash-Free College Timetable Generator.md
```

---

## Quick start

Requirements: Node.js 22+ (uses the built-in `node:sqlite`).

```powershell
# 1. Backend
cd backend
Copy-Item .env.example .env        # macOS/Linux: cp .env.example .env
npm install
npm start                          # http://localhost:4000  (health: /api/health)

# 2. Frontend (new terminal)
cd ../frontend
npm install
npm run dev                        # http://localhost:5173
```

The backend auto-seeds demo data on first run if the database is empty.

From the repo root you can also use the workspace scripts:

```powershell
npm run install:all
npm run dev:backend      # terminal 1
npm run dev:frontend     # terminal 2
```

---

## Demo accounts

Seeded on first run (and by `POST /api/seed` or `npm run seed --prefix backend`):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@slotsync.local` | `admin12345678` |
| HOD (CSE) | `hod.cse@slotsync.local` | `hod12345678` |
| Teacher | `teacher1@slotsync.local` | `teach12345678` |
| Student | `student1@slotsync.local` | `stud12345678` |

The login screen accepts email + password only; the server authenticates the credentials and
returns the user's role. Admin and HOD accounts provision teacher and student logins. The rows
above are seed data for local development — create real accounts for production.

---

## End-to-end flow

1. **Login** → Dashboard (three stat tiles + last-timetable card).
2. **Setup** (`/setup`) — 6-step wizard: time grid, teachers (editable + availability), rooms, subjects + batches, assignments, accounts (teacher/student logins). (Or `POST /api/seed` as admin.)
3. **Generate** (`/generate`) — one button; polls `GET /api/jobs/:id`; on success shows the result and a link to the grid; on failure shows the infeasibility report + top fixes.
4. **Grid** (`/timetable/:id`) — switch Batch/Teacher/Room views, drag-and-drop with live validation, lock, publish, snapshot, export CSV/ICS, share link.
5. **Today** (`/today`) — mobile-first day view of the latest published timetable.

---

## Frontend routes and screens

| Route | Screen | Auth |
| --- | --- | --- |
| `/login` | Login (email + password; role auto-detected) | Public (redirects home if signed in) |
| `/` | Dashboard — stat tiles, last timetable | Required |
| `/setup` | Setup wizard (includes teacher/student account management) | Required |
| `/generate` | Generate + live progress + result/infeasibility | Required |
| `/timetable/:id?` | Timetable grid (latest if no id) | Public (published only) |
| `/today` | Today view | Public (published only) |
| `*` | Redirect to `/` | — |

---

## API reference

All responses use `{ data: ... }` for resources and `{ error, fix }` for problems.
Write routes run through Zod validation and return `400` with a field-level message on bad input.

### Auth — `/api/auth`
| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Log in; returns `{ token, user }` and sets the refresh cookie |
| POST | `/api/auth/refresh` | Rotate refresh token; returns `{ token }` |
| POST | `/api/auth/logout` | Revoke the refresh token, clear the cookie |
| GET | `/api/auth/me-route` | Current user (password hash stripped) |
| GET | `/api/me` | Current user |

### Master data — `/api`
`teachers`, `rooms`, `subjects`, `batches`, `assignments` each support:

| Method | Endpoint | Who |
| --- | --- | --- |
| GET | `/api/{collection}` | Any authenticated user — returns the **same full list for every role** |
| GET | `/api/{collection}/:id` | Any authenticated user |
| POST | `/api/{collection}` | Admin (teachers/assignments also HOD, own dept) |
| PUT / PATCH | `/api/{collection}/:id` | Admin (teachers/assignments also HOD, own dept) |
| DELETE | `/api/{collection}/:id` | Admin (teachers/assignments also HOD, own dept); teachers with sessions are deactivated, not deleted |

### User accounts — `/api/users`
Create and manage the teacher and student logins (email + password + role). Passwords are
bcrypt-hashed and the hash is never returned.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/api/users?role=` | Admin, HOD | List accounts (optional `role` filter) |
| POST | `/api/users` | Admin, HOD | Create a `teacher` or `student` login |
| PUT / PATCH | `/api/users/:id` | Admin, HOD | Edit name, email, role, active flag, or password |
| DELETE | `/api/users/:id` | Admin, HOD | Delete a login (cannot delete self or an admin) |

HODs may only manage accounts in their own department and can never touch admin accounts.

### Availability — `/api`
| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/api/availability` | Any authenticated user | Full unavailability list, identical for every role |
| PUT | `/api/teachers/:id/availability` | Admin, HOD (own dept) | Replace a teacher's unavailable slots with `{ slots: [{ day, period }] }` |

### Time grid
| Method | Endpoint | Who |
| --- | --- | --- |
| GET | `/api/time-grid` | Authenticated |
| PUT | `/api/time-grid` | Admin |

### Timetables & sessions
| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/api/timetables/generate` | Admin, HOD | Start generation; returns `{ jobId }` |
| GET | `/api/jobs/:id` | Authenticated | Job status, progress, result id, infeasibility report |
| GET | `/api/timetables?limit=n` | Public (published only) | List timetables (newest first when `limit` given) |
| GET | `/api/timetables/latest` | Public (published only) | Most recent timetable |
| GET | `/api/timetables/:id` | Public (published only) | Timetable + enriched sessions |
| PATCH | `/api/sessions/:id` | Admin, HOD | Move a session by `slot_id` or `day`+`period` (and/or `room_id`); validated |
| POST | `/api/timetables/:id/publish` | Admin, HOD | Publish after a clash audit |
| POST | `/api/timetables/:id/snapshot` | Admin, HOD | Copy to a new version |
| POST | `/api/timetables/:id/lock-sessions` | Admin, HOD | Lock/unlock sessions |
| GET | `/api/timetables/:id/export?format=csv\|ics` | Public (published only) | Export; `pdf` returns 501 |

### AI — `/api/ai`
| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/ai/rules/parse` | Plain-English rule → structured suggestion (A1) |
| POST | `/api/ai/explain` | Explain an infeasibility report / write change notes (A2, A5) |
| POST | `/api/ai/ask` | Ask SlotSync natural-language Q&A (A4) |
| GET | `/api/ai/status` | Feature flag + provider health |

### Misc
| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/api/rooms/free?day=&period=[&timetableId=]` | Authenticated | Free-room finder |
| GET | `/api/audit-log` | Admin, HOD | Latest 200 audit entries |
| POST | `/api/seed` | Admin | Force re-seed demo data |
| GET | `/api/health` | Public | Service + database health |

---

## Data model

Core collections (dev store collections mirror the PostgreSQL tables):

`departments`, `users`, `teachers`, `teacher_unavailability`, `availability_requests`,
`rooms`, `subjects`, `batches` (with `parent_batch_id` for split labs), `assignments`,
`time_slots`, `timetables`, `sessions`, `jobs`, `audit_log`, `refresh_tokens`.

Anti-clash constraints on `sessions` (enforced in the PostgreSQL schema and audited in-app):

- `UNIQUE (timetable_id, slot_id, teacher_id)`
- `UNIQUE (timetable_id, slot_id, room_id)`
- `UNIQUE (timetable_id, slot_id, batch_id)`

Multi-period sessions are stored as one row per period, so these constraints cover them too.

---

## Scheduling engine

`backend/src/solver.js` implements constraint-satisfaction timetabling:

1. **Expand** assignments into individual sessions to place.
2. **Order** by difficulty (fewest valid start slots first; labs/long sessions, tight availability, big batches).
3. **Backtracking search with forward-checking** (MRV: place the most-constrained session first; placing removes that slot/teacher/room from competitors).
4. **Infeasibility** — early detection (a session with no valid room or no valid start slot) plus a report and top-3 fixes when the search fails or times out.
5. **Optimise soft constraints** with hill-climbing swaps that never break a hard rule.
6. **Flatten** to one row per period, ready for the DB constraints.

Config: `timeLimitMs` (default 25 s), `maxNodes` (default 60,000), and an `onProgress` callback wired to the job record.

---

## Design system

Glass-minimal (PRD §8.2) with a **Bulbasaur palette** 🌱, defined in `frontend/src/index.css`:

- **Background** — deep forest `#08120D` (dark) or mint `#EEFAF1` (light), with one soft blurred green/teal glow.
- **Glass surfaces** — a hint of seafoam `rgba(180,255,214,0.06)`, `backdrop-filter: blur(14px)`, 1px border, 20px radius, one soft shadow; solid fallback where backdrop-filter/reduced-transparency is unsupported.
- **Accent** — a single leaf-green→teal gradient (`#22C55E → #0D9488`) for the primary action, active states and success moments; the brand carries a 🌱 bulb motif.
- **Bulba scene** — an original inline-SVG leaf-creature mascot on lush green mountains (`frontend/src/components/BulbaScene.jsx`): layered misty ridges, pine trees, sun and meadow. Used as the login backdrop and dashboard hero, with the mountain range (`BulbaMountains`) reused as a soft app-wide background layer behind the glass cards. No external image assets — it stays crisp and theme-aware at any size.
- **Type** — Plus Jakarta Sans, 8px spacing grid, large headings, 14–16px body.
- **Motion** — restrained 150–250 ms transitions, one confetti burst on a zero-conflict result; honours `prefers-reduced-motion`.
- **Accessibility** — WCAG-AA contrast with scrims over glass, icon + label (never colour alone) for states, full keyboard alternative for drag-and-drop, 44px touch targets, and a mobile-first layout.

---

## Environment variables

**backend/.env** (see `backend/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `JWT_SECRET` | `dev-secret-change` | Signing secret (change in prod) |
| `AI_ENABLED` | `false` | Legacy flag; the on-device assistant always runs |
| `AI_PROVIDER` | `local` | Primary provider: `local` \| `openrouter` \| `google` \| `nvidia` |
| `AI_FALLBACK_ORDER` | `local,openrouter,google,nvidia` | Order to try providers in; only configured ones are used |
| `LOCAL_AI_BASE_URL` | — | Self-hosted OpenAI-compatible base URL on your VM — enables `local` (no key) |
| `LOCAL_AI_MODEL` | `local-model` | Model id your VM serves |
| `LOCAL_AI_API_KEY` | — | Only if your local server requires a key |
| `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | — | Only if the tunnel is behind Cloudflare Access (added as service-token headers) |
| `OPENROUTER_API_KEY` | — | OpenRouter key (fallback 1) |
| `GEMINI_API_KEY` | — | Google AI Studio key (fallback 2) |
| `NVIDIA_API_KEY` | — | NVIDIA NIM key (fallback 3) |
| `AI_MODEL` | per provider | Primary model override (`AI_MODEL_OPENROUTER` / `AI_MODEL_GOOGLE` / `AI_MODEL_NVIDIA` also work) |
| `AI_BASE_URL` | per provider | Base URL override for the primary `/chat/completions` API |
| `OPENROUTER_SITE_URL` | `http://localhost:5173` | Sent as OpenRouter's `HTTP-Referer` |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `DB_DIALECT` | `sqlite` | `sqlite` or `mysql` |
| `SQLITE_FILE` | `./data/slotsync.sqlite` | SQLite file path |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | — | Used when `DB_DIALECT=mysql` |
| `MYSQL_SSL` | `require` | TLS for managed MySQL; `disable` to turn off |
| `MYSQL_CA` | — | Path to a CA cert for full TLS verification |
| `TIDB_HOST` / `TIDB_PORT` / `TIDB_USER` / `TIDB_PASSWORD` / `TIDB_DATABASE` | — | TiDB Cloud connection (used by `npm run tidb:setup`) |
| `TIDB_CA` / `TIDB_SSL` | — | Optional TLS verification for TiDB Cloud |

**frontend/.env** (see `frontend/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000` | API base URL (dev also proxies `/api` via Vite) |

---

## npm scripts

Root (`package.json`):
| Script | Does |
| --- | --- |
| `npm run install:all` | Install backend + frontend dependencies |
| `npm run dev:backend` | Start the API with `--watch` |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run build` | Build the frontend |
| `npm run start:backend` | Start the API (no watch) |

Backend (`backend/package.json`): `start`, `dev`, `seed`, `db:health`, `db:seed:sqlite`, `db:seed:mysql`, `tidb:setup`.
Frontend (`frontend/package.json`): `dev` (port 5173), `build`, `preview`.

### TiDB Cloud provisioning

TiDB Cloud is a managed, MySQL-compatible database. Copy your connection values from
**Connect → MySQL client** into `backend/.env` (`TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`,
`TIDB_PASSWORD`, `TIDB_DATABASE`), then run the provisioning script:

```powershell
npm run tidb:setup --prefix backend
```

It connects over TLS, creates the `slotsync` database and the `records` + `meta` tables,
and loads the full seed (departments, teachers, rooms, subjects, batches, assignments,
time slots, grid and demo users). It is idempotent — re-running replaces the rows.

To point the running API at TiDB Cloud, set `DB_DIALECT=mysql` and mirror the `TIDB_*`
values into the `MYSQL_*` vars (same host/port/user/password/database), then restart.
TLS is on by default; drop your TiDB CA into `MYSQL_CA` for full verification.

---

## Deployment (Render + Vercel)

The API runs on Render and the SPA on Vercel. They are different sites, so:

**Backend (Render)** — set these environment variables:
| Variable | Value |
| --- | --- |
| `FRONTEND_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` (comma-separate to allow several; `*.vercel.app` previews are allowed automatically) |
| `JWT_SECRET` | A long random string — **do not** ship the default |
| `NODE_ENV` | `production` |

CORS reflects the allowed origin and the refresh cookie is set `SameSite=None; Secure`
in production so it survives the cross-site hop.

**Frontend (Vercel)** — the committed `frontend/.env.production` points the build at
`https://nexadmincontrol.onrender.com`. To change the API host, edit that file or set a
`VITE_API_URL` env var in the Vercel project and redeploy. `frontend/vercel.json` rewrites
all paths to `index.html` for client-side routing.

---

## Testing and verification

- `npm run build --prefix frontend` — production build gate.
- `node --check <file>` — backend syntax gate.
- A live end-to-end smoke run exercises: login → generate → job reaches a terminal status →
  newest-first listing → enriched session payload → blocked move returns a reason + suggestions →
  successful move by `day`+`period` → anonymous draft blocked / published readable → refresh token round-trip.
- A roles/accounts smoke run checks: admin and HOD see the **same** teacher list and availability →
  availability write is visible to the other role → create / edit / login-with-new-password / delete
  a teacher or student account → unauthenticated `/api/users` returns `401` → duplicate email returns `409`.
- An AI smoke run checks: `/api/ai/status` reports `ready:false` with no key and `ready:true` once a
  key is set → `/api/ai/chat` falls back to the on-device engine with `fallback:true` when unconfigured
  → with a provider configured it calls `/chat/completions` and includes the data digest in the system
  prompt → the key is never returned → unauthenticated `/api/ai/chat` returns `401`.
- A lunch-break check confirms period 5 is `13:00–14:00` and `is_break` on all days, and that a
  generated timetable places **zero** sessions in it.
- `GET /api/health` reports the active dialect and connectivity.

The PRD's release gates (see §9.1) call for an automated clash audit before any publish (implemented),
plain-language errors on every failure (implemented), and Zod validation on both client and server.

---

## Production database

`backend/prisma/schema.prisma` targets PostgreSQL with the anti-clash `UNIQUE` constraints on
`sessions`, so a double-booking fails at the database level regardless of code path. To deploy:

```bash
# set DATABASE_URL, then
npx prisma migrate deploy
```

The app's dev store (SQLite/MySQL) exposes the same sync API (`read`/`insert`/`update`/...),
so route code does not change when moving to Prisma/Postgres.

---

## Non-goals and roadmap

**Non-goals for v1** (PRD §3): exam seating/timetables, attendance/grading/payroll, native
mobile apps (responsive web only), multi-campus tenancy.

**Future scope** (PRD §15): exam timetables and invigilator allocation; substitute-teacher
suggestions; room-utilisation analytics and heatmaps; native apps with widgets and push;
full AI move/"ask" workflow ("Move Friday's DBMS lab to Thursday without breaking anything").

See `PRD Clash-Free College Timetable Generator.md` for the full specification.
