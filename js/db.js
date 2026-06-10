// @ts-check
/* ════════════════════════════════════════════════════════
   db.js — Athlete Pro  |  IndexedDB data layer
   Block 2 — all stores, all CRUD, Promise-based API
   ════════════════════════════════════════════════════════ */

import { encryptAsync, decryptAsync } from './shared/cryptoClient.js';

const DB_NAME = 'athlete-pro';
const DB_VERSION = 2;

/* ── Store names ── */
const S = {
  WORKOUTS: 'workouts', // completed sessions
  ORM: 'oneRM', // estimated 1RM per exercise
  METRICS: 'bodyMetrics', // weight / height over time
  EVENTS: 'events', // audit log
  SETTINGS: 'settings', // key-value prefs
  NUTRITION: 'nutritionLogs', // tracked meals
  PLANS: 'plannedWorkouts', // AI generated plans
};

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
   OPEN
   ════════════════════════════════════════════════════════ */
let _db = null;

/** @returns {Promise<IDBDatabase>} */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      /* workouts
         { id, type, date, timestamp, duration,
           tonnage, exercises: [{name,sets:[{weight,reps,completed}]}] } */
      if (!db.objectStoreNames.contains(S.WORKOUTS)) {
        const ws = db.createObjectStore(S.WORKOUTS, { keyPath: 'id', autoIncrement: true });
        ws.createIndex('timestamp', 'timestamp');
        ws.createIndex('type', 'type');
      }

      /* oneRM
         { id: exerciseName, value, timestamp } */
      if (!db.objectStoreNames.contains(S.ORM)) {
        db.createObjectStore(S.ORM, { keyPath: 'id' });
      }

      /* bodyMetrics
         { id (autoIncrement), weight, height, bmi, timestamp } */
      if (!db.objectStoreNames.contains(S.METRICS)) {
        const ms = db.createObjectStore(S.METRICS, { keyPath: 'id', autoIncrement: true });
        ms.createIndex('timestamp', 'timestamp');
      }

      /* events  (audit log)
         { id, type, payload, timestamp } */
      if (!db.objectStoreNames.contains(S.EVENTS)) {
        const ev = db.createObjectStore(S.EVENTS, { keyPath: 'id', autoIncrement: true });
        ev.createIndex('timestamp', 'timestamp');
      }

      /* settings  { key, value } */
      if (!db.objectStoreNames.contains(S.SETTINGS)) {
        db.createObjectStore(S.SETTINGS, { keyPath: 'key' });
      }

      /* nutritionLogs */
      if (!db.objectStoreNames.contains(S.NUTRITION)) {
        const ns = db.createObjectStore(S.NUTRITION, { keyPath: 'id', autoIncrement: true });
        ns.createIndex('timestamp', 'timestamp');
      }

      /* plannedWorkouts */
      if (!db.objectStoreNames.contains(S.PLANS)) {
        const ps = db.createObjectStore(S.PLANS, { keyPath: 'id', autoIncrement: true });
        ps.createIndex('timestamp', 'timestamp');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/* ── Internal helpers ── */
function tx(store, mode = 'readonly') {
  return openDB().then((db) => {
    try {
      return db.transaction(store, mode).objectStore(store);
    } catch (e) {
      // Connection was closed externally (e.g. versionchange); reopen once
      _db = null;
      return openDB().then((db2) => db2.transaction(store, mode).objectStore(store));
    }
  });
}

function req2pSafe(r, tx) {
  return new Promise((res, rej) => {
    let result = null;
    r.onsuccess = (e) => { result = e.target.result; };
    r.onerror = (e) => rej(e.target.error);
    tx.oncomplete = () => res(result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(new Error('Tx aborted'));
  });
}

function req2p(r) {
  return new Promise((res, rej) => {
    r.onsuccess = (e) => res(e.target.result);
    r.onerror = (e) => rej(e.target.error);
  });
}

/**
 * Trigger background sync if allowed by privacy settings.
 * @param {string} store 
 * @param {any} data 
 */
async function _triggerSync(store, data) {
  try {
    // Avoid circular import by using dynamic import
    const { getPrivacyMode } = await import('./privacy.store.js');
    if (getPrivacyMode() === 'airgap') return;
    
    const { SyncManager } = await import('./sync.js');
    SyncManager.push(store, data);
  } catch (e) {
    console.warn('[DB] Sync trigger failed', e);
  }
}

function getAll(store) {
  return tx(store).then((s) => req2p(s.getAll()));
}

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
    return tx(S.WORKOUTS, 'readwrite').then((s) =>
      req2pSafe(s.add(session), s.transaction).then((id) => {
        session.id = id;
        _triggerSync(S.WORKOUTS, session);
        return id;
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
      return req2p(idx.getAll()).then(list => list.reverse());
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
            list.push(cursor.value);
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
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.delete(id)));
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
        req.onsuccess = (e) => res(e.target.result?.value || null);
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
            total += (cursor.value.tonnage || 0);
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
            total += (cursor.value.tonnage || 0);
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
      return req2p(idx.count(IDBKeyRange.lowerBound(from)));
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
                    r[type] += (cursor.value.tonnage || 0);
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
    // Queue a tombstone so cloud also removes the record
    _triggerSync(S.WORKOUTS, { id, _deleted: true, timestamp: Date.now() });
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.delete(id)));
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
      const s = await tx(S.WORKOUTS, 'readwrite');
      await Promise.all(toDelete.map(id => req2p(s.delete(id))));
    }

    return toDelete.length;
  },
};

/* ════════════════════════════════════════════════════════
   PURE AGGREGATE HELPERS  (no IDB — accept pre-fetched list)
   ════════════════════════════════════════════════════════ */

/**
 * Compute weekly volume from pre-fetched workouts array.
 * @param {WorkoutRecord[]} list
 * @returns {number}
 */
export function weeklyVolumeFrom(list) {
  const since = Date.now() - 7 * 86400000;
  return list.filter(w => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

/**
 * Compute monthly volume from pre-fetched workouts array.
 * @param {WorkoutRecord[]} list
 * @returns {number}
 */
export function monthlyVolumeFrom(list) {
  const since = Date.now() - 30 * 86400000;
  return list.filter(w => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

/**
 * Compute sessions this calendar month from pre-fetched workouts array.
 * @param {WorkoutRecord[]} list
 * @returns {number}
 */
export function monthlyCountFrom(list) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return list.filter(w => w.timestamp >= from).length;
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
 * Compute session count for the last 7 days from pre-fetched workouts array.
 * @param {WorkoutRecord[]} list
 * @returns {number}
 */
export function weeklyCountFrom(list) {
  const since = Date.now() - 7 * 86400000;
  return list.filter(w => w.timestamp >= since).length;
}

/* ════════════════════════════════════════════════════════
   ONE-REP MAX  (Epley: 1RM = w × (1 + r/30))
   ════════════════════════════════════════════════════════ */
const OneRM = {
  /**
   * Epley formula: estimated 1RM from working weight and reps.
   * @param {number} weight
   * @param {number} reps
   * @returns {number}
   */
  epley(weight, reps) {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  },

  /**
   * Update 1RM for an exercise if new value is higher.
   * @param {string} name
   * @param {number} weight
   * @param {number} reps
   * @returns {Promise<void>}
   */
  update(exerciseName, weight, reps) {
    const value = this.epley(weight, reps);
    return tx(S.ORM, 'readwrite').then((s) => {
      return req2p(s.get(exerciseName)).then((existing) => {
        if (!existing || value > existing.value) {
          const record = { id: exerciseName, value, timestamp: Date.now() };
          return req2pSafe(s.put(record), s.transaction).then(() => {
            _triggerSync(S.ORM, record);
          });
        }
      });
    });
  },

  /**
   * Get 1RM for one exercise.
   * @param {string} name
   * @returns {Promise<OneRMRecord|undefined>}
   */
  get(exerciseName) {
    return tx(S.ORM).then((s) => req2p(s.get(exerciseName)));
  },

  /**
   * Get all 1RMs.
   * @returns {Promise<OneRMRecord[]>}
   */
  getAll() {
    return getAll(S.ORM);
  },

  /** Clear all. */
  clear() {
    return tx(S.ORM, 'readwrite').then((s) => req2p(s.clear()));
  },
};

/* ════════════════════════════════════════════════════════
   BODY METRICS
   ════════════════════════════════════════════════════════ */
const Metrics = {
  /**
   * Calculate BMI.
   * @param {number} weight
   * @param {number} heightCm
   * @returns {number}
   */
  bmi(weight, heightCm) {
    const h = heightCm / 100;
    return Math.round((weight / (h * h)) * 10) / 10;
  },

  /**
   * Save a metrics entry.
   * @param {number} weight
   * @param {number} heightCm
   * @returns {Promise<void>}
   */
  async save(weight, heightCm) {
    const rawData = {
      weight,
      height: heightCm,
      bmi: this.bmi(weight, heightCm)
    };
    
    // Encrypt sensitive PII
    const cryptoData = await encryptAsync(rawData);

    const entry = {
      _encrypted: cryptoData.encrypted,
      _iv: cryptoData.iv,
      timestamp: Date.now(),
    };
    return tx(S.METRICS, 'readwrite').then((s) => {
      return req2pSafe(s.add(entry), s.transaction).then((id) => {
        entry.id = id;
        _triggerSync(S.METRICS, entry);
      });
    });
  },

  /**
   * Get latest entry.
   * @returns {Promise<MetricsRecord|undefined>}
   */
  async latest() {
    const list = await getAll(S.METRICS);
    if (!list.length) return null;
    const latestRaw = list.sort((a, b) => b.timestamp - a.timestamp)[0];
    
    if (latestRaw._encrypted) {
      const decrypted = await decryptAsync(latestRaw._encrypted, latestRaw._iv);
      return { ...decrypted, id: latestRaw.id, timestamp: latestRaw.timestamp };
    }
    return latestRaw;
  },

  /**
   * Get all entries sorted newest first (for chart).
   * @returns {Promise<MetricsRecord[]>}
   */
  async getAll() {
    const list = await getAll(S.METRICS);
    const decryptedList = await Promise.all(list.map(async (r) => {
      if (r._encrypted) {
        const dec = await decryptAsync(r._encrypted, r._iv);
        return { ...dec, id: r.id, timestamp: r.timestamp };
      }
      return r;
    }));
    return decryptedList.sort((a, b) => b.timestamp - a.timestamp);
  },

  /** Clear all. */
  clear() {
    return tx(S.METRICS, 'readwrite').then((s) => req2p(s.clear()));
  },
};

/* ════════════════════════════════════════════════════════
   SETTINGS  (key-value store)
   ════════════════════════════════════════════════════════ */
const Settings = {
  /**
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    const record = { key, value };
    await tx(S.SETTINGS, 'readwrite').then((s) => req2pSafe(s.put(record), s.transaction));
    
    // Don't sync internal/temporary settings
    if (!key.startsWith('privacy.audit') && !key.startsWith('ap-')) {
      _triggerSync(S.SETTINGS, record);
    }
  },

  /**
   * @param {string} key
   * @param {*} [fallback]
   * @returns {Promise<*>}
   */
  get(key, fallback = null) {
    return tx(S.SETTINGS).then((s) => req2p(s.get(key)).then((r) => (r ? r.value : fallback)));
  },

  /**
   * @returns {Promise<Object<string, *>>}
   */
  getAll() {
    return getAll(S.SETTINGS).then((list) => {
      const map = {};
      list.forEach((r) => {
        map[r.key] = r.value;
      });
      return map;
    });
  },

  clear() {
    return tx(S.SETTINGS, 'readwrite').then((s) => req2p(s.clear()));
  },
};

/* ════════════════════════════════════════════════════════
   EVENTS  (audit log — append only)
   ════════════════════════════════════════════════════════ */
const Events = {
  log(type, payload = {}) {
    return tx(S.EVENTS, 'readwrite').then((s) =>
      req2pSafe(s.add({ type, payload, timestamp: Date.now() }), s.transaction)
    );
  },

  getAll() {
    return getAll(S.EVENTS).then((list) => list.sort((a, b) => b.timestamp - a.timestamp));
  },

  clear() {
    return tx(S.EVENTS, 'readwrite').then((s) => req2p(s.clear()));
  },
};

/* ════════════════════════════════════════════════════════
   NUTRITION LOGS
   ════════════════════════════════════════════════════════ */
const NutritionLogs = {
  save(payload) {
    const entry = { payload, timestamp: Date.now() };
    return tx(S.NUTRITION, 'readwrite').then((s) =>
      req2pSafe(s.add(entry), s.transaction).then((id) => {
        entry.id = id;
        _triggerSync(S.NUTRITION, entry);
        return id;
      })
    );
  },
  getAll() {
    return tx(S.NUTRITION).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.reverse());
    });
  },
  clear() {
    return tx(S.NUTRITION, 'readwrite').then((s) => req2p(s.clear()));
  }
};

/* ════════════════════════════════════════════════════════
   PLANNED WORKOUTS (AI Generated)
   ════════════════════════════════════════════════════════ */
const PlannedWorkouts = {
  save(name, payload) {
    const entry = { name, payload, timestamp: Date.now() };
    return tx(S.PLANS, 'readwrite').then((s) =>
      req2pSafe(s.add(entry), s.transaction).then((id) => {
        entry.id = id;
        _triggerSync(S.PLANS, entry);
        return id;
      })
    );
  },
  getAll() {
    return tx(S.PLANS).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.reverse());
    });
  },
  clear() {
    return tx(S.PLANS, 'readwrite').then((s) => req2p(s.clear()));
  }
};

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
    
    // 🛡️ Structural Validation Guard
    if (!data || typeof data !== 'object') throw new Error('Invalid backup format');
    if (!Array.isArray(data.workouts)) throw new Error('Missing workouts array');
    
    // Validate core data integrity
    const validWorkouts = data.workouts.filter(w => w && w.type && Array.isArray(w.exercises));
    const validORM = Array.isArray(data.orm) ? data.orm.filter(o => o && o.id && typeof o.value === 'number') : [];
    const validMetrics = Array.isArray(data.metrics) ? data.metrics.filter(m => m && typeof m.weight === 'number') : [];
    const validSettings = (data.settings && typeof data.settings === 'object') ? data.settings : {};

    const [wsStore, ormStore, metStore, setStore] = await Promise.all([
      tx(S.WORKOUTS, 'readwrite'),
      tx(S.ORM, 'readwrite'),
      tx(S.METRICS, 'readwrite'),
      tx(S.SETTINGS, 'readwrite'),
    ]);

    const puts = [
      ...validWorkouts.map((w) => req2p(wsStore.put(w))),
      ...validORM.map((o) => req2p(ormStore.put(o))),
      ...validMetrics.map((m) => req2p(metStore.put(m))),
      ...Object.entries(validSettings).map(([key, value]) =>
        req2p(setStore.put({ key, value }))
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
export const DB = { Workouts, OneRM, Metrics, Settings, Events, NutritionLogs, PlannedWorkouts, Backup, clearAll, openDB, _getRaw: (store, id) => tx(store).then(s => req2p(s.get(id))) };
export { openDB };
