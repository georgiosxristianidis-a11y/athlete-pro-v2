# DISPATCH: Challenger 1 — Stress Verification of HLC Causality & Zod Validation

## Mission
Perform empirical adversarial testing and stress verification on Requirement R1 (CRDT HLC Engine & Backend Zod Security).

## Paths to Read First
- `C:\PROJECTS\athlete-pro\ORIGINAL_REQUEST.md`
- `C:\PROJECTS\athlete-pro\PROJECT.md`
- `C:\PROJECTS\athlete-pro\.agents\worker_m1\handoff.md`

## Objectives
1. Write a temporary test harness or stress script testing HLC monotonicity under clock skew jumps (+1 hour, -1 hour, physical clock freezes).
2. Stress test POST `/api/sync/push` with extreme/edge-case malformed JSON payloads (deeply nested invalid objects, numeric keys, prototype pollution attempts). Assert all invalid payloads consistently return HTTP 400 Bad Request with Zod details without crashing `server.js`.
3. Verify that valid records with HLC timestamp tuples are properly merged into local IndexedDB and server storage.

Write handoff report to `C:\PROJECTS\athlete-pro\.agents\challenger_1\handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
