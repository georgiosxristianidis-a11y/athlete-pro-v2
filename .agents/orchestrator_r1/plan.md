# PLAN: P.A.N.D.A Core Elite Audit Resolution Plan

## Overview
Resolution plan for P.A.N.D.A Core Elite Audit in `C:\PROJECTS\athlete-pro`.
Orchestrator Mode: Dispatch-Only Project Orchestrator (Project Pattern with Dual Track).

## Objectives & Requirements
- **R1: CRDT HLC & Backend Security**: Implement Hybrid Logical Clock (HLC) in `js/db.js` and `routes/sync.js` for causality during sync and Clock Skew data loss prevention. Add `zod` schema validation to `/api/sync/push`.
- **R2: Network Resilience**: Implement Mutex lock (`isSyncing`) and Jittered Exponential Backoff in `js/sync.js` to handle connection drops gracefully.
- **R3: Motion Budget Optimization**: Refactor `css/intel.css` and `js/intel.view.js` to eliminate Layout Thrashing (`transform` instead of `width`/`height`) and remove high-frequency `haptic()` calls during AI text streaming.
- **R4: E2E Verification Script**: Create automated Node.js test script (`scripts/test-sync-chaos.mjs`) that spins up the backend locally, simulates clock skew, network drops, and asserts HLC resolution and exponential backoff correctness.

## Phases

### Phase 0: Codebase Survey
- Spawn 3 parallel `teamwork_preview_explorer` subagents (or spec miner) to analyze target files:
  - Explorer 1 (Sync & HLC): Inspect `js/db.js`, `routes/sync.js`, `server.js` and existing sync payload formats.
  - Explorer 2 (Network & Resilience): Inspect `js/sync.js`, existing backoff/retry/lock logic, offline queue.
  - Explorer 3 (UI Motion & Haptics): Inspect `css/intel.css`, `js/intel.view.js`, haptic triggers, stream handlers.
- Output: Explorer reports in `.agents/explorer_survey_1`, `.agents/explorer_survey_2`, `.agents/explorer_survey_3`.

### Phase 1: Project Blueprint & Milestone Decomposition
- Synthesize explorer findings into `PROJECT.md` at `C:\PROJECTS\athlete-pro\PROJECT.md`.
- Milestone breakdown:
  - **M1: Backend Security & HLC Clock**: HLC in `js/db.js` & `routes/sync.js`, `zod` payload validation.
  - **M2: Client Network Resilience**: `isSyncing` Mutex & Jittered Exponential Backoff in `js/sync.js`.
  - **M3: UI Motion & Haptic Budget**: `transform`-based animations in `css/intel.css` & `js/intel.view.js`, stream haptic suppression.
  - **M4: E2E Chaos Test Suite**: `scripts/test-sync-chaos.mjs` verifying clock skew, backoff, and malformed payload HTTP 400 rejection.
  - **M5: Gate, Review & Forensic Audit**: Reviewers, Challengers, and Forensic Auditor verification.

### Phase 2: Execution Track Dispatch
- Implementation Track: Dispatch Workers for M1, M2, M3.
- E2E Testing Track: Dispatch Test Writer for M4 (`scripts/test-sync-chaos.mjs`).

### Phase 3: Review, Challenge & Forensic Integrity Audit
- Spawn Reviewers (`teamwork_preview_reviewer`) to audit code quality & standards.
- Spawn Challengers (`teamwork_preview_challenger`) for empirical stress verification.
- Spawn Forensic Auditor (`teamwork_preview_auditor`) for binary integrity veto check.

### Phase 4: Final Victory Reporting
- Confirm all E2E chaos tests pass, backend returns HTTP 400 on invalid payloads, CSS uses GPU transforms, haptics in streaming loops removed, and forensic audit is CLEAN.
- Send victory handoff report to Sentinel.
