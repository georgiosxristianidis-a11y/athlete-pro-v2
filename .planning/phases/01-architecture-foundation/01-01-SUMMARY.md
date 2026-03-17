---
phase: 01-architecture-foundation
plan: "01"
subsystem: api
tags: [express, node, anthropic, routing, refactor]

# Dependency graph
requires: []
provides:
  - lib/anthropicClient.js — shared Anthropic SDK singleton
  - routes/coach.js — POST /api/coach SSE streaming handler
  - routes/integrations.js — GET /api/supabase-status and GET /api/firebase-config handlers
  - server.js — thin entry point (23 lines) mounting route modules
affects: [02-performance-reliability, 04-ai-autopilot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Express Router modules mounted at /api prefix in server.js
    - Singleton pattern for shared SDK client in lib/
    - server.js as pure entry point with no business logic

key-files:
  created:
    - lib/anthropicClient.js
    - routes/coach.js
    - routes/integrations.js
  modified:
    - server.js

key-decisions:
  - "Route modules use router.get/post with path suffix only — /api prefix applied at mount point in server.js"
  - "Anthropic client is a module-level singleton in lib/anthropicClient.js — one instance shared across all route handlers"
  - "server.js exports { app, startServer } for testability while guarding startServer with require.main === module"

patterns-established:
  - "Route files pattern: 'use strict', express.Router(), business logic, module.exports = router"
  - "Shared clients pattern: lib/ directory for singleton service clients"

requirements-completed: [ARCH-4]

# Metrics
duration: 10min
completed: 2026-03-17
---

# Phase 1 Plan 01: Server Refactor — Split server.js into routes/ + lib/ Summary

**Express monolith server.js (169 lines) split into thin entry point (23 lines) plus routes/coach.js, routes/integrations.js, and lib/anthropicClient.js singleton**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-17T00:00:00Z
- **Completed:** 2026-03-17T00:10:00Z
- **Tasks:** 5 (4 implementation + 1 smoke test)
- **Files modified:** 4

## Accomplishments

- Created `lib/anthropicClient.js` exporting a shared Anthropic SDK singleton initialized from `ANTHROPIC_API_KEY`
- Extracted all route handlers from `server.js` into dedicated Express Router modules (`routes/coach.js`, `routes/integrations.js`)
- Reduced `server.js` from 169 lines to 23 lines — pure entry point with no business logic
- All three API endpoints verified responding correctly after refactor

## Task Commits

Each task was committed atomically:

1. **Task 01-01-01: Create lib/anthropicClient.js** - `6ae9029` (feat)
2. **Task 01-01-02: Create routes/integrations.js** - `027a780` (feat)
3. **Task 01-01-03: Create routes/coach.js** - `2aaaa98` (feat)
4. **Task 01-01-04: Rewrite server.js as thin entry point** - `f4d469d` (refactor)
5. **Task 01-01-05: Smoke test** - verified (no commit — verification only)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `lib/anthropicClient.js` - Anthropic SDK singleton, exports client instance
- `routes/coach.js` - POST /coach SSE streaming handler + _buildSystemPrompt helper
- `routes/integrations.js` - GET /supabase-status and GET /firebase-config handlers
- `server.js` - Rewritten as thin entry point: configures express, mounts route modules, exports app

## Decisions Made

- Route files use path suffix only (`/coach`, `/supabase-status`, `/firebase-config`) — the `/api` prefix is applied once at mount in server.js via `app.use('/api', ...)`. This avoids prefix duplication.
- `lib/anthropicClient.js` holds the SDK singleton at module load time, meaning it is instantiated once per process and shared via Node.js module cache.
- `server.js` exports `{ app, startServer }` enabling programmatic use and future testing without starting a live server.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Backend structure is now modular and maintainable
- Route modules can be independently modified, extended, or tested
- `lib/` directory is ready for additional shared utilities (e.g., supabase client, logger)
- Ready for Phase 1 Plan 02 and beyond

---
*Phase: 01-architecture-foundation*
*Completed: 2026-03-17*

## Self-Check: PASSED

- lib/anthropicClient.js — FOUND
- routes/coach.js — FOUND
- routes/integrations.js — FOUND
- server.js — FOUND
- .planning/phases/01-architecture-foundation/01-01-SUMMARY.md — FOUND
- Commit 6ae9029 — FOUND
- Commit 027a780 — FOUND
- Commit 2aaaa98 — FOUND
- Commit f4d469d — FOUND
