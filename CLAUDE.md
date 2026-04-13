# CLAUDE.md — Athlete Pro (Frozen Project)

> ⚠️ Этот проект заморожен. Код рабочий, но активная разработка ведётся в **FIT ELITE**.
> Открывай только для: тестирования, заимствования кода/фич, или возобновления работы.

## Stack

- Frontend: Vanilla JS (ES Modules), no frameworks
- Backend: Express/Node.js (CommonJS)
- DB: IndexedDB (offline-first) + optional Supabase/Firebase
- AI: Claude Opus via SSE (`POST /api/coach`)
- PWA: Service Worker + manifest

## Run

```bash
npm install
cp .env.example .env   # заполни ANTHROPIC_API_KEY
npm run dev             # http://localhost:3000 (auto-reload)
```

## Architecture

**Store/View pattern** — каждый модуль разделён:
- `*.store.js` — state, data, business logic
- `*.view.js` — DOM, events, UI

**Backend**: `server.js` → `routes/coach.js` + `routes/integrations.js`

**Navigation**: `shell.js` → `Nav.go('s-home')` переключает экраны

## Key Files

| File | What |
|------|------|
| `server.js` | Express entry, static + API |
| `js/app.js` | Frontend entry, lazy loading |
| `js/db.js` | IndexedDB layer (5 stores) |
| `js/workout.store.js` | Workout state + logic |
| `js/claude.store.js` | AI coach state |
| `exercises-library.json` | 170 exercises (85KB) |
| `DESIGN.md` | Full design system spec |
| `ROADMAP_elite_athlete-pro.md` | 8-phase plan |

## Design

- Primary: #00c86e (Forest Emerald) — НЕ #F2CA50 из DESIGN.md (DESIGN.md = Vantablack theme)
- Push: #6366f1 / Pull: #06b6d4 / Legs: #f59e0b
- No 1px borders — surface color shifts only
- Mobile-first, 600px breakpoint

## Rules

- Vanilla JS only — no React/Vue/jQuery
- API keys через backend proxy, никогда на фронте
- `bsEsc()` для XSS prevention
- Canvas: multiply by `devicePixelRatio`
- Route files: suffix only (`/coach` not `/api/coach`)

## Status

**Milestone 1.0 — COMPLETE** (March 2026)
- Phase 1: Architecture ✅
- Phase 2: Performance (Lighthouse 97) ✅
- Phase 3: Design System (WCAG AA) ✅
- Phase 4: AI Autopilot (21/21 tests) ✅

See `ROADMAP_elite_athlete-pro.md` for future plans.
