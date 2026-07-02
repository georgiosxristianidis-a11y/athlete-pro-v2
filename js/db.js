// @ts-check
/* ════════════════════════════════════════════════════════
   db.js — Athlete Pro  |  IndexedDB data layer
   Facade split (DB-SPLIT card): schema/open/tx plumbing lives in
   js/db/core.js, per-store modules live in js/db/*.js. This file
   re-exports the same public API (DB.*) so no caller changes.
   ════════════════════════════════════════════════════════ */

import { S, newId, getDeviceId, withMeta, openDB, tx, req2p, req2pSafe, _triggerSync } from './db/core.js';
import { Settings } from './db/settings.js';
import { OneRM } from './db/onerm.js';
import { Metrics } from './db/metrics.js';
import { Events } from './db/events.js';
import { NutritionLogs } from './db/nutrition.js';
import { PlannedWorkouts } from './db/planned.js';

export { newId, getDeviceId, withMeta, openDB };

/* ── Type definitions ── */
/**
 * @typedef {{ id: number, type: 'push'|'pull'|'legs', timestamp: number,
 *   duration: number, tonnage: number,
 *   exercises: Array<ExerciseRecord> }} WorkoutRecord
 *
 * @typedef {{ name: string, sets: Array<SetRecord> }} ExerciseRecord
 *
 * @typedef {{ weight: number, reps: number, rpe: number|null, done: boolean }} SetRecord
 *
 * @typedef {{ id: string, value: number, timestamp: number }} OneRMRecord
 *
 * @typedef {{ id: number, weight: number, height: number, bmi: number, timestamp: number }} MetricsRecord
 *
 * @typedef {{ id: number, timestamp: number, payload: Object }} NutritionRecord
 * 
 * @typedef {{ id: number, timestamp: number, name: string, payload: Object }} PlanRecord
 */

/* ════════════════════════════════════════════════════════
   WORKOUTS
   ════════════════════════════════════════════════════════ */
const Workouts = {
  /**
   * Save a completed session. Returns new id.
   * @param {WorkoutRecord} session
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
   * @returns {Promise<WorkoutRecord[]>}
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
   * @returns {Promise<WorkoutRecord[]>}
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
   * @returns {Promise<WorkoutRecord|undefined>}
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

/* ════════════════════════════════════════════════════════
   PURE AGGREGATE HELPERS  (no IDB — accept pre-fetched list)

   Period boundaries are CALENDAR-based and share one source of
   truth (startOfWeek / startOfMonth) so "Week" and "Month" stats
   stay consistent across volume AND count. Previously volume used
   rolling 7d/30d windows while count used the calendar month — that
   mismatch made Week == Month whenever all data was recent.
   ════════════════════════════════════════════════════════ */

/**
 * Start of the current ISO week (Monday 00:00) as an epoch ms.
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function startOfWeek(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const sinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/**
 * Start of the current calendar month (1st, 00:00) as an epoch ms.
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function startOfMonth(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
}

/**
 * Compute volume (tonnage) for the current calendar week.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function weeklyVolumeFrom(list, ref = new Date()) {
  const since = startOfWeek(ref);
  return list.filter(w => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

/**
 * Compute volume (tonnage) for the current calendar month.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function monthlyVolumeFrom(list, ref = new Date()) {
  const since = startOfMonth(ref);
  return list.filter(w => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

/**
 * Compute session count for the current calendar month.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function monthlyCountFrom(list, ref = new Date()) {
  const since = startOfMonth(ref);
  return list.filter(w => w.timestamp >= since).length;
}

/**
 * Compute PPL split tonnage from pre-fetched workouts array.
 * @param {WorkoutRecord[]} list
 * @returns {{push: number, pull: number, legs: number}}
 */
export function pplTonnageFrom(list) {
  const r = { push: 0, pull: 0, legs: 0 };
  list.forEach(w => { if (r[w.type] !== undefined) r[w.type] += w.tonnage || 0; });
  return r;
}

/**
 * Compute session count for the current calendar week.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function weeklyCountFrom(list, ref = new Date()) {
  const since = startOfWeek(ref);
  return list.filter(w => w.timestamp >= since).length;
}

/* ════════════════════════════════════════════════════════
   BACKUP / RESTORE
   ════════════════════════════════════════════════════════ */
const Backup = {
  /**
   * Export full DB as JSON string.
   * @returns {Promise<string>}
   */
  async export() {
    const [workouts, orm, metrics, settings] = await Promise.all([
      Workouts.getAll(),
      OneRM.getAll(),
      Metrics.getAll(),
      Settings.getAll(),
    ]);
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        workouts,
        orm,
        metrics,
        settings,
      },
      null,
      2
    );
  },

  /**
   * Import from JSON string. Merges — does NOT wipe first.
   * @param {string} jsonStr
   * @returns {Promise<boolean>}
   */
  async import(jsonStr) {
    const data = JSON.parse(jsonStr);
    
    // Structural Validation Guard
    if (!data || typeof data !== 'object') throw new Error('Invalid backup format');
    if (!Array.isArray(data.workouts)) throw new Error('Missing workouts array');
    
    // Validate core data integrity
    const validWorkouts = data.workouts.filter(w => w && w.type && Array.isArray(w.exercises));
    const validORM = Array.isArray(data.orm) ? data.orm.filter(o => o && o.id && typeof o.value === 'number') : [];
    const validMetrics = Array.isArray(data.metrics) ? data.metrics.filter(m => m && typeof m.weight === 'number') : [];
    const validSettings = (data.settings && typeof data.settings === 'object') ? data.settings : {};

    // Value-range guard. Structural validation above only checks shape; a corrupt
    // or hostile backup can still carry NaN/negative/absurd numbers that poison
    // tonnage + analytics or blow up rendering ("1,000,000 sets" DoS). Clamp
    // numerics to a sane finite range and cap collection sizes.
    const SANE = (n) => (Number.isFinite(n) && n >= 0 && n < 1e6) ? n : 0;
    validWorkouts.forEach((w) => {
      w.exercises = w.exercises.slice(0, 200).map((ex) => ({
        ...ex,
        sets: Array.isArray(ex.sets)
          ? ex.sets.slice(0, 200).map((s) => ({ ...s, weight: SANE(s.weight), reps: SANE(s.reps) }))
          : [],
      }));
    });
    validMetrics.forEach((m) => { m.weight = SANE(m.weight); });
    validORM.forEach((o) => { o.value = SANE(o.value); });

    const [wsStore, ormStore, metStore, setStore] = await Promise.all([
      tx(S.WORKOUTS, 'readwrite'),
      tx(S.ORM, 'readwrite'),
      tx(S.METRICS, 'readwrite'),
      tx(S.SETTINGS, 'readwrite'),
    ]);

    // Stamp CRDT metadata on import so restored/migrated rows sync cleanly:
    // withMeta assigns a UUID id when missing (keeps existing ids) and refreshes
    // updatedAt (= import time) + deviceId. Without it, imported rows have no
    // updatedAt and LWW would fall back to the historical workout timestamp.
    validWorkouts.forEach((w) => withMeta(w));
    validMetrics.forEach((m) => withMeta(m));
    validORM.forEach((o) => withMeta(o));

    const puts = [
      ...validWorkouts.map((w) => req2p(wsStore.put(w))),
      ...validORM.map((o) => req2p(ormStore.put(o))),
      ...validMetrics.map((m) => req2p(metStore.put(m))),
      ...Object.entries(validSettings).map(([key, value]) =>
        req2p(setStore.put({ key, value, updatedAt: Date.now(), deviceId: getDeviceId() }))
      ),
    ];
    await Promise.all(puts);
    return true;
  },
};

/* ════════════════════════════════════════════════════════
   NUKE — clear everything (Danger Zone)
   ════════════════════════════════════════════════════════ */
/** @returns {Promise<void>} */
async function clearAll() {
  await Promise.all([
    Workouts.clear(),
    OneRM.clear(),
    Metrics.clear(),
    Events.clear(),
    Settings.clear(),
  ]);
}

/* ── Public API ── */
export const DB = {
  Workouts, OneRM, Metrics, Settings, Events, NutritionLogs, PlannedWorkouts, Backup,
  clearAll, openDB, newId, getDeviceId, withMeta,
  _getRaw: (store, id) => tx(store).then(s => req2p(s.get(id))),
  // Raw writes for the sync pull path — plain put/delete with NO _triggerSync, so
  // applying a remote-won record locally never re-queues an upstream push (no echo).
  _putRaw: (store, row) => tx(store, 'readwrite').then(s => req2pSafe(s.put(row), s.transaction)),
  _delRaw: (store, id) => tx(store, 'readwrite').then(s => {
    const keyField = (store === 'settings') ? 'key' : 'id';
    return req2pSafe(s.put({ [keyField]: id, _deleted: true, updatedAt: Date.now(), deviceId: getDeviceId() }), s.transaction);
  }),
};
