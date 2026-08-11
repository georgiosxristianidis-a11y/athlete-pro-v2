// @ts-check
import { DB } from './db.js';
import { lwwWins } from './shared/lww.js';

const LAST_SYNC_KEY = 'panda-last-sync';
const SYNC_STORES = ['workouts', 'oneRM', 'bodyMetrics', 'events', 'settings', 'nutritionLogs', 'plannedWorkouts'];

// Mutex lock flag & backoff state
let isSyncing = false;
let retryCount = 0;
let retryTimer = null;

// Backoff Configuration Defaults
export const BACKOFF_CONFIG = {
  BASE_DELAY_MS: 1000,   // 1s base delay
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
  return Math.floor(Math.min(maxDelay, Math.max(0, randomDelay)));
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
 * Helper to safely dispatch 'ap-sync-status' event on window when present
 * @param {'syncing'|'synced'|'error'|'offline'} status
 * @param {Record<string, any>} [detail]
 */
function emitSyncStatus(status, detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ap-sync-status', {
      detail: { status, ...detail }
    }));
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
    emitSyncStatus('offline');
    return;
  }

  // Synchronously acquire Mutex Lock immediately upon entry after guard checks
  isSyncing = true;

  // Clear any scheduled retry timer since a sync run is commencing
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  try {
    emitSyncStatus('syncing');

    const lastSyncStr = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_SYNC_KEY) : null;
    const lastSync = parseInt(lastSyncStr || '0', 10);
    const syncStart = Date.now();
    let pushedCount = 0;
    let pulledCount = 0;

    // 1. PUSH local changes
    const pushPayload = {};
    for (const store of SYNC_STORES) {
      const records = await DB._getAllRaw(store);
      const updated = records.filter(r => (r.hlc?.l ?? r.updatedAt ?? 0) > lastSync);
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
          if (remoteRecord.hlc) {
            DB.hlcReceive(remoteRecord.hlc, DB.getDeviceId());
          }
          const key = store === 'settings' ? remoteRecord.key : remoteRecord.id;
          const localRecord = await DB._getRaw(store, key);

          // CRDT Last Write Wins
          if (lwwWins(remoteRecord, localRecord)) {
            await DB._putRaw(store, remoteRecord);
            pulledCount++;
          }
        }
      }
    }

    // Update last sync time on successful completion
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_KEY, syncStart.toString());
    }

    // Reset backoff retry counter upon success
    retryCount = 0;

    if (pushedCount > 0 || pulledCount > 0) {
      console.log(`[P.A.N.D.A Sync] Complete. ↑${pushedCount} ↓${pulledCount}`);
      if (pulledCount > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('panda-sync-complete'));
      }
    }

    emitSyncStatus('synced', { lastSync: syncStart });

  } catch (err) {
    console.error('[P.A.N.D.A Sync]', err);

    retryCount++;
    const nextDelay = calculateBackoffDelay(retryCount);
    console.warn(`[P.A.N.D.A Sync] Retrying in ${nextDelay}ms (attempt #${retryCount})`);

    emitSyncStatus('error', {
      error: err.message || String(err),
      retryCount,
      retryIn: nextDelay
    });

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
