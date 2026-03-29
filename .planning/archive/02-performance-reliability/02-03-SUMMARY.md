---
phase: 02-performance-reliability
plan: 03
subsystem: performance
tags: [lighthouse, lazy-loading, css, fonts, video, critical-path]

# Dependency graph
requires:
  - phase: 02-performance-reliability
    plan: 01
    provides: Dynamic Firebase SDK loading, PERF-3/PERF-4 complete
  - phase: 02-performance-reliability
    plan: 02
    provides: Dashboard DB coalescing, analytics lazy-load, PERF-1/PERF-2 complete
provides:
  - Lighthouse mobile performance score 97 (target was >= 90)
  - All non-dashboard JS modules lazy-loaded via dynamic import()
  - Non-critical CSS deferred via media=print onload trick
  - Google Fonts loaded asynchronously
  - Video preload=none with requestIdleCallback deferred loading
affects: [03-design-system, 04-ai-autopilot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS defer via media='print' onload='this.media=all' — non-critical stylesheets load without blocking render"
    - "Grouped lazy imports: related modules imported together via Promise.all (workout + rest-timer + plate-calc)"
    - "localStorage pre-check before dynamic import — avoids loading workout module when no session exists"
    - "requestIdleCallback for non-critical media loading (video)"

key-files:
  created:
    - .planning/phases/02-performance-reliability/lighthouse-report.report.json
    - .planning/phases/02-performance-reliability/lighthouse-report.report.html
  modified:
    - index.html
    - js/app.js
    - js/claude.view.js
    - js/shell.js

key-decisions:
  - "Claude module lazy-loaded via dynamic import() — renderFAB() called after import resolves; previous decision to keep it static reversed because video preload=none eliminates boot-critical concern"
  - "PlateCalc bundled with workout lazy-load group — only used from workout context"
  - "SupabaseCheck bundled with profile lazy-load group — only used from profile context"
  - "Google Fonts async via media=print onload — was the single biggest render-blocking resource (FCP 2.8s -> 1.5s)"
  - "Video shows icon first, loads mp4 via requestIdleCallback with 3s timeout, swaps to video on canplay"

patterns-established:
  - "Grouped lazy-load: bundle related modules in one async loader (e.g. _loadWorkout loads 3 modules)"
  - "Boot fast-path: check localStorage before dynamic import to avoid unnecessary module loads"
  - "Progressive media: show lightweight placeholder (SVG icon), upgrade to rich media (video) asynchronously"

requirements-completed: [PERF-5]

# Metrics
duration: ~15min
completed: 2026-03-21
---

# Phase 2 Plan 03: Lighthouse Optimization Summary

**Lighthouse mobile performance score raised from 84 to 97 via aggressive lazy-loading, CSS deferral, async font loading, and deferred video preload**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-21T14:39:00Z
- **Completed:** 2026-03-21T15:05:00Z
- **Tasks:** 2 (Task 1: SW cache bump already done in prior commit; Task 2: Lighthouse optimization + measurement)
- **Files modified:** 4 + 2 reports

## Lighthouse Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Score** | 84 | **97** | +13 |
| **FCP** | 3.1s | **1.5s** | -52% |
| **LCP** | 3.3s | **2.4s** | -27% |
| **Speed Index** | 4.6s | **1.5s** | -67% |
| **TBT** | 0ms | 0ms | -- |
| **CLS** | 0 | 0.014 | +0.014 |
| **TTI** | 3.3s | **2.4s** | -27% |
| **Requests** | 31 | **~19** | -39% |

## Accomplishments

- Deferred 5 of 6 CSS files via media=print onload trick — only dashboard.css remains render-blocking
- Google Fonts stylesheet loaded asynchronously — was the single largest FCP bottleneck
- workout.view.js (46KB) + rest-timer.js (6KB) + plate-calc.js (7KB) lazy-loaded together on Train navigation
- profile.js (17KB) + supabase-check.js (7KB) lazy-loaded together on Profile navigation
- body-stats.js (20KB) lazy-loaded on Body Stats navigation
- claude.view.js (25KB) + claude.store.js (9KB) lazy-loaded via dynamic import — FAB renders after import
- Panda video (1MB) deferred with preload=none + requestIdleCallback; icon shown as placeholder
- Boot session restore checks localStorage('ap-active-session') before importing workout module
- Lighthouse report saved as JSON + HTML in phase directory

## Task Commits

1. **SW cache bump to v5** - `9fdcfd3` (prior session)
2. **Lazy-load + async CSS/fonts optimization** - `e5ff0cd` (perf)

## Files Created/Modified

- `index.html` - 5 CSS links get media=print onload; Google Fonts link gets media=print onload
- `js/app.js` - Static imports reduced to boot-critical only; 3 lazy-loader functions (_loadWorkout, _loadProfile, _loadBodyStats); Claude lazy-loaded via dynamic import
- `js/claude.view.js` - Video preload=none + requestIdleCallback; icon placeholder shown first
- `js/shell.js` - Train/Body/Profile handlers converted to async with lazy-load guards
- `.planning/phases/02-performance-reliability/lighthouse-report.report.json` - Lighthouse JSON output
- `.planning/phases/02-performance-reliability/lighthouse-report.report.html` - Lighthouse HTML report

## Decisions Made

- Reversed prior decision to keep Claude module static — with video preload=none the FAB is just an SVG icon injection, safe to defer the entire module
- Google Fonts async was the highest-impact single change: FCP dropped 1.3s (from 2.8s to 1.5s)
- Grouped lazy imports by navigation context (workout group, profile group) rather than individual module lazy-loads
- CLS increased from 0 to 0.014 (well within "good" threshold of 0.1) — likely from font swap or FAB insertion

## Deviations from Plan

### Scope Extension

**1. Additional lazy-loading beyond Plan 03 scope**
- **Reason:** Plan 03 only specified SW cache bump + Lighthouse measurement. Initial score was 84 (below 90 target), requiring optimization work.
- **What was added:** CSS deferral, font async, lazy-loading of 6 additional modules, video preload optimization
- **Impact:** Score exceeded target by 7 points (97 vs 90 target)
- **Justification:** PERF-5 success criterion requires score >= 90; without these optimizations the phase could not be completed

## Issues Encountered

None — all optimizations applied cleanly, tests continued passing throughout.

## Next Phase Readiness

- Phase 2 (Performance & Reliability) is now COMPLETE — all 5 PERF requirements satisfied
- All lazy-load patterns established can be reused in Phase 3/4 if new modules are added
- CSS defer pattern ready for Phase 3 Design System work (base.css should remain critical)

---
*Phase: 02-performance-reliability*
*Completed: 2026-03-21*
