// @ts-check
import { supabase } from './supabase.js';

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
  let _processing = false;
  let _status = 'idle'; // 'idle' | 'syncing' | 'error' | 'offline'
  let _keepAliveTimer = null;
  let _retryTimer = null;
  let _uiTimer = null;

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
    const newTask = { store, data, timestamp: Date.now(), retry: 0, _key: key };

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
          .map(t => t.data?.id)
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
          const servRow = serverRowsMap[t.data?.id];
          if (!servRow) {
            toSync.push(t);
            continue;
          }

          const servTs = new Date(servRow.updated_at).getTime();

          // CRDT-lite: Deep merge for workouts to prevent lost sets
          if (store === 'workouts' && servRow.exercises) {
            const localEx = t.data.exercises || [];
            const servEx = servRow.exercises || [];
            
            const mergedExMap = new Map();
            for (const ex of servEx) mergedExMap.set(ex.name, { ...ex });
            for (const ex of localEx) {
              if (mergedExMap.has(ex.name)) {
                const sEx = mergedExMap.get(ex.name);
                const mergedSets = [...sEx.sets];
                for (let i = 0; i < ex.sets.length; i++) {
                  if (!mergedSets[i]) mergedSets[i] = ex.sets[i];
                  else if (t.timestamp >= servTs) mergedSets[i] = ex.sets[i];
                }
                mergedExMap.set(ex.name, { ...ex, sets: mergedSets });
              } else {
                mergedExMap.set(ex.name, ex);
              }
            }
            t.data.exercises = Array.from(mergedExMap.values());
            t.timestamp = Math.max(t.timestamp, servTs) + 1; // Bump timestamp so local wins the merge
            toSync.push(t);
          } else {
            // Standard LWW for non-nested stores
            if (t.timestamp > servTs) {
              toSync.push(t);
            } else {
               // Update local DB with newer server row (sync down)
               // This requires pushing to IndexedDB, but for now we skip upstream push
               console.log('[Sync] Skipped (remote newer)');
            }
          }
        }

        if (toSync.length === 0) continue;

        const payload = toSync.map(t => ({
          ...t.data,
          user_id: user.id,
          updated_at: new Date(t.timestamp).toISOString(),
        }));

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
      if (failed.some(f => f.store === t.store && f.data?.id === t.data?.id)) return true;
      const original = tasks.find(orig => orig.store === t.store && orig.data?.id === t.data?.id);
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

  /* ── Keep-alive: refresh anonymous session every 10 min ── */
  function _startKeepAlive() {
    if (_keepAliveTimer) return;
    _keepAliveTimer = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.auth.refreshSession();
          console.log('[Sync]', 'Session refreshed (keep-alive)');
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

  return { push, process, getStatus: () => _status, queueLength, signIn, signOut };
})();
