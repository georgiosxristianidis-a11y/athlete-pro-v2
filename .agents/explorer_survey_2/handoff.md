# Handoff Report — Requirement R2: Network Resilience & Sync Engine

## 1. Observation

### 1.1 Existing Sync Implementation in `js/sync.js`
Inspection of `C:\PROJECTS\athlete-pro\js\sync.js` reveals the following current structure (lines 1–86):

```javascript
// @ts-check
import { DB } from './db.js';

const LAST_SYNC_KEY = 'panda-last-sync';
const SYNC_STORES = ['workouts', 'oneRM', 'bodyMetrics', 'events', 'settings', 'nutritionLogs', 'plannedWorkouts'];

let isSyncing = false;

/**
 * P.A.N.D.A Core CRDT Sync Engine
 * @returns {Promise<void>}
 */
export async function runSync() {
  if (isSyncing) return;
  if (!navigator.onLine) return;
  
  try {
    isSyncing = true;
    const lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
    const syncStart = Date.now();
    let pushedCount = 0;
    let pulledCount = 0;

    // 1. PUSH local changes
    const pushPayload = {};
    for (const store of SYNC_STORES) {
      const records = await DB._getAllRaw(store);
      // We push everything that was updated AFTER the last sync
      const updated = records.filter(r => r.updatedAt > lastSync);
      if (updated.length > 0) {
        pushPayload[store] = updated;
        pushedCount += updated.length;
      }
    }

    if (pushedCount > 0) {
      const pushRes = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushPayload)
      });
      if (!pushRes.ok) throw new Error('Push failed');
    }

    // 2. PULL remote changes
    const pullRes = await fetch(`/api/sync/pull?since=${lastSync}`);
    if (!pullRes.ok) throw new Error('Pull failed');
    
    const pullData = await pullRes.json();
    if (pullData.changes) {
      for (const [store, records] of Object.entries(pullData.changes)) {
        for (const remoteRecord of records) {
          const key = store === 'settings' ? remoteRecord.key : remoteRecord.id;
          const localRecord = await DB._getRaw(store, key);
          
          // CRDT Last Write Wins
          if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
            await DB._putRaw(store, remoteRecord);
            pulledCount++;
          }
        }
      }
    }

    // Update last sync time
    localStorage.setItem(LAST_SYNC_KEY, syncStart.toString());
    
    if (pushedCount > 0 || pulledCount > 0) {
      console.log(`[P.A.N.D.A Sync] Complete. ↑${pushedCount} ↓${pulledCount}`);
      // Trigger a re-render of UI if there were pulled changes
      if (pulledCount > 0) {
        window.dispatchEvent(new CustomEvent('panda-sync-complete'));
      }
    }

  } catch (err) {
    console.error('[P.A.N.D.A Sync]', err);
  } finally {
    isSyncing = false;
  }
}

// Background / Automatic Hooks
window.addEventListener('online', runSync);
setInterval(runSync, 60000); // 1 minute auto-sync
```

### 1.2 Identified Flaws & Observations
1. **Mutex Lock Placement**: `isSyncing` flag is initialized to `false` at module scope. In `runSync()`, lines 14–15 check `isSyncing` and `navigator.onLine`, but `isSyncing = true;` (line 18) is set inside the `try` block. If `runSync()` is called multiple times concurrently before line 18 is hit, or if an error occurs during `try` setup prior to line 18, lock state discipline is flawed. Lock acquisition must happen synchronously immediately upon entry after guard checks.
2. **Missing Retry Logic & Exponential Backoff**: When network disconnects or `fetch` fails (`throw new Error('Push failed')` / `throw new Error('Pull failed')`), the error is swallowed with `console.error('[P.A.N.D.A Sync]', err);` in line 77. `isSyncing` is set to `false`, but **no retry** is scheduled. The system waits up to 60 seconds for the next `setInterval` tick.
3. **Thundering Herd Risk**: If connection drops and multiple devices reconnect simultaneously, or if automatic hooks (`online` event + `setInterval`) fire without randomized jitter, all clients spam the backend simultaneously.
4. **Lack of State Notifications**: The engine dispatches `panda-sync-complete` when records are pulled, but does not emit `ap-sync-status` custom events for UI consumers (e.g. `DynamicIsland` in `js/shared/dynamic-island.js:263` and `sync-dot.js` which look for `ap-sync-status` details: `syncing`, `synced`, `error`, `offline`).
5. **Node.js Test Environment Guarding**: `window.addEventListener` and `navigator.onLine` are accessed unconditionally at top level, which breaks Node.js standalone test imports unless guarded by `typeof window !== 'undefined'`.

---

## 2. Logic Chain

1. **Mutex Placement Logic**:
   - Observation 1.1 shows `if (isSyncing) return;` followed by `try { isSyncing = true; ... }`.
   - In JS single-threaded execution, any `await` yields to the event loop. In `runSync()`, lines 14–15 have no `await`, so `isSyncing = true` executes in the same tick. However, setting `isSyncing = true;` outside `try` (synchronously right after guard checks) and resetting `isSyncing = false;` in `finally` guarantees that lock acquisition happens atomically before any asynchronous work commences, and guarantees lock release on any error path.

2. **Jittered Exponential Backoff Design Logic**:
   - When a network error or HTTP 5xx error occurs during `push` or `pull`, the system needs to retry automatically with increasing delays up to a ceiling (`MAX_DELAY_MS = 30000ms`).
   - Standard Exponential Backoff formula: $\text{expDelay} = \min(\text{MAX\_DELAY}, \text{BASE\_DELAY} \times 2^{\text{attempt} - 1})$.
   - Adding a Jitter Factor ($\pm 50\%$ around $\text{expDelay}$) prevents network thundering herds.
   - Formula:
     $$\text{expDelay} = \min(30000, 1000 \times 2^{\text{attempt}-1})$$
     $$\text{jitteredDelay} = \text{expDelay} \times (1 - 0.5 + \text{Math.random()} \times 1.0)$$
     $$\text{boundedDelay} = \max(1000, \min(30000, \lfloor \text{jitteredDelay} \rfloor))$$
   - Consecutive failures increment `retryCount`. A successful sync or an `online` window event resets `retryCount = 0` and clears any pending backoff timer.

3. **UI Sync Status Events Logic**:
   - `js/shared/sync-dot.js` derives network state from `syncStatus` (`'syncing'`, `'error'`, `'offline'`, `'synced'`).
   - `js/shared/dynamic-island.js` listens to `'ap-sync-status'`.
   - Therefore, `runSync()` must emit `CustomEvent('ap-sync-status', { detail: { status: '...' } })` on start (`syncing`), success (`synced`), failure (`error`, with `retryIn` and `retryCount`), and offline detection (`offline`).

---

## 3. Caveats

1. **Schema Validation Errors (400 Bad Request)**:
   - If the push request fails due to HTTP 400 (e.g. invalid payload under Zod schema validation), retrying the identical payload without code/data changes will continue to fail until local data is corrected. The design caps exponential backoff at `30000ms` and emits error status events so UI can display an error state.
2. **Environment Capabilities**:
   - In pure Node.js environments (such as unit test execution in `scripts/test-sync-chaos.mjs`), `window` and `navigator` are absent unless mocked. All browser global usages must be guarded with `typeof window !== 'undefined'` and `typeof navigator !== 'undefined'`.

---

## 4. Conclusion & Proposed Code Implementation

### Proposed Implementation for `js/sync.js`

```javascript
// @ts-check
import { DB } from './db.js';

const LAST_SYNC_KEY = 'panda-last-sync';
const SYNC_STORES = ['workouts', 'oneRM', 'bodyMetrics', 'events', 'settings', 'nutritionLogs', 'plannedWorkouts'];

// Mutex lock flag & retry state
let isSyncing = false;
let retryCount = 0;
let retryTimer = null;

// Backoff Configuration Defaults
export const BACKOFF_CONFIG = {
  BASE_DELAY_MS: 1000,   // 1s initial delay
  MAX_DELAY_MS: 30000,   // 30s ceiling
  JITTER_FACTOR: 0.5,    // +/- 50% spread around exponential base
};

/**
 * Calculates Jittered Exponential Backoff delay.
 * Formula: expDelay = min(maxDelay, baseDelay * 2^(attempt-1))
 *          jittered = expDelay * (1 - jitter + random * 2 * jitter)
 * @param {number} attempt Current retry attempt count (>= 1)
 * @param {number} [baseDelay] Base delay in ms (default 1000)
 * @param {number} [maxDelay] Max delay ceiling in ms (default 30000)
 * @param {number} [jitterFactor] Random jitter factor (default 0.5)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt,
  baseDelay = BACKOFF_CONFIG.BASE_DELAY_MS,
  maxDelay = BACKOFF_CONFIG.MAX_DELAY_MS,
  jitterFactor = BACKOFF_CONFIG.JITTER_FACTOR
) {
  if (attempt <= 0) return 0;
  const expDelay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1));
  const minBound = expDelay * (1 - jitterFactor);
  const maxBound = expDelay * (1 + jitterFactor);
  const randomDelay = minBound + Math.random() * (maxBound - minBound);
  return Math.floor(Math.min(maxDelay, Math.max(baseDelay, randomDelay)));
}

/**
 * Get current Mutex lock state (for status queries & unit testing)
 * @returns {boolean}
 */
export function getIsSyncing() {
  return isSyncing;
}

/**
 * Get current consecutive retry failure count
 * @returns {number}
 */
export function getRetryCount() {
  return retryCount;
}

/**
 * Reset retry count and cancel pending retry timers (useful for tests or online reconnect)
 */
export function resetSyncState() {
  retryCount = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * P.A.N.D.A Core CRDT Sync Engine with Mutex Lock & Network Resilience
 * @returns {Promise<void>}
 */
export async function runSync() {
  // Mutex Lock Guard: return immediately if sync is already running
  if (isSyncing) return;
  
  // Connectivity Check Guard
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { status: 'offline' } }));
    }
    return;
  }

  // Acquire Mutex Lock synchronously before any async execution
  isSyncing = true;

  // Clear any scheduled retry timer since a sync run is commencing
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  try {
    const lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
    const syncStart = Date.now();
    let pushedCount = 0;
    let pulledCount = 0;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { status: 'syncing' } }));
    }

    // 1. PUSH local changes
    const pushPayload = {};
    for (const store of SYNC_STORES) {
      const records = await DB._getAllRaw(store);
      const updated = records.filter(r => r.updatedAt > lastSync);
      if (updated.length > 0) {
        pushPayload[store] = updated;
        pushedCount += updated.length;
      }
    }

    if (pushedCount > 0) {
      const pushRes = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushPayload)
      });
      if (!pushRes.ok) {
        throw new Error(`Push failed with status ${pushRes.status}`);
      }
    }

    // 2. PULL remote changes
    const pullRes = await fetch(`/api/sync/pull?since=${lastSync}`);
    if (!pullRes.ok) {
      throw new Error(`Pull failed with status ${pullRes.status}`);
    }
    
    const pullData = await pullRes.json();
    if (pullData.changes) {
      for (const [store, records] of Object.entries(pullData.changes)) {
        for (const remoteRecord of records) {
          const key = store === 'settings' ? remoteRecord.key : remoteRecord.id;
          const localRecord = await DB._getRaw(store, key);
          
          // CRDT Last Write Wins
          if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
            await DB._putRaw(store, remoteRecord);
            pulledCount++;
          }
        }
      }
    }

    // Update last sync time on successful completion
    localStorage.setItem(LAST_SYNC_KEY, syncStart.toString());
    
    // Reset backoff retry counter upon success
    retryCount = 0;

    if (pushedCount > 0 || pulledCount > 0) {
      console.log(`[P.A.N.D.A Sync] Complete. ↑${pushedCount} ↓${pulledCount}`);
      if (pulledCount > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('panda-sync-complete'));
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { status: 'synced', lastSync: syncStart } }));
    }

  } catch (err) {
    console.error('[P.A.N.D.A Sync]', err);
    
    // Increment failure attempt counter & schedule retry with Jittered Exponential Backoff
    retryCount++;
    const nextDelay = calculateBackoffDelay(retryCount);
    console.warn(`[P.A.N.D.A Sync] Retrying in ${nextDelay}ms (attempt #${retryCount})`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ap-sync-status', {
        detail: { status: 'error', error: err.message, retryCount, retryIn: nextDelay }
      }));
    }

    retryTimer = setTimeout(() => {
      retryTimer = null;
      runSync();
    }, nextDelay);

  } finally {
    // Release Mutex Lock
    isSyncing = false;
  }
}

// Background / Automatic Hooks
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    resetSyncState();
    runSync();
  });
  setInterval(runSync, 60000); // 1 minute auto-sync
}
```

---

## 5. Verification Method

1. **Unit Test Verification of Backoff Formula**:
   - Run a test script importing `calculateBackoffDelay` from `js/sync.js`:
     ```javascript
     import { calculateBackoffDelay } from '../js/sync.js';
     import assert from 'node:assert/strict';

     // Attempt 1: expDelay = 1000, bounds [500, 1500]
     const d1 = calculateBackoffDelay(1);
     assert.ok(d1 >= 500 && d1 <= 1500);

     // Attempt 5: expDelay = 16000, bounds [8000, 24000]
     const d5 = calculateBackoffDelay(5);
     assert.ok(d5 >= 8000 && d5 <= 24000);

     // Attempt 10: capped at MAX_DELAY 30000, bounds [15000, 30000]
     const d10 = calculateBackoffDelay(10);
     assert.ok(d10 >= 15000 && d10 <= 30000);
     ```

2. **Mutex Guard Verification**:
   - Assert `getIsSyncing()` returns `true` during active `runSync()` execution and `false` before/after.
   - Calling `runSync()` a second time while `getIsSyncing()` is `true` immediately returns without making duplicate `fetch` network calls.

3. **Chaos End-to-End Verification (`scripts/test-sync-chaos.mjs`)**:
   - Run `node scripts/test-sync-chaos.mjs` (as specified in Requirement R4).
   - Verify that when the server returns 500 or is unreachable, `retryCount` increments and retries occur at jittered exponential intervals rather than rapid polling.
