---
phase: 01-architecture-foundation
plan: "03"
subsystem: ui
tags: [vanilla-js, es-modules, jsdoc, store-view-pattern, sse, heatmap]

# Dependency graph
requires:
  - phase: 01-architecture-foundation
    provides: ES Modules entry point (app.js), window.* bridge for onclick handlers
provides:
  - js/claude.store.js with MUSCLE_MAP, Heatmap, ClaudeState, fetchCoach (SSE, no DOM)
  - js/claude.view.js with Claude, buildBodySVG, buildLegend (DOM/UI layer)
  - Store/View split pattern for AI coach module
affects:
  - 01-architecture-foundation (plans 04+)
  - 04-ai-autopilot

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Store/View split for UI modules (module-level state, callback-based streaming)
    - JSDoc @param/@returns on all public exported APIs

key-files:
  created:
    - js/claude.store.js
    - js/claude.view.js
  modified:
    - js/app.js
  deleted:
    - js/claude.js

key-decisions:
  - "fetchCoach uses callbacks (onText/onDone/onError) so DOM manipulation stays in view layer"
  - "ClaudeState uses getter/setter accessors instead of plain object to enable future reactivity"
  - "No window bridge needed for buildBodySVG/buildLegend — only called internally from claude.view.js"

patterns-established:
  - "Store pattern: module-level private vars + exported accessor object (ClaudeState)"
  - "View adapter pattern: _doFetchCoach() prepares DOM then delegates to store fetchCoach()"

requirements-completed: [ARCH-1, ARCH-3]

# Metrics
duration: ~12min
completed: 2026-03-17
---

# Phase 1 Plan 03: Claude Store/View Split + JSDoc Summary

**758-line claude.js split into zero-DOM claude.store.js (data/SSE) and DOM-only claude.view.js (FAB/panel/chat), with full JSDoc on all exported APIs**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-17T00:00:00Z
- **Completed:** 2026-03-17
- **Tasks:** 3 completed
- **Files modified:** 4 (2 created, 1 modified, 1 deleted)

## Accomplishments

- Created `js/claude.store.js` (246 lines): MUSCLE_MAP, Heatmap IIFE, ClaudeState accessors, fetchCoach() with SSE streaming — zero DOM references
- Created `js/claude.view.js` (627 lines): FAB rendering, panel overlay, SVG body diagram, chat UI — uses ClaudeState and fetchCoach from store
- Deleted `js/claude.js` (758 lines) and updated `js/app.js` to import from both new files

## Task Commits

Each task was committed atomically:

1. **Task 03-03-01: Create js/claude.store.js** - `9144d5f` (feat)
2. **Task 03-03-02: Create js/claude.view.js** - `d7e0ea5` (feat)
3. **Task 03-03-03: Delete claude.js + update app.js** - `97ce41d` (feat)

## Files Created/Modified

- `js/claude.store.js` — Data layer: MUSCLE_MAP, Heatmap, ClaudeState, fetchCoach (SSE) — no DOM
- `js/claude.view.js` — View layer: Claude IIFE (renderFAB/open/close/_sendChat), buildBodySVG, buildLegend
- `js/app.js` — Import updated from claude.js to claude.view.js + claude.store.js
- `js/claude.js` — Deleted (758 lines fully migrated)

## Decisions Made

- `fetchCoach` uses callbacks `{ onText, onDone, onError }` rather than returning a stream directly, so all DOM manipulation stays in the view layer's `_doFetchCoach()` adapter
- `ClaudeState` uses JS getter/setter accessors (vs plain object properties) to enable future reactivity hooks without changing the public API
- No `window.buildBodySVG` / `window.buildLegend` bridge added — grep confirmed they are only called internally within `claude.view.js`'s `open()` function

## Deviations from Plan

None — plan executed exactly as written. The `_fetchCoach` adapter pattern (`_doFetchCoach`) was a natural implementation detail for wrapping the callback-based `fetchCoach` store function while keeping DOM logic in the view.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Store/View split pattern established and can be applied to other large modules (analytics.js, workout.js) in later plans
- Both new files use `// @ts-check` + JSDoc annotations consistent with Phase 1 standards
- `window.Claude` bridge preserved — onclick handlers in HTML continue to work

---
*Phase: 01-architecture-foundation*
*Completed: 2026-03-17*
