// @ts-check
import { supabase } from './supabase.js';
import { DB } from './db.js';
import { lwwWins } from './shared/lww.js';
import { mergeWorkoutExercises, pickWinner } from './shared/sync-merge.js';
import { getPrivacyMode } from './privacy.store.js';

/**
 * #GIO: Elite Sync Engine V2.1 — LWW Conflict Resolution
 * Resilient, batched, offline-capable sync with Last-Write-Wins semantics.
 *
 * LWW Strategy:
 *   Before upserting, fetch server `updated_at`. If server record is newer,
 *   skip — the remote wins. Local record wins only if its timestamp is strictly newer.
 *
 * Queue Deduplication:
 *   Multiple pushes for the same store+id collapse into a single task (latest wins).
 *
 * Keep-alive:
 *   Heartbeat every 10 min prevents anonymous Supabase session expiry.
 */
export const SyncManager = (() => {
  const QUEUE_KEY = 'ap-sync-queue';
  const PULL_CURSOR_KEY = 'ap-sync-pulled-at'; // high-water mark of server updated_at we've merged
  let _processing = false;
  let _pulling = false;
  let _status = 'idle'; // 'idle' | 'syncing' | 'error' | 'offline'
  let _keepAliveTimer = null;
  let _retryTimer = null;
  let _uiTimer = null;
  let _lastServerTime = 0;

  /** @typedef {{ store: string, data: any, timestamp: number, retry: number }} SyncTask */

  // ── Key extractor per store (for LWW deduplication) ─────────────────────
  function _recordKey(store, data) {
    if (store === 'workouts')    return `workouts::${data.id ?? data.timestamp}`;
    if (store === 'oneRM')       return `oneRM::${data.id}`;
    if (store === 'bodyMetrics') return `bodyMetrics::${data.id ?? data.timestamp}`;
    if (store === 'settings')    return `settings::${data.key}`;
    if (store === 'nutritionLogs') return `nutritionLogs::${data.id ?? data.timestamp}`;
    if (store === 'plannedWorkouts') return `plannedWorkouts::${data.id ?? data.timestamp}`;
    return `${store}::${JSON.stringify(data).slice(0, 60)}`;
  }

  /**
   * Add a record to the sync queue (deduplicates by LWW).
   * @param {string} store 
   * @param {any} data 
   */
  async function push(store, data) {
    if (!data) return;

    const tasks = _loadQueue();
    const key = _recordKey(store, data);
    // Surgical Fix 2 & 3: Store only ID, and prevent LWW Clock Skew
    const id = (store === 'settings') ? data.key : (data.id ?? data.timestamp);
    const timestamp = Math.max(Date.now(), _lastServerTime + 1);
    const newTask = { store, id, timestamp, retry: 0, _key: key };

    // LWW deduplication: replace existing task for same key with newer data
    const existingIdx = tasks.findIndex(t => t._key === key);
    if (existingIdx >= 0) {
      tasks.splice(existingIdx, 1, newTask); // replace with latest
    } else {
      tasks.push(newTask);
    }
    _saveQueue(tasks);

    if (navigator.onLine) {
      process();
    } else {
      _status = 'offline';
      _updateUI();
    }
  }

  /**
   * Process all pending tasks in the queue with LWW conflict resolution.
   */
  async function process() {
    if (_processing || !navigator.onLine) return;

    const tasks = _loadQueue();
    if (!tasks.length) {
      _status = 'idle';
      _updateUI();
      return;
    }

    _processing = true;
    _status = 'syncing';
    _updateUI();

    // Get current user once
    let user = null;
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      user = u;
    } catch (_) { /* offline */ }

    if (!user) {
      _processing = false;
      _status = 'offline';
      _updateUI();
      if (_retryTimer) clearTimeout(_retryTimer);
      _retryTimer = setTimeout(process, 15000);
      return;
    }

    // Group by store for batching
    const groups = {};
    tasks.forEach(t => {
      if (!groups[t.store]) groups[t.store] = [];
      groups[t.store].push(t);
    });

    const failed = [];

    for (const [store, storeTasks] of Object.entries(groups)) {
      try {
        const table = _mapStoreToTable(store);
        if (!table) continue;

        // ── LWW: fetch server timestamps for each record ─────────────────
        const ids = storeTasks
          .map(t => t.id)
          .filter(Boolean);

        let serverRowsMap = {};
        if (ids.length > 0) {
          const { data: serverRows } = await supabase
            .from(table)
            .select('*')
            .eq('user_id', user.id)
            .in('id', ids);

          if (serverRows) {
            serverRows.forEach(r => {
              serverRowsMap[r.id] = r;
            });
          }
        }

        const toSync = [];
        for (const t of storeTasks) {
          const freshData = await DB._getRaw(t.store, t.id);
          if (!freshData) continue; // Deleted locally
          t.data = freshData;

          const servRow = serverRowsMap[t.id];
          if (!servRow) {
            toSync.push(t);
            continue;
          }

          const servTs = new Date(servRow.updated_at).getTime();
          if (servTs > _lastServerTime) _lastServerTime = servTs; // Update safe time

          // CRDT-lite: Deep merge for workouts to prevent lost sets
          if (store === 'workouts' && servRow.exercises) {
            t.data.exercises = mergeWorkoutExercises(t.data.exercises, servRow.exercises, t.timestamp >= servTs);
            t.timestamp = Math.max(t.timestamp, servTs) + 1; // Bump timestamp so local wins the merge
            toSync.push(t);
          } else {
            // Standard LWW for non-nested stores (deviceId breaks timestamp ties)
            const localMeta = { updatedAt: t.timestamp, deviceId: t.data.deviceId ?? DB.getDeviceId() };
            const remoteMeta = { updatedAt: servTs, deviceId: servRow.device_id ?? servRow.deviceId };
            if (lwwWins(localMeta, remoteMeta)) {
              toSync.push(t);
            } else {
               // Update local DB with newer server row (sync down)
               // This requires pushing to IndexedDB, but for now we skip upstream push
               console.log('[Sync] Skipped (remote newer)');
            }
          }
        }

        if (toSync.length === 0) continue;

        const payload = toSync.map(t => {
          // CRDT meta lives locally; server schema has its own updated_at column
          const { updatedAt: _u, deviceId: _d, ...clean } = t.data;
          return {
            ...clean,
            user_id: user.id,
            updated_at: new Date(t.timestamp).toISOString(),
          };
        });

        const { error } = await supabase.from(table).upsert(payload, {
          onConflict: 'id,user_id',
          ignoreDuplicates: false,
        });

        if (error) throw error;
        console.log('[Sync]');
      } catch (err) {
        console.error('[Sync]');
        failed.push(...storeTasks);
      }
    }

    const currentQueue = _loadQueue();
    const newQueue = currentQueue.filter(t => {
      if (failed.some(f => f.store === t.store && f.id === t.id)) return true;
      const original = tasks.find(orig => orig.store === t.store && orig.id === t.id);
      if (!original) return true;
      if (t.timestamp > original.timestamp) return true;
      return false;
    });

    _saveQueue(newQueue);
    _processing = false;
    _status = failed.length ? 'error' : 'idle';
    _updateUI();

    if (failed.length) {
      if (_retryTimer) clearTimeout(_retryTimer);
      _retryTimer = setTimeout(process, 10000);
    }
  }

  /* ════════════════════════════════════════════════════════
     PULL — download server changes and merge them into local IDB.
     This is the half that makes the engine converge: process() only
     pushes up; pull() brings other devices' edits down. Writes go
     through DB._putRaw/_delRaw (no _triggerSync) so a merged row is
     never re-queued as an upstream push (no echo loop).
     ════════════════════════════════════════════════════════ */

  /** All synced stores (same set process() maps to tables). */
  const SYNCED_STORES = ['workouts', 'oneRM', 'bodyMetrics', 'settings', 'nutritionLogs', 'plannedWorkouts'];

  /** Local primary key for a record (settings are keyed by `key`, the rest by `id`). */
  function _localKey(store, row) {
    return store === 'settings' ? row.key : row.id;
  }

  /** Map a server row (snake_case + server-only columns) back to the local record shape. */
  function _fromServerRow(servRow) {
    const { user_id: _uid, updated_at, device_id, ...rest } = servRow;
    const row = { ...rest };
    if (updated_at != null) row.updatedAt = new Date(updated_at).getTime();
    if (device_id != null) row.deviceId = device_id;
    return row;
  }

  /**
   * Pull server rows newer than our high-water mark and merge them locally.
   * Gated identically to push (skipped in air-gapped mode) and requires auth.
   */
  async function pull() {
    if (getPrivacyMode() === 'airgap') return;     // mirror the push privacy gate
    if (_pulling || !navigator.onLine) return;

    let user = null;
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      user = u;
    } catch (_) { return; } // offline / not configured
    if (!user) return;

    _pulling = true;
    const since = Number(localStorage.getItem(PULL_CURSOR_KEY) || 0);
    let maxSeen = since;
    let touched = false;

    try {
      for (const store of SYNCED_STORES) {
        const table = _mapStoreToTable(store);
        if (!table) continue;

        let q = supabase.from(table).select('*').eq('user_id', user.id);
        if (since > 0) q = q.gt('updated_at', new Date(since).toISOString());
        const { data: rows, error } = await q;
        if (error) throw error;
        if (!rows || !rows.length) continue;

        for (const servRow of rows) {
          const servTs = new Date(servRow.updated_at).getTime();
          if (servTs > maxSeen) maxSeen = servTs;

          const remote = _fromServerRow(servRow);
          const key = _localKey(store, remote);
          if (key == null) continue;

          const local = await DB._getRaw(store, key);
          // Remote must beat local to be applied (deviceId breaks ties deterministically).
          if (local && pickWinner(local, remote) === 'local') continue;

          if (remote._deleted) {
            await DB._delRaw(store, key);
            touched = true;
            continue;
          }

          // Workouts: set-level merge so a set logged only locally survives the pull.
          if (store === 'workouts' && local && local.exercises && remote.exercises) {
            remote.exercises = mergeWorkoutExercises(local.exercises, remote.exercises, false);
          }

          await DB._putRaw(store, remote);
          touched = true;
        }
      }

      // Advance the cursor only after a clean full sweep.
      if (maxSeen > since) localStorage.setItem(PULL_CURSOR_KEY, String(maxSeen));
      if (touched) window.dispatchEvent(new CustomEvent('ap-sync-pulled'));
    } catch (err) {
      console.error('[Sync] pull'); // leave cursor unadvanced; next pull retries the window
    } finally {
      _pulling = false;
    }
  }

  /* ── Keep-alive: refresh anonymous session every 10 min ── */
  function _startKeepAlive() {
    if (_keepAliveTimer) return;
    _keepAliveTimer = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.auth.refreshSession();
          console.log('[Sync]', 'Session refreshed (keep-alive)');
          pull();      // periodic convergence: catch other devices' edits
          process();
        }
      } catch (e) {
        console.error('[Sync]');
      }
    }, 10 * 60 * 1000); // 10 minutes
  }

  /* ── Internal Helpers ── */

  function _loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch { return []; }
  }

  function _saveQueue(tasks) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(tasks));
  }

  function _mapStoreToTable(store) {
    const maps = {
      'workouts':    'workouts',
      'oneRM':       'one_rm',
      'bodyMetrics': 'body_metrics',
      'settings':    'settings',
      'nutritionLogs': 'nutrition_logs',
      'plannedWorkouts': 'planned_workouts'
    };
    return maps[store];
  }

  function _updateUI() {
    if (_uiTimer) clearTimeout(_uiTimer);
    _uiTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { status: _status } }));
    }, 100);
  }

  // Listen for online recovery
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[Sync]');
      pull();
      process();
    });
  }

  async function signIn() {
    try {
      _status = 'syncing';
      _updateUI();
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      console.log('[Sync]');
      _startKeepAlive();
      pull();      // bring this device up to date before pushing local queue
      process();
      return data.user;
    } catch (err) {
      console.error('[Sync]');
      _status = 'error';
      _updateUI();
      return null;
    }
  }

  async function signOut() {
    if (_keepAliveTimer) {
      clearInterval(_keepAliveTimer);
      _keepAliveTimer = null;
    }
    await supabase.auth.signOut();
    console.log('[Sync]');
    _status = 'idle';
    _updateUI();
  }

  /**
   * Get current queue length (for diagnostics).
   * @returns {number}
   */
  function queueLength() {
    return _loadQueue().length;
  }

  return { push, pull, process, getStatus: () => _status, queueLength, signIn, signOut };
})();
