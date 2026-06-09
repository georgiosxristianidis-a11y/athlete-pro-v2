// @ts-check
import { supabase } from './supabase.js';
import { logInfo, logError } from '../lib/logger.js';

/**
 * #GIO: Elite Sync Engine V2
 * Resilient, batched, and offline-capable synchronization.
 */
export const SyncManager = (() => {
  const QUEUE_KEY = 'ap-sync-queue';
  let _processing = false;
  let _status = 'idle'; // 'idle' | 'syncing' | 'error' | 'offline'

  /** @typedef {{ store: string, data: any, timestamp: number, retry: number }} SyncTask */

  /**
   * Add a record to the sync queue.
   * @param {string} store 
   * @param {any} data 
   */
  async function push(store, data) {
    if (!data) return;
    
    const tasks = _loadQueue();
    const newTask = { store, data, timestamp: Date.now(), retry: 0 };
    tasks.push(newTask);
    _saveQueue(tasks);

    if (navigator.onLine) {
      process();
    } else {
      _status = 'offline';
      _updateUI();
    }
  }

  /**
   * Process all pending tasks in the queue.
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

    console.log(`[Sync] Processing ${tasks.length} tasks...`);

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

        // Get current user for row-level security
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.warn('[Sync] No authenticated user. Skipping.');
          failed.push(...storeTasks);
          continue;
        }

        const payload = storeTasks.map(t => ({ 
          ...t.data, 
          user_id: user.id,
          updated_at: new Date().toISOString() 
        }));
        
        const { error } = await supabase.from(table).upsert(payload);

        if (error) throw error;
        console.log(`[Sync] Successfully synced ${storeTasks.length} records to ${table}`);
      } catch (err) {
        console.error(`[Sync] Failed to sync ${store}:`, err.message);
        failed.push(...storeTasks);
      }
    }

    _saveQueue(failed);
    _processing = false;
    _status = failed.length ? 'error' : 'idle';
    _updateUI();

    // If still have tasks, retry in a bit
    if (failed.length) {
      setTimeout(process, 10000);
    }
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
      'workouts': 'workouts',
      'oneRM': 'one_rm',
      'bodyMetrics': 'body_metrics',
      'settings': 'settings'
    };
    return maps[store];
  }

  function _updateUI() {
    // Dispatch event for components to listen to (e.g., Sync status in Settings)
    window.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { status: _status } }));
  }

  // Listen for online recovery
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[Sync] Network back online, starting process...');
      process();
    });
  }

  async function signIn() {
    try {
      _status = 'syncing';
      _updateUI();
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      console.log('[Sync] Signed in anonymously:', data.user.id);
      process();
      return data.user;
    } catch (err) {
      console.error('[Sync] Sign in failed:', err.message);
      _status = 'error';
      _updateUI();
      return null;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    console.log('[Sync] Signed out');
    _status = 'idle';
    _updateUI();
  }

  return { push, process, getStatus: () => _status, signIn, signOut };
})();
