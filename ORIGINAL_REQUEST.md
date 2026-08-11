# Original User Request

## Initial Request — 2026-08-11T17:33:47Z

# Teamwork Project Prompt — Draft

> Status: Step 9 — Ready for launch (awaiting user approval)
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Implement the "Elite Audit Resolution Plan" for P.A.N.D.A Core to achieve a production-ready CRDT sync engine and optimized UI performance.

Working directory: C:\PROJECTS\athlete-pro
Integrity mode: benchmark

## Verification Resources
Refer to `implementation_plan.md` in the artifacts directory for architectural details and constraints.

## Requirements

### R1. CRDT HLC & Backend Security
Implement a Hybrid Logical Clock (HLC) mechanism in `js/db.js` and `routes/sync.js` to guarantee causality during sync, resolving Clock Skew data loss. Add `zod` schema validation to `/api/sync/push`.

### R2. Network Resilience
Implement a Mutex lock (`isSyncing`) and Jittered Exponential Backoff in `js/sync.js` to handle connection drops gracefully without spamming the backend.

### R3. Motion Budget Optimization
Refactor `css/intel.css` and `js/intel.view.js` to eliminate Layout Thrashing (animate `transform` instead of `width`/`height`) and remove high-frequency `haptic()` calls during AI text streaming.

### R4. E2E Verification Script
Create an automated Node.js test script (`scripts/test-sync-chaos.mjs`) that spins up the backend locally, simulates clock skew (mocking physical time drift), simulates network drops, and asserts that HLC resolution and exponential backoff behave correctly.

## Acceptance Criteria

### Verification & Testing
- [ ] `scripts/test-sync-chaos.mjs` executes successfully and prints objective assertions passing for Clock Skew and Backoff behavior.
- [ ] The backend API rejects malformed sync payloads returning HTTP 400.

### Performance
- [ ] CSS animations for `.intel-heat-bar` use GPU-accelerated properties (`transform`) rather than layout-triggering properties (`width`).
- [ ] `navigator.vibrate` (haptic) is no longer called in a rapid loop during AI text stream chunks.
