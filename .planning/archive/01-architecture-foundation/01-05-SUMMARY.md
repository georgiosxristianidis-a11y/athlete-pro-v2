---
phase: 1
plan: "05"
subsystem: workout
tags: [refactor, store-view-split, jsdoc, extraction]
dependency_graph:
  requires: [01-03, 01-04]
  provides: [workout.store.js, workout.view.js, rest-timer.js]
  affects: [app.js]
tech_stack:
  added: []
  patterns: [store-view-split, iife-extraction, jsdoc-annotations]
key_files:
  created:
    - js/rest-timer.js
    - js/workout.store.js
    - js/workout.view.js
  modified:
    - js/app.js
  deleted:
    - js/workout.js
decisions:
  - tryRestoreSession returns data-only (no Nav/Toast) — caller owns navigation
  - init() in view orchestrates timer restore + renderActive + Toast notification
  - RestTimer imported in workout.view.js for explicit dependency declaration even if inline rest bar is used separately
  - Boot sequence activates train screen directly (no Nav handler) when session is restored to avoid re-running renderSelect
metrics:
  duration: ~20min
  completed: "2026-03-17"
  tasks_completed: 4
  files_changed: 5
---

# Phase 1 Plan 05: Workout Store/View Split + RestTimer Extraction + JSDoc Summary

## One-liner
Extracted RestTimer IIFE to rest-timer.js, split 1516-line workout.js into workout.store.js (pure data layer) and workout.view.js (DOM/events/drag), deleted workout.js, updated app.js imports.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 05-05-01 | Extract RestTimer to js/rest-timer.js | 6bc929f |
| 05-05-02 | Create js/workout.store.js | 32b39b5 |
| 05-05-03 | Create js/workout.view.js | 72add2a |
| 05-05-04 | Delete js/workout.js, update js/app.js | 4177677 |

## What Was Built

**js/rest-timer.js** — Self-contained per-set rest timer widget with floating bar + modal ring UI. Exported as `RestTimer` with 4 public methods: `start`, `stop`, `addTime`, `tapSkip`. JSDoc on all public API.

**js/workout.store.js** — Pure data layer with zero DOM references, no Nav/Toast imports. Exports: `SESSION_KEY`, `PLAN_KEY`, `DEFAULT_PLAN`, `EXERCISE_LIBRARY`, `State`, `loadPlan`, `savePlan`, `buildSession`, `persistSession`, `tryRestoreSession`. Key refactor: `tryRestoreSession` returns `{type, plan, startedAt}` or `null` — caller handles navigation.

**js/workout.view.js** — Full view layer importing from workout.store.js and rest-timer.js. Contains all DOM rendering (`renderSelect`, `renderActive`, `renderExerciseCard`, `renderSetRow`), event handlers (`selectType`, `stepWeight`, `stepReps`, `toggleSet`, `completeSession`, etc.), plan editor modal, drag-to-reorder, and `init()` orchestrator. Module-level `_planEditorActiveTab`/`_planEditorSetTab` closures replace old `window._planEditor*` globals.

**js/app.js** — Updated import from `workout.js` to `workout.view.js` + `rest-timer.js`. Boot sequence updated: when `Workout.init()` returns `true` (restored session), activates train screen DOM directly instead of calling `Nav.go('s-train')` (which would trigger `renderSelect`).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| tryRestoreSession returns data only | Store has zero DOM/Nav/Toast dependencies — pure data layer consistency |
| init() in view handles Timer.restore | Timer is a view concern (it updates DOM elements) |
| Inline rest bar (_startRest/_stopRest) kept in view | Simple setInterval bar is different from the RestTimer floating widget; both co-exist |
| Boot activates screen via DOM directly | Avoids Nav handler calling renderSelect when a restored session needs renderActive |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- js/rest-timer.js: FOUND
- js/workout.store.js: FOUND
- js/workout.view.js: FOUND
- js/workout.js: DELETED (confirmed)
- commit 6bc929f (rest-timer extraction): FOUND
- commit 32b39b5 (workout.store.js): FOUND
- commit 72add2a (workout.view.js): FOUND
- commit 4177677 (app.js + delete workout.js): FOUND
