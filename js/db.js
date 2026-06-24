// @ts-check
/* ════════════════════════════════════════════════════════
   db.js — Athlete Pro  |  IndexedDB data layer
   Block 2 — all stores, all CRUD, Promise-based API
   ════════════════════════════════════════════════════════ */

import { encryptAsync, decryptAsync } from './shared/cryptoClient.js';

const DB_NAME = 'athlete-pro';
const DB_VERSION = 4;

/* ════════════════════════════════════════════════════════
   CRDT FOUNDATION — decentralized IDs + LWW metadata
   New records get a UUID id, updatedAt and deviceId so they
   can merge across devices without autoIncrement collisions.
   Legacy integer ids remain valid (IDB allows mixed key types).
   ════════════════════════════════════════════════════════ */
const DEVICE_KEY = 'ap-device-id';
let _deviceId = null;

/** Collision-free record id. Falls back when crypto.randomUUID is
    unavailable (e.g. non-secure context during LAN field testing). */
export function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

/** Stable per-installation device id (persisted in localStorage). */
export function getDeviceId() {
  if (_deviceId) return _deviceId;
  try {
    _deviceId = localStorage.getItem(DEVICE_KEY);
    if (!_deviceId) {
      _deviceId = newId();
      localStorage.setItem(DEVICE_KEY, _deviceId);
    }
  } catch {
    _deviceId = 'local';
  }
  return _deviceId;
}

/** Stamp a record with CRDT metadata before writing.
    Keeps an existing id (legacy integer or UUID); always refreshes updatedAt. */
export function withMeta(record) {
  if (record.id === undefined || record.id === null) record.id = newId();
  record.updatedAt = Date.now();
  record.deviceId = getDeviceId();
  return record;
}

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
        const ws = db.createObjectStore(S.WORKOUTS, { keyPath: 'id' });
        ws.createIndex('timestamp', 'timestamp');
        ws.createIndex('type', 'type');
      }

      /* oneRM
         { id: exerciseName, value, timestamp } */
      if (!db.objectStoreNames.contains(S.ORM)) {
        db.createObjectStore(S.ORM, { keyPath: 'id' });
      }

      /* bodyMetrics
         { id (UUID), weight, height, bmi, timestamp } */
      if (!db.objectStoreNames.contains(S.METRICS)) {
        const ms = db.createObjectStore(S.METRICS, { keyPath: 'id' });
        ms.createIndex('timestamp', 'timestamp');
      }

      /* events  (audit log)
         { id (UUID), type, payload, timestamp } */
      if (!db.objectStoreNames.contains(S.EVENTS)) {
        const ev = db.createObjectStore(S.EVENTS, { keyPath: 'id' });
        ev.createIndex('timestamp', 'timestamp');
      }

      /* settings  { key, value } */
      if (!db.objectStoreNames.contains(S.SETTINGS)) {
        db.createObjectStore(S.SETTINGS, { keyPath: 'key' });
      }

      /* nutritionLogs */
      if (!db.objectStoreNames.contains(S.NUTRITION)) {
        const ns = db.createObjectStore(S.NUTRITION, { keyPath: 'id' });
        ns.createIndex('timestamp', 'timestamp');
      }

      /* plannedWorkouts */
      if (!db.objectStoreNames.contains(S.PLANS)) {
        const ps = db.createObjectStore(S.PLANS, { keyPath: 'id' });
        ps.createIndex('timestamp', 'timestamp');
      }

      /* v3 — CRDT backfill: stamp legacy records with updatedAt + deviceId.
         Only ORM + SETTINGS here — the autoIncrement stores get the same meta
         backfilled inline by the v4 re-key below (avoids a same-tx cursor/getAll
         race on those stores). Keyed-by-content stores keep their ids. */
      if (e.oldVersion > 0 && e.oldVersion < 3) {
        const upgradeTx = e.target.transaction;
        const deviceId = getDeviceId();
        [S.ORM, S.SETTINGS].forEach((name) => {
          if (!db.objectStoreNames.contains(name)) return;
          const cursorReq = upgradeTx.objectStore(name).openCursor();
          cursorReq.onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (!cursor) return;
            const rec = cursor.value;
            if (rec && typeof rec === 'object' && rec.updatedAt === undefined) {
              rec.updatedAt = rec.timestamp || Date.now();
              rec.deviceId = rec.deviceId || deviceId;
              cursor.update(rec);
            }
            cursor.continue();
          };
        });
      }

      /* v4 — drop the dormant autoIncrement. IndexedDB can't toggle autoIncrement
         on an existing store, so each is dropped + recreated keyed purely on a UUID
         `id`. Legacy integer ids are re-keyed to UUIDs and CRDT meta backfilled in
         the same pass. A throw here aborts the versionchange tx → DB stays at v3
         (atomic rollback), so a failed migration never half-writes. */
      if (e.oldVersion >= 1 && e.oldVersion < 4) {
        const upgradeTx = e.target.transaction;
        const deviceId = getDeviceId();
        /** @type {Array<[string, Array<[string, string]>]>} store → [indexName, keyPath][] */
        const specs = [
          [S.WORKOUTS,  [['timestamp', 'timestamp'], ['type', 'type']]],
          [S.METRICS,   [['timestamp', 'timestamp']]],
          [S.EVENTS,    [['timestamp', 'timestamp']]],
          [S.NUTRITION, [['timestamp', 'timestamp']]],
          [S.PLANS,     [['timestamp', 'timestamp']]],
        ];
        specs.forEach(([name, indexes]) => {
          if (!db.objectStoreNames.contains(name)) return;
          const getAllReq = upgradeTx.objectStore(name).getAll();
          getAllReq.onsuccess = () => {
            const rows = getAllReq.result || [];
            db.deleteObjectStore(name);
            const ns = db.createObjectStore(name, { keyPath: 'id' });
            indexes.forEach(([idxName, keyPath]) => ns.createIndex(idxName, keyPath));
            rows.forEach((r) => {
              if (r == null || typeof r !== 'object') return;
              if (typeof r.id !== 'string') r.id = newId(); // re-key legacy int → UUID
              if (r.updatedAt === undefined) r.updatedAt = r.timestamp || Date.now();
              if (r.deviceId === undefined) r.deviceId = deviceId;
              ns.add(r);
            });
          };
        });
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

/* Soft-delete: DB.delete() marks records with _deleted instead of physically
   removing them, so the tombstone survives to (a) win LWW against a stale remote
   copy on pull and (b) propagate the deletion to other devices. Every normal read
   path hides tombstones via this predicate; only the raw sync helpers (_getRaw)
   and the pull/merge logic see them.
   TODO(gc-tombstones): tombstones accumulate forever. Add a GC sweep that hard-
   deletes _deleted rows older than the pull high-water mark (safe once no peer can
   still reference them). Deferred — see soft-delete handoff. */
const _alive = (r) => !r || !r._deleted;

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
  return tx(store).then((s) => req2p(s.getAll())).then((list) => list.filter(_alive));
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
      return req2p(idx.getAll()).then(list => list.filter(_alive).reverse());
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
            if (_alive(cursor.value)) list.push(cursor.value);
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
          if (!cursor) return res(null);
          if (!_alive(cursor.value)) return cursor.continue(); // skip tombstones
          res(cursor.value);
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
            if (_alive(cursor.value)) total += (cursor.value.tonnage || 0);
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
            if (_alive(cursor.value)) total += (cursor.value.tonnage || 0);
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
      // Can't use idx.count() — it can't skip tombstones; walk the range instead.
      const req = idx.openCursor(IDBKeyRange.lowerBound(from));
      return new Promise((res, rej) => {
        let n = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (_alive(cursor.value)) n++;
            cursor.continue();
          } else {
            res(n);
          }
        };
        req.onerror = (e) => rej(e.target.error);
      });
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
                    if (_alive(cursor.value)) r[type] += (cursor.value.tonnage || 0);
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

  /** Soft-delete one session by id. Keeps the full record, flips _deleted so the
      tombstone wins LWW on pull and propagates the deletion to other devices. */
  async delete(id) {
    const s = await tx(S.WORKOUTS, 'readwrite');
    const existing = await req2p(s.get(id));
    const tomb = withMeta({ ...(existing || { id }), _deleted: true });
    await req2pSafe(s.put(tomb), s.transaction);
    _triggerSync(S.WORKOUTS, tomb);
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
        toDelete.push(w); // keep the full record — bulk-delete soft-deletes too
      } else {
        seen.add(key);
      }
    }

    if (toDelete.length > 0) {
      const s = await tx(S.WORKOUTS, 'readwrite');
      await Promise.all(toDelete.map((w) => {
        const tomb = withMeta({ ...w, _deleted: true });
        return req2p(s.put(tomb)).then(() => _triggerSync(S.WORKOUTS, tomb));
      }));
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
          const record = withMeta({ id: exerciseName, value, timestamp: Date.now() });
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
    return tx(S.ORM).then((s) => req2p(s.get(exerciseName))).then((r) => (_alive(r) ? r : undefined));
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

    const entry = withMeta({
      _encrypted: cryptoData.encrypted,
      _iv: cryptoData.iv,
      timestamp: Date.now(),
    });
    return tx(S.METRICS, 'readwrite').then((s) => {
      return req2pSafe(s.add(entry), s.transaction).then(() => {
        // Don't sync PII that's only base64-encoded (insecure-context fallback) —
        // it would land in the cloud unencrypted. Keep it device-local.
        if (!cryptoData.plain) _triggerSync(S.METRICS, entry);
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
      try {
        const decrypted = await decryptAsync(latestRaw._encrypted, latestRaw._iv);
        return { ...decrypted, id: latestRaw.id, timestamp: latestRaw.timestamp };
      } catch(e) {
        console.warn('[DB] Ignoring corrupted metric', latestRaw.id);
        return null;
      }
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
        try {
          const dec = await decryptAsync(r._encrypted, r._iv);
          return { ...dec, id: r.id, timestamp: r.timestamp };
        } catch(e) {
          return null;
        }
      }
      return r;
    }));
    return decryptedList.filter(x => x !== null).sort((a, b) => b.timestamp - a.timestamp);
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
    const record = { key, value, updatedAt: Date.now(), deviceId: getDeviceId() };
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
    return tx(S.SETTINGS).then((s) => req2p(s.get(key)).then((r) => (r && _alive(r) ? r.value : fallback)));
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
    // EVENTS is no longer autoIncrement — assign an explicit UUID id. Local-only
    // audit log, so no CRDT meta / sync needed.
    return tx(S.EVENTS, 'readwrite').then((s) =>
      req2pSafe(s.add({ id: newId(), type, payload, timestamp: Date.now() }), s.transaction)
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
    const entry = withMeta({ payload, timestamp: Date.now() });
    return tx(S.NUTRITION, 'readwrite').then((s) =>
      req2pSafe(s.add(entry), s.transaction).then(() => {
        _triggerSync(S.NUTRITION, entry);
        return entry.id;
      })
    );
  },
  getAll() {
    return tx(S.NUTRITION).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.filter(_alive).reverse());
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
    const entry = withMeta({ name, payload, timestamp: Date.now() });
    return tx(S.PLANS, 'readwrite').then((s) =>
      req2pSafe(s.add(entry), s.transaction).then(() => {
        _triggerSync(S.PLANS, entry);
        return entry.id;
      })
    );
  },
  getAll() {
    return tx(S.PLANS).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.filter(_alive).reverse());
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
  // Soft-delete on the raw pull path too: applying a remote tombstone writes a
  // local tombstone (not a hard delete) so the deletion keeps winning LWW and is
  // never silently resurrected by a later stale push. No _triggerSync (no echo).
  _delRaw: (store, id) => tx(store, 'readwrite').then(async (s) => {
    const existing = await req2p(s.get(id));
    const tomb = existing
      ? { ...existing, _deleted: true, updatedAt: Date.now(), deviceId: getDeviceId() }
      : { [s.keyPath]: id, _deleted: true, updatedAt: Date.now(), deviceId: getDeviceId() };
    return req2pSafe(s.put(tomb), s.transaction);
  }),
};
export { openDB };
