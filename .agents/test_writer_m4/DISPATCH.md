# DISPATCH: Test Writer M4 — E2E Chaos Verification Suite

## Objectives
Implement Requirement R4: Create automated Node.js test script `scripts/test-sync-chaos.mjs` that spins up the backend server locally, simulates clock skew, network drops, and asserts HLC resolution, exponential backoff, HTTP 400 payload rejection, GPU transform styling, and stream haptic removal.

## Mandatory Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_survey_1\handoff.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_survey_2\handoff.md`
- `C:\PROJECTS\athlete-pro\.agents\explorer_survey_3\handoff.md`
- `C:\PROJECTS\athlete-pro\.agents\worker_m1\handoff.md`

## Exclusive File Ownership
You exclusively own and may edit only these files:
- `scripts/test-sync-chaos.mjs`
- `test/sync-chaos.test.mjs` (if auxiliary test runner file needed)

## Requirements & Implementation Specifications
Create standalone ES module script `scripts/test-sync-chaos.mjs`:
1. **Server Lifecycle Management**:
   - Programmatically spawn or start `server.js` on an available port (or import server app / use `http.createServer`).
   - Cleanly terminate server on completion or process exit.
2. **Clock Skew Simulation & HLC Causality Assertions**:
   - Simulate Node A with system clock skewed +10 minutes ahead.
   - Node A pushes record $R_A$.
   - Node B (normal clock) receives $R_A$, updates local HLC clock via `hlcReceive`, and subsequently edits record $R_B$.
   - Assert $R_B.hlc$ is strictly greater than $R_A.hlc$ (`hlcCompare(R_B.hlc, R_A.hlc) > 0`).
   - Assert Node B's update successfully overwrites Node A's skewed update in CRDT sync without data loss.
3. **Network Drops & Jittered Exponential Backoff Assertions**:
   - Simulate network error / server 500 response.
   - Assert `runSync()` catches error, increments `retryCount`, and schedules retry using `calculateBackoffDelay(attempt)`.
   - Verify `calculateBackoffDelay` returns values bounded between base (1000ms) and max (30000ms) with jitter factor.
   - Verify Mutex lock `isSyncing` prevents concurrent duplicate sync runs.
4. **Backend Security & Payload Validation Assertions**:
   - Send malformed payload to POST `/api/sync/push` (e.g. `{ workouts: "invalid" }` or non-object body).
   - Assert server responds with HTTP 400 Bad Request and JSON error object.
5. **Static Analysis & UI Verification Assertions**:
   - Verify `.intel-heat-bar` in `css/intel.css` uses `transform: scaleX(...)` and `will-change: transform`.
   - Verify `haptic(2)` inside SSE streaming chunk loop in `js/intel.view.js` is removed.

## Execution & Output Requirements
- Script must be runnable via `node scripts/test-sync-chaos.mjs`.
- Exit with code 0 on all assertions passing.
- Output clear, readable assertion pass logs for each test case.
- Write handoff report to `C:\PROJECTS\athlete-pro\.agents\test_writer_m4\handoff.md`.

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results or create dummy/facade passes. A teamwork_preview_auditor will independently verify your test script.

## 2026-08-11T14:48:46Z
You are Test Writer M4 for P.A.N.D.A Core Elite Audit Resolution Plan.
Your working directory is `C:\PROJECTS\athlete-pro\.agents\test_writer_m4`.

Read `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`, `C:\PROJECTS\athlete-pro\PROJECT.md`, `C:\PROJECTS\athlete-pro\.agents\explorer_survey_1\handoff.md`, `C:\PROJECTS\athlete-pro\.agents\explorer_survey_2\handoff.md`, `C:\PROJECTS\athlete-pro\.agents\explorer_survey_3\handoff.md`, `C:\PROJECTS\athlete-pro\.agents\worker_m1\handoff.md`, and `C:\PROJECTS\athlete-pro\.agents\test_writer_m4\DISPATCH.md`.

Your objective is to create Requirement R4 E2E Chaos Verification Script in `scripts/test-sync-chaos.mjs`:
1. Spin up the Express backend server (`server.js` or Express app instance) on an available local port.
2. Simulate physical Clock Skew: Node A (+10 min clock) writes record R_A; Node B (normal clock) receives R_A, receives remote HLC (`hlcReceive`), and writes record R_B. Assert R_B.hlc > R_A.hlc (`hlcCompare(R_B.hlc, R_A.hlc) > 0`) and R_B overwrites R_A in CRDT sync without data loss.
3. Simulate Network Drops & Resilience: Trigger simulated sync failure; assert `retryCount` increments and `calculateBackoffDelay` returns values bounded between base (1000ms) and max (30000ms) with jitter factor. Assert Mutex lock `isSyncing` prevents concurrent sync calls.
4. Simulate Malformed Backend Push Payload: Send invalid payload (`{ workouts: "invalid" }` or non-object) to POST `/api/sync/push`. Assert server returns HTTP 400 Bad Request with Zod JSON error object.
5. Verify Static/UI Properties: Assert `.intel-heat-bar` in `css/intel.css` uses `transform: scaleX(...)` and `will-change: transform`. Assert `haptic(2)` inside SSE streaming chunk loop in `js/intel.view.js` is removed.
6. Execute `node scripts/test-sync-chaos.mjs` and verify it passes cleanly with exit code 0.
7. Write handoff report to `C:\PROJECTS\athlete-pro\.agents\test_writer_m4\handoff.md`.
8. Send a message to parent with execution logs, test results, and completion status when done.
