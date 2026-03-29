# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Athlete Pro is a Progressive Web App (PWA) for PPL (Push/Pull/Legs) workout tracking with an integrated Claude AI coach. Built with vanilla JavaScript (no frameworks), Node.js/Express backend, and IndexedDB for offline-first data storage.

## Development Commands

**Local development (two modes):**

1. **Static mode** (frontend only, no AI coach):
   - `python -m http.server 8080` or use VS Code Live Server
   - Use when you don't need `/api/*` endpoints

2. **Full mode** (frontend + backend):
   - `npm install` - Install dependencies
   - `cp .env.example .env` - Create environment file
   - `npm start` - Start server on port 3000 (or PORT env var)
   - `npm run dev` - Start with auto-reload (--watch)
   - `npm run start:3100` / `npm run dev:3100` - Use port 3100

**Code quality:**
- `npm test` - Run Node.js tests
- `npm run lint` - Run ESLint
- `npm run format` - Format with Prettier
- `npm run format:check` - Check formatting without changes

**Pre-commit checks (run before committing):**
```bash
npm run format && npm run lint && npm test
```

## Architecture

### Frontend Structure

**Store/View Pattern** - All major features follow this split:
- `*.store.js` - State management, data layer, business logic
- `*.view.js` - DOM rendering, event handlers, UI updates

**Lazy Loading** - Heavy modules are loaded on-demand:
- `app.js` imports core modules (db, shell, dashboard, timer)
- Workout, Profile, Analytics, BodyStats are lazy-loaded via dynamic `import()`
- Functions like `_loadWorkout()`, `_loadProfile()` handle lazy initialization

**Module System:**
- Frontend uses ES Modules (`import`/`export`)
- Backend uses CommonJS (`require`/`module.exports`)
- Bridge pattern: `app.js` exposes modules to `window` for `onclick=""` handlers

### Backend Structure

**Express Server** (`server.js`):
- Serves static files from root directory
- Mounts API routes at `/api` prefix
- Routes defined in `routes/` directory (suffix-only paths in route files)

**API Endpoints:**
- `POST /api/coach` - Claude AI streaming responses (requires `ANTHROPIC_API_KEY`)
- `GET /api/supabase-status` - Optional Supabase integration check
- `GET /api/firebase-config` - Optional Firebase config

### Data Layer

**IndexedDB** (`js/db.js`) - Primary storage with 5 object stores:
- `workouts` - Completed workout sessions (indexed by timestamp, type)
- `oneRM` - Estimated 1RM per exercise
- `bodyMetrics` - Weight/height/BMI over time
- `events` - Audit log
- `settings` - Key-value preferences

**Promise-based API:**
```javascript
await DB.workouts.add(record);
await DB.workouts.getAll();
await DB.oneRM.get(exerciseName);
```

### Navigation & Shell

**Navigation** (`js/shell.js`):
- `Nav.go(screenId)` - Switch between screens (s-home, s-train, s-stats, s-body, s-profile)
- Lazy-loads screen modules on first navigation
- Manages active state for nav buttons and screen visibility

**Toast Notifications:**
- `Toast.show(msg, type, duration)` - Types: success, error, info

## Design System

- Primary accent: #00c86e (Forest Emerald)
- Workout type colors:
  - Push: Indigo #6366f1
  - Pull: Cyan #06b6d4
  - Legs: Amber #f59e0b
- Key components: Set Logger, Rest Timer, Muscle Split visualization
- No 1px borders — use surface color shifts for depth
- Full design system documented in DESIGN.md (Vantablack Luxury theme)
- Mobile-first, @media (min-width: 600px) for desktop

## Key Conventions

**Security:**
- XSS prevention: Use `bsEsc()` function when converting textContent to innerHTML
- API keys: Never expose on client side - all AI calls go through backend

**Canvas Rendering:**
- Always multiply dimensions by `devicePixelRatio` for sharp rendering on high-DPI screens

**Haptics:**
- Use `navigator.vibrate?.([15, 50, 15])` for tactile feedback

**No frameworks:**
- Vanilla JavaScript only - no jQuery, React, Vue, etc.
- Express routes mounted at `/api`, suffix only in route files

## Environment Variables

All optional unless using the related feature:
- `PORT` - Server port (default: 3000)
- `ANTHROPIC_API_KEY` - Required for AI coach feature
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` - Optional Supabase integration
- `FIREBASE_*` - Optional Firebase integration

## PWA Features

- Service Worker (`sw.js`) handles offline caching and fallback
- Manifest (`manifest.json`) defines app metadata and icons
- Install prompt available on Chrome (mobile/desktop)
- Test: DevTools → Application → Manifest

## Testing Strategy

- **Smoke tests** (`test/smoke.test.js`) - Basic server health checks
- **PWA tests** (`test/pwa.test.js`) - Service worker and manifest validation
- **Performance tests** (`test/perf.test.js`) - Load time and bundle size checks
- Tests use Node.js built-in test runner (no external framework)

## Common Pitfalls

1. **Service Worker caching**: Clear cache in DevTools when testing SW changes
2. **IndexedDB versioning**: Increment `DB_VERSION` in `db.js` when changing schema
3. **Module loading order**: Core modules must load before lazy modules reference them
4. **onclick handlers**: Functions must be exposed on `window` object in `app.js`
5. **Canvas DPI**: Always multiply by `devicePixelRatio` for sharp rendering
6. **API routes**: Route files use suffix-only paths (`/coach` not `/api/coach`)
7. **ES Module vs CommonJS**: Frontend uses `import/export`, backend uses `require/module.exports`

## Current State

**Milestone 1.0 — Elite Foundation: ✅ COMPLETE**

- Phase 1 (Architecture) ✅ Complete
- Phase 2 (Performance, Lighthouse 97) ✅ Complete
- Phase 3 (Design System, WCAG AA) ✅ Complete
- Phase 4 (AI Autopilot) ✅ Complete + Verified (21/21 tests)

**AI Autopilot Features:**
- AI program generation (auto for new users + on-demand)
- Post-workout adaptive load recommendations
- In-workout AI bubble with chat overlay
- Progressive overload with plateau detection

See `.planning/STATE.md` for full details.

## Project-Specific Rules

- Не читай .planning/phases/01-* и 02-* без явной просьбы (завершены)
- Не читай .planning/codebase/* без необходимости (1800 строк)
- STATE.md — единственный вход в контекст проекта
- Язык общения: русский или английский по контексту
