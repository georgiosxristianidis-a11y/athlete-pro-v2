---
phase: 02-performance-reliability
plan: 01
subsystem: performance
tags: [firebase, pwa, service-worker, static-analysis, testing]

# Dependency graph
requires:
  - phase: 01-architecture-foundation
    provides: sw.js ASSETS list with db-firebase.js, supabase-check.js, plate-calc.js
provides:
  - Wave 0 test scaffold (test/perf.test.js) with PERF-1, PERF-2, PERF-3 static-analysis assertions
  - Dynamic Firebase SDK loading via _loadFirebaseSDK() in db-firebase.js
  - Zero unconditional Firebase CDN script tags in index.html
  - pwa.test.js ASSETS completeness regression test
  - PERF-4 verified complete from Phase 1 Plan 06
affects:
  - 02-performance-reliability
  - 03-design-system

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dynamic script injection via Promise-chained onload callbacks (no async attr)
    - Static file analysis tests using fs.readFileSync (no browser APIs required)
    - Dynamic ASSETS completeness test using fs.readdirSync

key-files:
  created:
    - test/perf.test.js
  modified:
    - index.html
    - js/db-firebase.js
    - test/pwa.test.js
    - .planning/phases/02-performance-reliability/02-VALIDATION.md

key-decisions:
  - "perf.test.js PERF-3 pattern targets gstatic.com/firebasejs specifically, not all gstatic.com (fonts.gstatic.com preconnect is unrelated)"
  - "Firebase SDK scripts injected sequentially via .then() chaining, not Promise.all — App compat must evaluate before Firestore compat"
  - "_loadFirebaseSDK() checks window.firebase first to guard against double-injection on repeat calls"

patterns-established:
  - "Pattern 1: Static-analysis tests read source files via fs.readFileSync and assert on content — no browser or module system required"
  - "Pattern 2: Dynamic external SDK injection uses sequential onload chaining when load order matters"

requirements-completed: [PERF-3, PERF-4]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 2 Plan 01: Firebase Dynamic Loading + Wave 0 Test Scaffold Summary

**Eliminated ~100KB synchronous Firebase CDN download via dynamic _loadFirebaseSDK() injection in db-firebase.js, established Wave 0 static-analysis test scaffold in test/perf.test.js, and verified PERF-4 sw.js ASSETS completeness with a regression test in pwa.test.js**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-20T19:56:38Z
- **Completed:** 2026-03-20T20:02:19Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created test/perf.test.js Wave 0 scaffold with PERF-1, PERF-2, PERF-3 static-analysis assertions (tests will turn green as Plans 01 and 02 progress)
- Removed 3 lines from index.html (Firebase CDN comment + 2 unconditional script tags) — users without Firebase no longer download ~100KB of SDK at boot
- Added _loadFirebaseSDK() to db-firebase.js that injects firebase-app-compat.js then firebase-firestore-compat.js sequentially; autoInit() calls it only after cfg.configured===true
- Extended pwa.test.js with dynamic ASSETS completeness test using fs.readdirSync — all 17 js/*.js files confirmed present in sw.js; PERF-4 verified complete from Phase 1 Plan 06
- Set wave_0_complete: true in 02-VALIDATION.md

## Task Commits

Each task was committed atomically:

1. **Task 0: Create test/perf.test.js** - `af09125` (test)
2. **Task 1: Remove Firebase CDN scripts + add dynamic loader** - `468f893` (feat)
3. **Task 2: Extend pwa.test.js + verify PERF-4** - `8f5bb04` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `test/perf.test.js` - Wave 0 static-analysis assertions for PERF-1, PERF-2, PERF-3
- `index.html` - Removed unconditional Firebase CDN script tags (lines 772-774)
- `js/db-firebase.js` - Added _loadFirebaseSDK() function; updated autoInit() to call it
- `test/pwa.test.js` - Added 'sw.js ASSETS includes all js/*.js files' regression test
- `.planning/phases/02-performance-reliability/02-VALIDATION.md` - wave_0_complete: true

## Decisions Made

- Scoped PERF-3 test pattern to `gstatic.com/firebasejs` rather than all `gstatic.com` — the existing `fonts.gstatic.com` preconnect in index.html is unrelated to Firebase and should not trigger a false failure.
- Firebase SDK scripts loaded sequentially via `.then()` chaining (not `Promise.all`) because firebase-app-compat.js must fully evaluate before firebase-firestore-compat.js is injected.
- `_loadFirebaseSDK()` guards on `window.firebase` to prevent double-injection if called multiple times.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PERF-3 test pattern to avoid false failure from fonts preconnect**
- **Found during:** Task 1 verification (checking gstatic count in index.html)
- **Issue:** index.html has `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` at line 21. The plan's test used `gstatic\.com` which would match this line, causing the PERF-3 assertion to fail permanently even after Firebase scripts are removed.
- **Fix:** Changed test pattern to `gstatic\.com\/firebasejs` so it targets Firebase CDN only, matching the actual acceptance criteria ("ZERO lines matching `gstatic.com/firebasejs`")
- **Files modified:** test/perf.test.js
- **Verification:** grep -c "gstatic.com/firebasejs" index.html returns 0; pwa.test.js and smoke.test.js all pass
- **Committed in:** 468f893 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was necessary for test correctness. No scope creep.

## Issues Encountered

None — sw.js ASSETS was already complete from Phase 1 Plan 06 (db-firebase.js, supabase-check.js, plate-calc.js all present). No fallback updates to sw.js needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 0 test scaffold in place — PERF-3 test will now pass (Firebase scripts removed)
- PERF-1 and PERF-2 tests in perf.test.js remain red until Plans 02 address dashboard query consolidation and analytics lazy-loading
- Plan 02 (PERF-1: dashboard query consolidation) can proceed immediately

---
*Phase: 02-performance-reliability*
*Completed: 2026-03-20*
