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
