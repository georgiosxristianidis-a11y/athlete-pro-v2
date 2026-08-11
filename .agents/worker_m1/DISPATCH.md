# DISPATCH: Worker M1 — CRDT HLC Engine & Backend Security

## Objectives
Implement Requirement R1: Hybrid Logical Clock (HLC) and Backend Zod Payload Security.

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_survey_1\handoff.md`

## Exclusive File Ownership
You exclusively own and may edit only these files:
- `js/shared/hlc.js` (create/implement HLC module)
- `js/db/core.js` (update `withMeta` and DB helpers)
- `js/db.js` (export HLC utilities)
- `js/shared/lww.js` (update `lwwWins` to use `hlcCompare`)
- `routes/sync.js` (add Zod schema payload validation & HLC causality processing)

## Requirements & Implementation Specifications
1. **HLC Clock Module (`js/shared/hlc.js`)**:
   - Implement `hlcNow(nodeId)`: return `{ l: number, c: number, node: string }`.
   - Implement `hlcReceive(remoteHlc, nodeId)`: advance local logical clock state so future local writes strictly succeed remote timestamps.
   - Implement `hlcCompare(a, b)`: numeric comparison on `l`, then `c`, then lexicographical comparison on `node`.
2. **DB Layer Integration (`js/db/core.js` & `js/db.js`)**:
   - Update `withMeta(record)` to attach `hlc` timestamp tuple via `hlcNow(getDeviceId())` and set `updatedAt = record.hlc.l`.
   - Ensure backward compatibility for legacy records without `hlc` field.
3. **LWW Resolver Integration (`js/shared/lww.js`)**:
   - Update `lwwWins(local, remote)` to use `hlcCompare(local.hlc, remote.hlc) > 0` with fallback to `updatedAt` / `deviceId`.
4. **Backend Zod Schema & Security (`routes/sync.js`)**:
   - Import `z` from `'zod'`.
   - Define `PushPayloadSchema` enforcing valid store names (`workouts`, `oneRM`, `bodyMetrics`, `events`, `settings`, `nutritionLogs`, `plannedWorkouts`) containing arrays of valid record objects.
   - In POST `/api/sync/push`: Validate `req.body` using `PushPayloadSchema.safeParse(req.body)`. Return HTTP 400 `{ error: 'Invalid sync payload format', details: ... }` if validation fails.
   - Update conflict resolution in `/api/sync/push` and `/api/sync/pull` to use HLC comparison / `lwwWins`.

## Verification Instructions
- Run unit/integration tests (`npm test` or `node test/crdt-foundation.test.js`).
- Test `/api/sync/push` with malformed payloads to verify HTTP 400 rejection.
- Document all test commands and output in your handoff report (`C:\PROJECTS\athlete-pro\.agents\worker_m1\handoff.md`).

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
