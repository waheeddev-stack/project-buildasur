# PRD: Clash-Free College Timetable Generator

**Working name:** SlotSync **Stack:** React JS · Node JS (Express) · SQL (PostgreSQL) · AI via free NVIDIA NIM / OpenRouter models **Design language:** Gen Z glass-minimal (clean layouts, frosted accents, one neon gradient) **Status:** Draft v1.0

## 1. Overview

College timetables are still built by hand in spreadsheets. That works until it doesn't: a teacher is booked in two rooms at the same hour, a lab is double-booked, or a batch has two lectures at the same time. Fixing one clash usually creates another.

SlotSync is a web app where an admin enters teachers, rooms, subjects and batches once, hits **Generate**, and gets a complete weekly timetable with **zero hard conflicts**. Everyone else (teachers, students) gets a clean, shareable view that looks like it belongs on their phone, not in a 2009 ERP.

## 2. Problem Statement

Manual timetabling causes:

- **Teacher clashes:** one teacher assigned to two classes in the same slot.
- **Room clashes:** one room (or lab) used by two classes at once.
- **Batch clashes:** one class/batch has two lectures in the same slot.
- **Slow rework:** a single leave or room closure means redoing large parts of the sheet.
- **Poor visibility:** students and teachers get PDFs or screenshots that are outdated the next day.

## 3. Goals and Non-Goals

### Goals

1. Generate a full weekly timetable with **0 hard-constraint violations** whenever a valid solution exists.
2. Block any manual edit that would create a clash, and explain why in plain language.
3. Generation time under 30 seconds for a mid-size college (see Section 9).
4. A UI so good looking that students actually open it daily.
5. Easy re-generation after changes (teacher leave, room unavailable).

### Non-Goals (v1)

- Exam seating or exam timetables
- Attendance, grading or payroll
- Native mobile apps (responsive web only)
- Multi-campus / multi-college tenancy

## 4. Users and Personas

| Persona | Needs |
| --- | --- |
| **Admin / Timetable Coordinator** | Enter data fast, generate, tweak, publish, handle last-minute changes, manage HODs |
| **HOD (Head of Department)** | Manage every teacher in their department (invite, edit, deactivate, approve availability), review and approve the department timetable |
| **Teacher** | See own schedule, request unavailable slots, get notified of changes |
| **Student** | See own batch timetable on phone, know room and teacher at a glance |

## 5. Core Concepts and Definitions

- **Slot:** a day + period pair (e.g. Mon, Period 3).
- **Session:** one scheduled meeting of a subject for a batch, taught by a teacher in a room at a slot.
- **Batch:** a group of students who attend lectures together (e.g. CSE Sem 3 Div A). Labs may split a batch into sub-batches.
- **Hard constraint:** must never be violated.
- **Soft constraint:** preferred; violated only when needed, and scored.

## 6. Functional Requirements

### 6.1 Data Management (CRUD + bulk import)

| ID | Requirement | Priority |
| --- | --- | --- |
| F1 | Manage **Teachers** (name, department, max hours/day, max hours/week, unavailable slots) | P0 |
| F2 | Manage **Rooms** (name, capacity, type: lecture hall / lab / seminar) | P0 |
| F3 | Manage **Subjects** (code, name, type: theory / lab, weekly sessions, session length in periods) | P0 |
| F4 | Manage **Batches** (program, semester, division, strength) | P0 |
| F5 | **Assignments:** link subject + batch + teacher (and required room type) | P0 |
| F6 | Configure **time grid:** working days, periods per day, period timings, break slots | P0 |
| F7 | Bulk import via CSV with validation and error report | P1 |

### 6.2 Conflict Rules

**Hard constraints (never violated):**

1. A **teacher** has at most one session per slot.
2. A **room** hosts at most one session per slot.
3. A **batch** attends at most one session per slot. Split-lab sub-batches are stored as child batches, and a parent batch never overlaps its own children.
4. A session is only placed in a slot the teacher is **available**.
5. A session is only placed in a room with enough **capacity** and the right **type** (labs in labs).
6. Multi-period sessions (e.g. 2-hour labs) occupy **consecutive** periods and do not cross a break.
7. Every required weekly session is placed (or the run reports exactly which ones could not be).

**Soft constraints (optimised, weighted):**

- Spread a subject across different days (avoid same subject twice a day).
- Avoid long gaps (free periods) in a batch's day.
- Respect teacher max hours per day and avoid very early + very late in one day.
- Prefer the same room for a batch across the day.
- Keep heavy subjects out of the last period.
- Admin-defined preferences (e.g. "no theory after 4 PM on Fridays").

### 6.3 Timetable Generation

| ID | Requirement | Priority |
| --- | --- | --- |
| G1 | One-click **Generate** for a selected term | P0 |
| G2 | Engine guarantees hard-constraint satisfaction or returns a clear **infeasibility report** (e.g. "Dr. Rao needs 22 hrs/week but only 18 slots are available") | P0 |
| G3 | Show **progress** and estimated time while generating (async job) | P0 |
| G4 | Generate **multiple options** (top 3 by soft score) to choose from | P1 |
| G5 | **Lock** specific sessions so re-generation keeps them fixed | P1 |
| G6 | **Partial re-generate** after a change (teacher leave, room closed) without rebuilding everything | P1 |

### 6.4 Manual Editing

| ID | Requirement | Priority |
| --- | --- | --- |
| E1 | Drag-and-drop sessions on the grid | P0 |
| E2 | **Live validation:** valid drop targets glow, invalid ones are blocked with a reason tooltip | P0 |
| E3 | Suggest the nearest valid slots/rooms when a move is blocked | P1 |
| E4 | Undo / redo and version history with named snapshots | P1 |

### 6.5 Views and Publishing

| ID | Requirement | Priority |
| --- | --- | --- |
| V1 | Views by **batch**, **teacher**, **room**, and **day** | P0 |
| V2 | Free-room finder ("which rooms are empty Tue 11 AM?") | P1 |
| V3 | **Publish** a timetable; students and teachers see only published versions | P0 |
| V4 | Export to **PDF**, **CSV** and **iCal (.ics)** | P1 |
| V5 | Shareable read-only link / QR code per batch | P1 |
| V6 | Notifications (email / in-app) when a published timetable changes | P2 |

### 6.6 Login, Roles and Teacher Management

Four roles, enforced on the server for every request. An **HOD** manages every teacher in their own department; an **Admin** manages everything.

| Action | Admin | HOD (own department) | Teacher | Student |
| --- | --- | --- | --- | --- |
| Invite, edit and deactivate teacher accounts | Yes, all | Yes, own department | No | No |
| Edit teacher profile and workload limits | Yes, all | Yes, own department | Own contact details only | No |
| Set or approve teacher availability | Yes, all | Yes, own department | Request for self | No |
| Reset a teacher's password | Yes, all | Yes, own department | Self-service reset | No |
| Assign subjects and batches to teachers | Yes, all | Yes, own department | No | No |
| Edit and approve the department timetable | Yes, all | Yes, own department | No | No |
| View timetables | All | All (other departments read-only) | Own schedule | Own batch, published only |
| Manage rooms, time grid, HODs and Admins | Yes | No | No | No |

**How an HOD manages teachers**

- **Invite:** the HOD adds a teacher (name, email, employee ID, max hours per day and week). The teacher gets a one-time invite link, valid 48 hours, to set their own password. The HOD never sees or sets a password.
- **Edit:** profile, workload limits, subjects taught and unavailable slots, all within their department.
- **Availability requests:** a teacher submits unavailable slots and the HOD approves or rejects. An approved change that touches scheduled sessions lists them and offers a partial re-generate (G6).
- **Deactivate and reactivate:** deactivating a teacher blocks login at once, keeps their history, and lists every scheduled session they leave open so the HOD can reassign or re-generate. Teachers are never hard-deleted.
- **Reset password:** the HOD triggers a reset link to the teacher's email; nobody can read a password.
- **Scope:** an HOD cannot see or change teachers of other departments. A teacher shared across departments is managed by the owning department's HOD; other HODs see only that teacher's busy slots.
- **One HOD per department**, assigned by an Admin. An HOD can also teach and gets sessions like any teacher.

**Login and security**

- Email and password login; passwords hashed with argon2id, minimum 10 characters.
- Short-lived access token (15 minutes) plus a rotating refresh token in an httpOnly, secure cookie (7 days). Logout and deactivation revoke refresh tokens immediately.
- First login forces a password change. Password reset uses a one-time email link valid for 30 minutes.
- Login rate limit: 5 failed attempts in 15 minutes locks the account for 15 minutes and notifies the HOD or Admin.
- Every request checks role and department on the server (queries filtered by the user's department); hiding a button in the UI is never the only protection.
- Audit log for sensitive actions (invite, edit, deactivate, password reset, role change, approval, publish): who, what, when, previous value.
- Optional two-factor login with an authenticator app for Admin and HOD (P2).

### 6.7 AI Assistant (free models)

AI is an assistant, never the scheduler: the solver and database constraints own correctness, and AI only translates, explains and summarises. It runs on free-tier NVIDIA NIM and OpenRouter models (see 7.5).

| ID | Feature | What the AI does | Priority |
| --- | --- | --- | --- |
| A1 | Rules in plain English | Turns "no theory after 4 PM on Fridays" into a structured constraint the admin previews and confirms | P1 |
| A2 | Infeasibility explainer | Rewrites the solver's conflict report in plain words and phrases the top 3 fixes the solver computed | P1 |
| A3 | Smart CSV import | Maps messy column headers to the schema and flags likely typos in names and codes | P2 |
| A4 | Ask SlotSync | Answers "when is my next class?" or "is Room 204 free Tue 11 AM?" from published data, inside the Ctrl/Cmd+K palette. The AI picks an intent and parameters; the backend runs a fixed read-only query, and the AI never writes SQL | P2 |
| A5 | Change notes | Writes a one-line, friendly summary when a published timetable changes | P2 |

## 7. Technical Approach

### 7.1 Architecture

- **Frontend:** React (Vite) + React Router, TanStack Query for data, Zustand for UI state, `dnd-kit` for drag-and-drop, Framer Motion for animations.
- **Backend:** Node.js + Express (REST), Zod for validation, JWT auth.
- **Database:** PostgreSQL (MySQL compatible). Prisma or Knex for migrations and queries.
- **Scheduler engine:** a Node module (worker thread / job queue such as BullMQ) so long runs never block the API.

### 7.2 Scheduling Algorithm

Timetabling is a constraint satisfaction problem. Approach:

1. **Expand** assignments into individual sessions to place.
2. **Order** sessions by difficulty (fewest valid options first: labs, teachers with tight availability, big batches).
3. **Backtracking search with constraint propagation** (forward checking): placing a session removes that slot/room/teacher from competing candidates.
4. If stuck, **backtrack**; if still stuck after a limit, report the conflicting set.
5. **Optimise** soft constraints with local search (simulated annealing / hill climbing with swaps that never break hard rules).
6. **Stretch:** swap or complement with Google OR-Tools CP-SAT via a small Python microservice if scale demands it.

**Database-level safety net:** unique constraints make clashes impossible even if the app has a bug (see schema).

### 7.3 Data Model (core tables)

| Table | Key fields |
| --- | --- |
| `departments` | id, name, hod\_user\_id |
| `users` | id, email, password\_hash, role (admin / hod / teacher / student), department\_id, teacher\_id (set for teachers and for HODs who teach), is\_active, must\_change\_password, failed\_logins, locked\_until, last\_login\_at |
| `auth_tokens` | id, user\_id, type (invite / reset / refresh), token\_hash, expires\_at, used\_at, revoked\_at |
| `audit_log` | id, actor\_user\_id, action, target\_type, target\_id, before, after, created\_at |
| `teachers` | id, name, employee\_id, department\_id, is\_active, max\_hours\_day, max\_hours\_week |
| `teacher_unavailability` | teacher\_id, day, period |
| `availability_requests` | id, teacher\_id, day, period, status (pending / approved / rejected), decided\_by |
| `rooms` | id, name, capacity, type |
| `subjects` | id, code, name, type, sessions\_per\_week, periods\_per\_session |
| `batches` | id, program, semester, division, strength, parent\_batch\_id (set for split-lab sub-batches) |
| `assignments` | id, subject\_id, batch\_id, teacher\_id, required\_room\_type |
| `time_slots` | id, day, period, start\_time, end\_time, is\_break |
| `timetables` | id, term, version, status (draft / published), score, created\_by |
| `sessions` | id, timetable\_id, assignment\_id, slot\_id, room\_id, teacher\_id, batch\_id, is\_locked |

**Anti-clash constraints on `sessions`:**

- `UNIQUE (timetable_id, slot_id, teacher_id)`
- `UNIQUE (timetable_id, slot_id, room_id)`
- `UNIQUE (timetable_id, slot_id, batch_id)`

Any write that would create a teacher, room or batch double-booking fails at the database level, so the guarantee holds no matter which code path wrote it. (Multi-period sessions are stored as one row per period, so these constraints cover them too.)

### 7.4 API Sketch

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Login, returns access token |
| POST | `/api/auth/refresh` | Rotate refresh token, returns a new access token |
| POST | `/api/auth/logout` | Revoke the refresh token |
| POST | `/api/auth/accept-invite` | Set first password from an invite link |
| POST | `/api/auth/forgot-password` and `/api/auth/reset-password` | Email a one-time reset link, then set a new password |
| POST | `/api/departments/:id/teachers` | HOD (own department) or Admin invites a teacher |
| PATCH | `/api/teachers/:id/status` | Deactivate or reactivate a teacher |
| POST | `/api/teachers/:id/reset-password` | HOD or Admin sends a reset link |
| GET, PATCH | `/api/availability-requests` | Teacher submits; HOD approves or rejects |
| CRUD | `/api/teachers`, `/rooms`, `/subjects`, `/batches`, `/assignments` | Master data (HOD limited to own department) |
| PUT | `/api/time-grid` | Configure days, periods and breaks |
| POST | `/api/timetables/generate` | Start generation job, returns `jobId` |
| GET | `/api/jobs/:id` | Progress and result or infeasibility report |
| GET | `/api/timetables/:id` | Fetch a timetable (filter by batch, teacher or room) |
| PATCH | `/api/sessions/:id` | Move a session (validated) |
| POST | `/api/timetables/:id/publish` | Publish |
| GET | `/api/timetables/:id/export` | Export; query `format` is pdf, csv or ics |

### 7.5 AI Layer (free NVIDIA and OpenRouter models)

The AI layer is built for rate limits, model churn and zero trust in model output. Both providers expose OpenAI-compatible APIs, so one client (the `openai` npm package with a swapped `baseURL`) covers both behind a single `LLMProvider` interface.

| Provider | Base URL | Free-tier limits (as of 16 Oct 2026) | Role |
| --- | --- | --- | --- |
| NVIDIA NIM (build.nvidia.com) | `https://integrate.api.nvidia.com/v1` | About 40 requests/min per model, no per-token billing; intended for prototyping and evaluation ([source](https://medium.com/@vignarajj/beyond-the-hype-supercharging-my-local-development-workflow-with-nvidia-nim-and-opencode-free-6ff12d6f851e)) | Primary |
| OpenRouter | `https://openrouter.ai/api/v1` | Models with `:free` IDs: 20 requests/min and 50 requests/day, rising to 1,000/day after $10 of lifetime credits; a negative balance returns 402 even on free models ([docs](https://openrouter.ai/docs/api-reference/limits)) | Fallback, via a list of 2-3 free model IDs |

**Guardrails**

- **AI never writes timetable data.** Only the solver and validated manual edits write `sessions`; every AI output is a suggestion the admin confirms.
- **Structured output only.** Each call asks for JSON, Zod validates it, one retry on invalid output, then a friendly fallback to the manual form.
- **Privacy.** Assume free endpoints are not private: send codes, slots and counts only, never student data, emails or names where a code will do.
- **Quota-aware.** Cache responses by prompt hash and data version, give each college a daily AI budget below OpenRouter's 50/day default, read the remaining count from `GET /api/v1/key` (`free_model_daily_requests`), and back off on 429 using `Retry-After`.
- **Fallback chain.** NVIDIA model, then the OpenRouter free list, then an "AI is resting, use the form" message. Model IDs live in config, not code, so a retired model is a one-line change.
- **Off switch.** A feature flag per college; the whole app works with AI off.
- **Audit.** Log feature, provider, model, latency, status and prompt hash in an `ai_requests` table, with no raw personal data.

| Endpoint | Used by |
| --- | --- |
| `POST /api/ai/rules/parse` | A1 Rules in plain English |
| `POST /api/ai/explain` | A2 Infeasibility explainer, A5 Change notes |
| `POST /api/ai/import/map-columns` | A3 Smart CSV import |
| `POST /api/ai/ask` | A4 Ask SlotSync |
| `GET /api/ai/status` | Quota and provider health for the admin dashboard |

**Delivery and scale.** AI ships in Phase 4, after the engine, behind a flag. NVIDIA's free endpoints are meant for prototyping, so a real college rollout should point the same code at a paid OpenRouter key or a self-hosted NIM container by changing the base URL.

## 8. UI / UX and Design Direction

### 8.1 Vibe

Think *quiet, clean and a little glowy*: a minimal layout where frosted glass is the accent, not the whole outfit. Most of each screen is calm whitespace with one bold gradient moment. It should feel like an app students screenshot and post, not a form-heavy admin tool.

### 8.2 Glass + Minimal Spec

- **80/20 rule:** about 80% of every screen is flat surface and whitespace; frosted glass covers about 20%: nav bar, floating cards, modals and the Generate panel.
- **Background:** near-black `#0B0B12` (dark) or off-white `#F7F7FB` (light), with one soft blurred gradient glow behind the content. No busy blobs or patterns.
- **Glass surfaces:** `background: rgba(255,255,255,0.06)`, `backdrop-filter: blur(14px)`, 1px border `rgba(255,255,255,0.14)`, radius 20px, one soft shadow. At most two glass layers stacked on any screen.
- **Colour:** neutral base plus ONE accent gradient (violet to pink) reserved for the primary action, active states and success moments. Subjects use small muted colour dots, not full tinted tiles.
- **Typography:** one rounded geometric sans (Plus Jakarta Sans or Sora), two weights only, large headings, 14-16px body, generous line height.
- **Layout:** 8px spacing grid, wide margins, no divider lines where whitespace does the job, one primary action per screen.
- **Motion:** quick and restrained (150-250 ms spring): soft hover lift, glow pulse on valid drop zones, gentle shake on invalid drops, one confetti burst when a timetable generates with 0 conflicts. Nothing loops forever.
- **Fallback:** where `backdrop-filter` is unsupported or reduced transparency is on, use a solid semi-opaque surface so text stays readable.

### 8.3 Gen Z Touches (without being cringe)

- Short, human microcopy: "No clashes. We checked twice." / "Dr. Rao is already teaching at 10 AM. Pick another slot?" / "Free period unlocked."
- Emoji-light subject chips, optional streak/"zero-clash" badge for admins.
- "Today" widget: next class, room, teacher, countdown.
- Shareable timetable card (image) styled for stories and group chats.
- Fast, keyboard-friendly, command palette (`Ctrl/Cmd + K`) to jump to any batch, teacher or room.

### 8.4 Key Screens

1. **Login:** one centred glass card on a clean background with a soft glow.
2. **Dashboard:** three quiet stat tiles (teachers, rooms, batches), last generated timetable, one primary action.
3. **Setup wizard:** one step per screen with a thin progress line; flat inputs, glass only on the active step card.
4. **Generate:** large gradient button, live progress, constraint checklist ticking green, result score.
5. **Timetable Grid:** flat grid with soft-tinted session chips, drag-and-drop, view switcher (Batch / Teacher / Room), glass conflict panel on the side.
6. **Infeasibility Report:** short, actionable list of what blocks a solution, with one-click fixes.
7. **Student / Teacher Home:** mobile-first "Today" card and swipeable week view.

### 8.5 Accessibility

- WCAG AA contrast on text over glass (add a darker scrim behind text where needed).
- Never rely on colour alone: use icons and labels for conflict states.
- Full keyboard drag-and-drop alternative; respects `prefers-reduced-motion`.
- Mobile first: grid collapses to a day-by-day swipeable card list under 768px.

## 9. Non-Functional Requirements

| Area | Target |
| --- | --- |
| **Scale (v1)** | Up to 60 teachers, 40 rooms, 40 batches, 6 days × 8 periods |
| **Generation time** | < 30 s typical, < 2 min worst case, async with progress |
| **UI performance** | Grid interactions at 60 fps; initial load < 2.5 s on 4G |
| **Reliability** | 99.5% uptime during term; nightly DB backups |
| **Security** | Hashed passwords (bcrypt/argon2), JWT with refresh, role-based access, input validation, rate limiting |
| **Data integrity** | DB constraints enforce no teacher/room/batch double-booking |
| **Browser support** | Latest Chrome, Edge, Safari, Firefox; iOS Safari and Android Chrome |

### 9.1 Zero-Error Standard

The product promise is no errors, so these checks are release gates, not nice-to-haves.

- **No timetable clashes:** an automated audit re-checks every teacher, room and batch per slot before any publish; a failure blocks publishing.
- **No silent failures:** every failed action shows a plain-language message with the fix (e.g. "Dr. Rao is already teaching at 10 AM"), never a blank screen or a raw error.
- **Safe writes:** every multi-step change runs in one database transaction, so a failure leaves the timetable exactly as it was.
- **Validated input:** every form and CSV import is validated on both client and server, with row-level error reports.
- **Graceful states:** every screen has designed loading, empty and error states, and a global error boundary prevents white screens.
- **Quality gate:** release requires 100% passing tests, zero known P0/P1 bugs and zero console errors in the E2E run.
- **Monitoring:** error tracking (e.g. Sentry) and structured logs on the API and the solver.

## 10. Success Metrics

- **0** hard conflicts in any published timetable (verified by automated audit).
- Timetable creation time drops from days to **under 1 hour** including review.
- **> 90%** of generations succeed on first try (or return an actionable infeasibility report).
- **> 70%** of students open the app at least 3 times a week after launch.
- Admin satisfaction (survey) **≥ 4.5 / 5**.

## 11. Milestones

| Phase | Scope | Duration |
| --- | --- | --- |
| **0. Discovery** | Collect real college data and rules, finalise constraints, design system and wireframes | 1 week |
| **1. Foundation** | Auth, roles, DB schema, master-data CRUD, CSV import, glass UI shell | 2 weeks |
| **2. Engine** | Backtracking solver, hard constraints, infeasibility report, job queue | 2-3 weeks |
| **3. Grid and Editing** | Timetable grid, drag-and-drop with live validation, views, locking | 2 weeks |
| **4. Optimise and Publish** | Soft constraints, multiple options, publish flow, exports | 2 weeks |
| **5. Polish and Launch** | Student/teacher mobile views, animations, accessibility, load testing, pilot with one department | 1-2 weeks |

## 12. Testing Strategy

- **Unit tests:** every hard constraint, solver helpers, validators.
- **Property-based tests:** generate random valid datasets; assert the solver output never double-books a teacher, room or batch.
- **Integration tests:** API + DB constraint behaviour; concurrent edit attempts.
- **E2E (Playwright):** setup, generate, edit, publish flow.
- **Pilot:** run one real department's data side by side with the manual timetable.

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No feasible solution because input data is over-constrained | Frustrated admins | Pre-generation feasibility checks plus a clear, actionable infeasibility report |
| Solver too slow at larger scale | Poor UX | Heuristic ordering, time limits, async jobs, OR-Tools upgrade path |
| Real colleges have odd rules (shared electives, split labs, visiting faculty) | Rework | Discovery phase; flexible constraint model; sub-batch support in schema from day one |
| Glassmorphism hurts readability or performance on low-end phones | Poor adoption | Contrast scrims, solid fallback, limit blur layers, test on budget devices |
| Concurrent edits by multiple admins | Data overwritten | Optimistic locking (version column), DB unique constraints |

## 14. Open Questions

1. Do any subjects share teachers or rooms across departments (shared electives, common labs)?
2. Are sub-batch (split) labs needed in v1?
3. Does the college run different period lengths on different days?
4. Is HOD approval mandatory before publishing?
5. Which notification channels matter most (email, WhatsApp, in-app)?
6. Can a department have more than one HOD? This PRD assumes one HOD per department, who may also teach.

## 15. Future Scope

- Exam timetable and invigilator allocation
- Substitute teacher suggestions when someone is on leave
- Room utilisation analytics and heatmaps
- Native apps with widgets and push notifications
- AI assistant: "Move Friday's DBMS lab to Thursday without breaking anything"
