# DISPATCH: Worker M2 — Client Network Resilience & Sync Engine

## Objectives
Implement Requirement R2: Client Network Resilience, Mutex Lock, and Jittered Exponential Backoff in `js/sync.js`.

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_survey_2\handoff.md`

## Exclusive File Ownership
You exclusively own and may edit only this file:
- `js/sync.js`

## Requirements & Implementation Specifications
1. **Mutex Lock Placement (`isSyncing`)**:
   - Synchronously acquire lock `isSyncing = true` immediately upon entry after initial guards (`isSyncing` check & `navigator.onLine` check) BEFORE any `await` or asynchronous operations.
   - Always release lock `isSyncing = false` inside `finally`.
   - Export `getIsSyncing()` helper returning `isSyncing`.
2. **Jittered Exponential Backoff Algorithm**:
   - Implement and export `calculateBackoffDelay(attempt, baseDelay = 1000, maxDelay = 30000, jitterFactor = 0.5)`:
     Formula: $\text{expDelay} = \min(30000, 1000 \cdot 2^{\text{attempt}-1})$ with $\pm 50\%$ randomized jitter spread, bounded between `baseDelay` and `maxDelay`.
   - Track `retryCount` and `retryTimer`. Export `getRetryCount()` and `resetSyncState()`.
   - On sync error (network failure or HTTP error status): Increment `retryCount`, compute backoff delay, schedule next `runSync()` attempt via `setTimeout`, and emit `ap-sync-status` event (`status: 'error'`, `retryCount`, `retryIn`, `error`).
   - On sync success or `online` browser event: Reset `retryCount = 0`, clear pending `retryTimer`, and emit `ap-sync-status` event (`status: 'synced'`).
3. **UI Event Emission**:
   - Emit CustomEvent `'ap-sync-status'` on `window` (when `typeof window !== 'undefined'`) with statuses: `'syncing'`, `'synced'`, `'error'`, `'offline'`.
4. **Node.js Environment Guarding**:
   - Guard all `window` and `navigator` accesses with `typeof window !== 'undefined'` and `typeof navigator !== 'undefined'` so `js/sync.js` can be safely imported and run in Node.js test scripts (`scripts/test-sync-chaos.mjs`).

## Verification Instructions
- Create unit tests for `calculateBackoffDelay` and `runSync` mutex lock behavior (`test/sync-resilience.test.js`).
- Run `node --test test/sync-resilience.test.js` and existing tests.
- Document test commands and results in your handoff report (`C:\PROJECTS\athlete-pro\.agents\worker_m2\handoff.md`).

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-08-11T14:48:46Z
<USER_REQUEST>
You are Worker M2 for P.A.N.D.A Core Elite Audit Resolution Plan.
Your working directory is `C:\PROJECTS\athlete-pro\.agents\worker_m2`.

Read `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`, `C:\PROJECTS\athlete-pro\PROJECT.md`, `C:\PROJECTS\athlete-pro\.agents\explorer_survey_2\handoff.md`, and `C:\PROJECTS\athlete-pro\.agents\worker_m2\DISPATCH.md`.

Your objective is to implement Requirement R2 (Network Resilience & Sync Engine) in `js/sync.js`:
1. Implement synchronous `isSyncing = true` mutex lock acquisition immediately upon entry after guard checks, and release `isSyncing = false` in `finally`. Export `getIsSyncing()`.
2. Implement and export `calculateBackoffDelay(attempt, baseDelay, maxDelay, jitterFactor)` pure function. Formula: min(30000, 1000 * 2^(attempt-1)) with +/-50% jitter.
3. Track `retryCount` and retry timer. Export `getRetryCount()` and `resetSyncState()`. Schedule `runSync()` retries on sync failure.
4. Emit CustomEvent `'ap-sync-status'` on `window` (when defined) with statuses (`'syncing'`, `'synced'`, `'error'`, `'offline'`).
5. Guard browser globals (`window`, `navigator`) with `typeof` checks so `js/sync.js` can be imported safely in Node.js test scripts.
6. Create unit test `test/sync-resilience.test.js` and verify tests pass.
7. Write handoff report to `C:\PROJECTS\athlete-pro\.agents\worker_m2\handoff.md`.
8. Send a message to parent with build/test results, exact files modified, and completion status when done.

INTEGRITY MANDATE: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
</USER_REQUEST>
