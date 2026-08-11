# Project: P.A.N.D.A Core Elite Audit Resolution Plan

## Architecture
- Module boundaries:
  - **Database & CRDT Engine**: `js/db.js`, `js/db/core.js`, `js/shared/hlc.js`, `js/shared/lww.js`
  - **Client Sync & Network Resilience**: `js/sync.js`
  - **Backend Sync Server & Security**: `routes/sync.js`, `server.js`
  - **UI Motion & Haptic Budget**: `css/intel.css`, `js/intel.view.js`
  - **E2E Chaos Testing Track**: `scripts/test-sync-chaos.mjs`
  - **Service Worker & Repo Hygiene**: `sw.js`, `scripts/build-sw.js`, `package.json`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Hybrid Logical Clock (HLC) Engine | Implement HLC (l, c, node) tuple generator, receiver advancement, and comparator in `js/shared/hlc.js`, `js/db/core.js`, `js/shared/lww.js` | M1 | survey |
| 2 | Backend Sync Causality & HLC Processing | Integrate HLC timestamp comparison & reception advancing in `/api/sync/push` and `/api/sync/pull` in `routes/sync.js` | M1 | survey |
| 3 | Backend Zod Payload Validation | Add Zod schema validation to `/api/sync/push` returning HTTP 400 Bad Request on invalid payloads | M1 | survey |
| 4 | Sync Mutex Lock (`isSyncing`) | Implement immediate synchronous lock acquisition & release in `js/sync.js` | M2 | survey |
| 5 | Jittered Exponential Backoff | Implement `calculateBackoffDelay` and retry scheduling in `js/sync.js` with `ap-sync-status` events | M2 | survey |
| 6 | Node.js Test Environment Guarding | Guard browser globals (`window`, `navigator`) in `js/sync.js` | M2 | survey |
| 7 | GPU Motion Budget Optimization | Refactor `.intel-heat-bar` in `css/intel.css` to `width: 100%`, `transform: scaleX(...)`, `transform-origin: left center`, `will-change: transform` | M3 | survey |
| 8 | Stream Haptic Suppression | Remove `haptic(2)` during SSE text streaming in `js/intel.view.js:602` while preserving gesture haptics | M3 | survey |
| 9 | E2E Chaos Verification Suite | Create standalone test `scripts/test-sync-chaos.mjs` verifying clock skew, backoff, invalid payload 400 rejection, GPU styles, and stream haptic removal | M4 | survey |
| 10 | Service Worker Manifest & SW Digest Rebuild | Include `js/shared/hlc.js` in SW build manifest, rebuild `sw.js` via `npm run build:sw`, update digest | M6 | audit |
| 11 | Repository Hygiene Cleanup | Remove untracked root script `patch-intel.js` | M6 | audit |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | CRDT HLC Engine & Backend Security | `js/shared/hlc.js`, `js/db.js`, `js/db/core.js`, `js/shared/lww.js`, `routes/sync.js` | none | DONE |
| M2 | Client Network Resilience & Sync Engine | `js/sync.js` | M1 | DONE |
| M3 | UI Motion Budget & Haptic Optimization | `css/intel.css`, `js/intel.view.js` | none | DONE |
| M4 | E2E Chaos Verification Suite | `scripts/test-sync-chaos.mjs` | M1, M2, M3 | DONE |
| M5 | Multi-Agent Review & Forensic Audit | Full codebase review, challenge, and forensic integrity audit | M1, M2, M3, M4 | DONE |
| M6 | Service Worker Manifest & Repository Hygiene | `sw.js`, `scripts/build-sw.js`, root directory cleanup | M1 | IN_PROGRESS |

## Interface Contracts
### HLC Module (`js/shared/hlc.js`)
- `hlcNow(nodeId: string): { l: number, c: number, node: string }`
- `hlcReceive(remoteHlc: { l: number, c: number, node: string }, nodeId: string): { l: number, c: number, node: string }`
- `hlcCompare(a: HLCTimestamp, b: HLCTimestamp): number`

### Client Sync Engine (`js/sync.js`)
- `calculateBackoffDelay(attempt: number, baseDelay?: number, maxDelay?: number, jitterFactor?: number): number`
- `runSync(): Promise<void>`
- `getIsSyncing(): boolean`
- `getRetryCount(): number`
- `resetSyncState(): void`

### Backend Push Endpoint (`POST /api/sync/push`)
- Body: Validated by Zod `PushPayloadSchema`
- Success: HTTP 200 `{ status: 'ok', mergedCount: number }`
- Validation Error: HTTP 400 `{ error: 'Invalid sync payload format', details: Array }`

## Code Layout
- `js/shared/hlc.js`: HLC clock logic and comparison helper
- `js/shared/lww.js`: LWW conflict resolution wrapper
- `js/db.js` / `js/db/core.js`: Database layer with `withMeta` HLC stamping
- `routes/sync.js`: Server sync API endpoints with Zod payload validation
- `js/sync.js`: Client sync engine with Mutex and Backoff
- `css/intel.css`: GPU-accelerated heat bar animation styling
- `js/intel.view.js`: UI view handler with stream haptics suppressed
- `scripts/test-sync-chaos.mjs`: Node.js automated E2E chaos test harness
- `sw.js`: Service worker precache asset manifest
