# DISPATCH: Remediation Explorer R2 — HLC Integration & Security Fix Strategy

## Mission
Formulate exact remediation strategy for Reviewer 1 and Challenger 1 feedback on `js/sync.js` and `routes/sync.js`.

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\reviewer_1\handoff.md`
- `C:\PROJECTS\athlete-pro\.agents\challenger_1\handoff.md`

## Identified Gate Findings to Remediate
1. **Client Sync Engine HLC Advancement & LWW Resolution (`js/sync.js`)**:
   - In `runSync()`, during PULL processing:
     - When receiving `remoteRecord` from server, invoke `DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId())` so the client's local HLC state is advanced to $\max(L_{\text{local}}, pt, L_{\text{remote}})$.
     - Use `lwwWins(remoteRecord, localRecord)` (or `hlcCompare(remoteRecord.hlc, localRecord.hlc) > 0`) instead of raw `remoteRecord.updatedAt > localRecord.updatedAt` to determine whether `remoteRecord` overwrites `localRecord`.
   - During PUSH processing:
     - Filter local records using `(r.hlc?.l ?? r.updatedAt ?? 0) > lastSync` to capture all locally updated records.
2. **Prototype Pollution Protection (`routes/sync.js`)**:
   - In POST `/api/sync/push`: Check if `req.body` contains `__proto__` or if `Object.prototype.hasOwnProperty.call(req.body, '__proto__')` or if raw JSON string contains `"__proto__"`.
   - Immediately return HTTP 400 Bad Request `{ error: 'Invalid sync payload format' }` if prototype pollution is detected.

## Requirements
Formulate detailed fix strategy and exact code diffs for `js/sync.js` and `routes/sync.js`.
Write handoff report to `C:\PROJECTS\athlete-pro\.agents\explorer_remediation_r2\handoff.md`.
