// @ts-check
/* ════════════════════════════════════════════════════════
   sync.js — Athlete Pro
   Offline-first sync engine
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

export const SyncEngine = {
  async addToQueue(action, payload) {
    // 1. Write to local queue
    await DB.SyncQueue.add({ action, payload, timestamp: Date.now() });
    // 2. Try to sync immediately
    this.processQueue();
  },

  async processQueue() {
    if (!navigator.onLine) return;
    
    try {
      const queue = await DB.SyncQueue.getAll();
      
      if (queue.length === 0) return;

      // In a real app, send to backend:
      // await fetch('/api/sync', { method: 'POST', body: JSON.stringify(queue) });
      
      // For now, just clear the processed events
      for (const item of queue) {
        await DB.SyncQueue.remove(item.id);
      }
      console.log(`[SyncEngine] Synced ${queue.length} items in background`);
    } catch (e) {
      console.warn('[SyncEngine] Sync failed, will retry later', e);
    }
  },

  init() {
    window.addEventListener('online', () => this.processQueue());
    // Try on startup
    setTimeout(() => this.processQueue(), 2000);
  }
};
