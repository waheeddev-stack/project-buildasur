# SlotSync Frontend

Gen Z glass-minimal UI for the Clash-Free College Timetable Generator. Dark mode default, one violet→pink gradient, Plus Jakarta Sans.

## Stack

React 18 + Vite · React Router · TanStack Query · Zustand · Framer Motion.
Drag-and-drop is HTML5 `draggable` + click-to-move fallback (keyboard accessible) — no dnd-kit in v1, per spec.

## Setup

```powershell
npm install
npm run dev     # http://localhost:5173
npm run build   # production build
npm run preview # preview the build
```

Copy `.env.example` to `.env` if you need a different API URL:

```
VITE_API_URL=http://localhost:4000
```

The dev server also proxies `/api` → `http://localhost:4000` (see `vite.config.js`).

## Screens

| Route | Screen |
|---|---|
| `/login` | Glass login card + demo creds buttons |
| `/` | Dashboard: 3 stat tiles, last timetable, Generate CTA |
| `/setup` | 5-step wizard: Time Grid → Teachers → Rooms → Subjects+Batches → Assignments |
| `/generate` | Big gradient button, live `/api/jobs/:id` polling, checklist, score, confetti burst on 0 conflicts |
| `/timetable/:id?` | Grid with Batch/Teacher/Room switcher, drag-drop sessions, conflict panel, lock, snapshot, publish, CSV/ICS export, share link |
| `/today` | Mobile-first Today card + swipeable week view |

Press `Ctrl/Cmd + K` anywhere for the jump-to-batch/teacher/room palette.

## Backend contract (PRD §7.4)

Master data: `GET/POST /api/teachers /rooms /subjects /batches /assignments`, `PUT /api/time-grid`, `POST /api/timetables/generate`, `GET /api/jobs/:id`, `GET /api/timetables/:id`, `PATCH /api/sessions/:id`, `POST /api/timetables/:id/publish`, `GET /api/timetables/:id/export?format=csv|ics`, auth at `/api/auth/*`.

All calls use `fetch` with `credentials: include` + `Authorization: Bearer <accessToken>`; on 401 the client tries `POST /api/auth/refresh` once and retries. If the API is unreachable every screen shows a **“Start backend on :4000”** empty state — never a blank screen.

## Design tokens

- bg `#0B0B12` dark / `#F7F7FB` light · glass `rgba(255,255,255,0.06)` + blur 14px + `rgba(255,255,255,0.14)` border + 20px radius
- ONE accent gradient violet `#8b5cf6` → pink `#ec4899`, primary action only
- 8px grid, subject dots (muted colors), human microcopy
- Grid collapses to day cards under 768px · `prefers-reduced-motion` respected · solid fallback where `backdrop-filter` is missing
