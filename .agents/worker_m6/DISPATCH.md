# DISPATCH: Worker M6 — Service Worker Manifest & Repository Hygiene

## Objectives
Remediate Independent Victory Auditor findings to achieve 100% pass rate on full project test suite (`npm test`).

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\orchestrator_r1\DISPATCH.md`

## Requirements & Implementation Specifications
1. **Repository Hygiene Cleanup**:
   - Check if `patch-intel.js` exists at repository root `C:\PROJECTS\athlete-pro\patch-intel.js`.
   - Remove/delete `patch-intel.js` if untracked to satisfy `test/repo-hygiene.test.js`.
2. **Service Worker Precache Manifest Update**:
   - Inspect service worker build script (`scripts/build-sw.js` or SW generator config in `package.json`).
   - Add `'js/shared/hlc.js'` to the precache asset file list if missing.
3. **Service Worker Rebuild**:
   - Run `npm run build:sw` (or `npm run build`) to rebuild `sw.js` with the updated asset list and refreshed CACHE_NAME digest hash.
   - Confirm `sw.js` includes `'js/shared/hlc.js'` and updated digest.
4. **Full Test Suite Execution**:
   - Run `npm test` (or `node --test ...` across all test files).
   - Confirm **676/676 tests pass (100%)** with zero failures.
   - Run `node scripts/test-sync-chaos.mjs` to confirm chaos test suite still passes.

## Handoff Report
Write handoff report to `C:\PROJECTS\athlete-pro\.agents\worker_m6\handoff.md`.

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT fake test output or bypass test rules.
