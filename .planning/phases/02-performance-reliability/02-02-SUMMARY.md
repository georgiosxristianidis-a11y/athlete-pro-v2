---
phase: 02-performance-reliability
plan: 02
subsystem: database
tags: [indexeddb, performance, lazy-loading, dynamic-import, dashboard]

# Dependency graph
requires:
  - phase: 01-architecture-foundation
    provides: ES Module structure, db.js Workouts/OneRM stores, analytics.view.js as named export
provides:
  - Pure aggregate functions weeklyVolumeFrom, monthlyVolumeFrom, monthlyCountFrom, pplTonnageFrom in db.js
  - Refactored Dashboard.load() with 2 IDB transactions instead of 6
  - Lazy-loaded analytics.view.js via dynamic import() on first Stats navigation
affects: [03-design-system, 04-ai-autopilot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure aggregate functions accepting pre-fetched arrays (compute in-memory, zero IDB)
    - Dynamic import() with window.* guard for lazy module loading
    - Boot-critical vs deferred module distinction (Claude FAB = static, Analytics = lazy)

key-files:
  created: []
  modified:
    - js/db.js
    - js/dashboard.js
    - js/app.js
    - js/shell.js

key-decisions:
  - "Pure aggregate helpers as named exports alongside DB object — no IDB, accept pre-fetched list"
  - "Existing Workouts.weeklyVolume/monthlyVolume/monthlyCount/pplTonnage preserved for analytics.store.js compatibility"
  - "Claude module stays static — renderFAB() is boot-critical; Heatmap.compute() already deferred to first Claude.open()"
  - "window.Analytics guard in shell.js prevents re-importing on repeat Stats navigation"

patterns-established:
  - "Pre-fetch once, derive all stats in-memory: call getAll() once, pass list to pure helpers"
  - "Lazy import pattern: async handler + !window.X guard + dynamic import() + window bridge inside handler"

requirements-completed: [PERF-1, PERF-2]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 2 Plan 02: Dashboard DB Coalescing + Analytics Lazy Load Summary

**Dashboard IDB transactions cut from 6 to 2 via pure aggregate helpers; analytics.view.js deferred from startup to first Stats navigation via dynamic import()**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-20T19:56:33Z
- **Completed:** 2026-03-20T20:00:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Dashboard.load() now makes exactly 2 IndexedDB transactions (workouts + oneRM), down from 6 — all derived stats computed in-memory from the single workouts array
- Four pure aggregate functions added to db.js as named exports: weeklyVolumeFrom, monthlyVolumeFrom, monthlyCountFrom, pplTonnageFrom — no IDB access, zero side effects
- analytics.view.js removed from static imports in app.js — no longer parsed/evaluated at startup, saving module parse time on every cold boot
- Dynamic import() in shell.js s-stats handler loads analytics.view.js on first Stats visit; window.Analytics guard prevents re-importing on repeat visits
- Claude module intentionally kept static (renderFAB() runs at boot line 81); Heatmap.compute() was already deferred to first Claude.open() — PERF-2 for AI module already satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pure aggregate functions to db.js and refactor Dashboard.load()** - `44a91d2` (feat)
2. **Task 2: Lazy-load analytics module on first Nav.go('s-stats')** - `d42545b` (feat)

## Files Created/Modified

- `js/db.js` - Added 4 pure aggregate exported functions after Workouts object, before OneRM object
- `js/dashboard.js` - Updated import to include new pure helpers; refactored Promise.all from 6 to 2 calls
- `js/app.js` - Removed static `import { Analytics }` and `window.Analytics = Analytics` bridge
- `js/shell.js` - Replaced s-stats handler with async lazy-import pattern using dynamic import()

## Decisions Made

- Pure aggregate functions are standalone named exports (not methods on Workouts) — keeps IDB methods and pure helpers orthogonal, avoids confusing the DB interface
- Existing `Workouts.weeklyVolume()` etc. preserved intact — analytics.store.js calls these directly via its own getAll(); removing them would break analytics
- Claude/Heatmap module stays static because `Claude.renderFAB()` is called at line 81 in app.js boot sequence — making it lazy would require restructuring boot order (out of scope)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both tasks completed on first attempt with all verification checks passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PERF-1 (dashboard IDB coalescing) and PERF-2 (analytics lazy load) both satisfied
- db.js pure aggregate pattern is available for any future module that needs in-memory computation from a pre-fetched workout list
- Ready for remaining Phase 2 plans (error boundaries, PWA/offline reliability, etc.)

---
*Phase: 02-performance-reliability*
*Completed: 2026-03-20*
