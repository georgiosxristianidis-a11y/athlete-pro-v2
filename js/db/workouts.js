// @ts-check
/* ════════════════════════════════════════════════════════
   db/workouts.js — WORKOUTS  (completed sessions)
   ════════════════════════════════════════════════════════ */

import { S, tx, req2p, req2pSafe, withMeta, _triggerSync } from './core.js';

export const Workouts = {
  /**
   * Save a completed session. Returns new id.
   * @param {import('../db.js').WorkoutRecord} session
   * @returns {Promise<number>}
   */
  save(session) {
    session.timestamp = session.timestamp || Date.now();
    withMeta(session);
    return tx(S.WORKOUTS, 'readwrite').then((s) =>
      req2pSafe(s.add(session), s.transaction).then(() => {
        _triggerSync(S.WORKOUTS, session);
        return session.id;
      })
    );
  },

  /**
   * Get all sessions, sorted newest first.
   * @returns {Promise<import('../db.js').WorkoutRecord[]>}
   */
  getAll() {
    return tx(S.WORKOUTS).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.reverse().filter(w => !w._deleted));
    });
  },

  /**
   * Get last N sessions.
   * @param {number} n
   * @returns {Promise<import('../db.js').WorkoutRecord[]>}
   */
  getLast(n = 5) {
    return tx(S.WORKOUTS).then(s => {
      const idx = s.index('timestamp');
      return new Promise((res, rej) => {
        const list = [];
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && list.length < n) {
            if (!cursor.value._deleted) list.push(cursor.value);
            cursor.continue();
          } else {
            res(list);
          }
        };
        req.onerror = (e) => rej(e.target.error);
      });
    });
  },

  /**
   * Delete a workout by id.
   * @param {number} id
   * @returns {Promise<void>}
   */
  deleteById(id) {
    // Delegate to delete() so the edit-workout flow also queues a cloud tombstone.
    return this.delete(id);
  },

  /**
   * Get last session of a specific type (push/pull/legs).
   * @param {'push'|'pull'|'legs'} type
   * @returns {Promise<import('../db.js').WorkoutRecord|undefined>}
   */
  getLastByType(type) {
    return tx(S.WORKOUTS).then(s => {
      const idx = s.index('type');
      const req = idx.openCursor(IDBKeyRange.only(type), 'prev');
      return new Promise((res, rej) => {
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            res(null);
            return;
          }
          if (cursor.value._deleted) {
            cursor.continue();
          } else {
            res(cursor.value);
          }
        };
        req.onerror = (e) => rej(e.target.error);
      });
    });
  },

  /**
   * Weekly volume (kg) — last 7 days.
   * @returns {Promise<number>}
   */
  weeklyVolume() {
    const since = Date.now() - 7 * 86400000;
    return tx(S.WORKOUTS).then(s => {
      const idx = s.index('timestamp');
      const req = idx.openCursor(IDBKeyRange.lowerBound(since));
      return new Promise((res) => {
        let total = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (!cursor.value._deleted) total += (cursor.value.tonnage || 0);
            cursor.continue();
          } else {
            res(total);
          }
        };
      });
    });
  },

  /**
   * Monthly volume (kg) — last 30 days.
   * @returns {Promise<number>}
   */
  monthlyVolume() {
    const since = Date.now() - 30 * 86400000;
    return tx(S.WORKOUTS).then(s => {
      const idx = s.index('timestamp');
      const req = idx.openCursor(IDBKeyRange.lowerBound(since));
      return new Promise((res) => {
        let total = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (!cursor.value._deleted) total += (cursor.value.tonnage || 0);
            cursor.continue();
          } else {
            res(total);
          }
        };
      });
    });
  },

  /**
   * Sessions this calendar month.
   * @returns {Promise<number>}
   */
  monthlyCount() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return tx(S.WORKOUTS).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll(IDBKeyRange.lowerBound(from))).then(list => list.filter(w => !w._deleted).length);
    });
  },

  /**
   * PPL split totals: { push, pull, legs } tonnage.
   * @returns {Promise<{push: number, pull: number, legs: number}>}
   */
  async pplTonnage() {
    const r = { push: 0, pull: 0, legs: 0 };
    await Promise.all(['push', 'pull', 'legs'].map(async (type) => {
        const s = await tx(S.WORKOUTS);
        const idx = s.index('type');
        const req = idx.openCursor(IDBKeyRange.only(type));
        return new Promise((res) => {
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (!cursor.value._deleted) r[type] += (cursor.value.tonnage || 0);
                    cursor.continue();
                } else {
                    res();
                }
            };
        });
    }));
    return r;
  },

  /**
   * Weekly tonnage per week for last N weeks (for chart).
   * @param {number} weeks
   * @returns {Promise<Array<{label: string, kg: number}>>}
   */
  weeklyTrend(weeks = 12) {
    return this.getAll().then((list) => {
      const buckets = Array.from({ length: weeks }, (_, i) => {
        const end = Date.now() - i * 7 * 86400000;
        const start = end - 7 * 86400000;
        return { label: `W-${i}`, start, end, tonnage: 0 };
      }).reverse();
      list.forEach((w) => {
        const b = buckets.find((b) => w.timestamp >= b.start && w.timestamp < b.end);
        if (b) b.tonnage += w.tonnage || 0;
      });
      return buckets;
    });
  },

  /** Delete one session by id. */
  delete(id) {
    return tx(S.WORKOUTS, 'readwrite').then((s) => {
      return req2p(s.get(id)).then((record) => {
        if (!record) return;
        record._deleted = true;
        withMeta(record);
        return req2pSafe(s.put(record), s.transaction).then(() => {
          _triggerSync(S.WORKOUTS, record);
        });
      });
    });
  },

  /** Wipe all sessions. */
  clear() {
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.clear()));
  },

  /**
   * Find and remove duplicate workouts based on timestamp and type.
   * @returns {Promise<number>} Number of duplicates removed.
   */
  async deduplicate() {
    const all = await this.getAll();
    const seen = new Set();
    const toDelete = [];

    for (const w of all) {
      const key = `${w.timestamp}-${w.type}`;
      if (seen.has(key)) {
        toDelete.push(w.id);
      } else {
        seen.add(key);
      }
    }

    if (toDelete.length > 0) {
      await Promise.all(toDelete.map(id => this.delete(id)));
    }

    return toDelete.length;
  },
};
