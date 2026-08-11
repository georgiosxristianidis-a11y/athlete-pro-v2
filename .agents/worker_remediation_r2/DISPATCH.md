# DISPATCH: Remediation Worker R2 — HLC Integration & Security Fixes

## Objectives
Implement Requirement R1 & Requirement R2 remediation fixes in `js/sync.js` and `routes/sync.js`.

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_remediation_r2\handoff.md`

## Exclusive File Ownership
You exclusively own and may edit only these files:
- `js/sync.js`
- `routes/sync.js`

## Implementation Specifications
1. **`js/sync.js`**:
   - Import `lwwWins` from `./shared/lww.js`.
   - Update PUSH filter in `runSync()` to `(r.hlc?.l ?? r.updatedAt ?? 0) > lastSync`.
   - Update PULL loop in `runSync()`:
     - Check `if (remoteRecord.hlc) DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId());` to advance client's local HLC clock state.
     - Use `if (lwwWins(remoteRecord, localRecord))` to resolve CRDT LWW conflict.
2. **`routes/sync.js`**:
   - Update `PushPayloadSchema.refine` to reject prototype pollution keys (`__proto__`, `constructor`, invalid prototypes).
   - Update POST `/api/sync/push` handler entry point to check `!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.getPrototypeOf(req.body) !== Object.prototype || Object.prototype.hasOwnProperty.call(req.body, '__proto__') || Object.getOwnPropertyNames(req.body).includes('__proto__')` and immediately return HTTP 400 Bad Request `{ error: 'Invalid sync payload format' }`.

## Verification Instructions
- Run unit & stress tests:
  - `node --test test/crdt-foundation.test.js test/hlc-and-sync-security.test.js test/sync-resilience.test.js test/challenger-r1-stress.test.js`
  - `node scripts/test-sync-chaos.mjs`
- Verify 100% test pass rate across all test suites.
- Document test output in your handoff report (`C:\PROJECTS\athlete-pro\.agents\worker_remediation_r2\handoff.md`).

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvention shortcuts. A teamwork_preview_auditor will independently verify your work.


## 2026-08-11T18:00:19Z
You are Remediation Worker R2 for P.A.N.D.A Core Elite Audit Resolution Plan.
Your working directory is `C:\PROJECTS\athlete-pro\.agents\worker_remediation_r2`.

Read `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`, `C:\PROJECTS\athlete-pro\PROJECT.md`, `C:\PROJECTS\athlete-pro\.agents\explorer_remediation_r2\handoff.md`, and `C:\PROJECTS\athlete-pro\.agents\worker_remediation_r2\DISPATCH.md`.

Your objective is to implement the remediation fixes in `js/sync.js` and `routes/sync.js`:
1. `js/sync.js`:
   - Import `lwwWins` from `./shared/lww.js`.
   - Update PUSH filter in `runSync()` to `(r.hlc?.l ?? r.updatedAt ?? 0) > lastSync`.
   - Update PULL loop in `runSync()`: invoke `if (remoteRecord.hlc) DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId());` to advance local client clock state, and resolve conflicts via `if (lwwWins(remoteRecord, localRecord))`.
2. `routes/sync.js`:
   - Update `PushPayloadSchema.refine` and POST `/api/sync/push` handler to reject prototype pollution keys (`__proto__`, `constructor`, invalid prototypes) returning HTTP 400 Bad Request `{ error: 'Invalid sync payload format' }`.
3. Run unit & stress tests:
   - `node --test test/crdt-foundation.test.js test/hlc-and-sync-security.test.js test/sync-resilience.test.js test/challenger-r1-stress.test.js`
   - `node scripts/test-sync-chaos.mjs`
4. Write handoff report to `C:\PROJECTS\athlete-pro\.agents\worker_remediation_r2\handoff.md`.
5. Send a message to parent with build/test results, exact files modified, and completion status when done.

INTEGRITY MANDATE: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results or create dummy facade passes. A teamwork_preview_auditor will independently verify your work.
