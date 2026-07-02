// @ts-check
/* ════════════════════════════════════════════════════════
   db/core.js — Athlete Pro | IndexedDB open/migrations + shared helpers
   Facade split (DB-SPLIT card): schema + tx plumbing lives here so
   per-store modules (settings.js, ...) can import it without duplicating
   the upgrade/migration logic. js/db.js re-exports everything for the
   existing public API (DB.*) — no caller changes.
   ════════════════════════════════════════════════════════ */

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
export const S = {
  WORKOUTS: 'workouts', // completed sessions
  ORM: 'oneRM', // estimated 1RM per exercise
  METRICS: 'bodyMetrics', // weight / height over time
  EVENTS: 'events', // audit log
  SETTINGS: 'settings', // key-value prefs
  NUTRITION: 'nutritionLogs', // tracked meals
  PLANS: 'plannedWorkouts', // AI generated plans
};

/* ════════════════════════════════════════════════════════
   OPEN
   ════════════════════════════════════════════════════════ */
let _db = null;

/** @returns {Promise<IDBDatabase>} */
export function openDB() {
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
export function tx(store, mode = 'readonly') {
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

export function req2pSafe(r, tx) {
  return new Promise((res, rej) => {
    let result = null;
    r.onsuccess = (e) => { result = e.target.result; };
    r.onerror = (e) => rej(e.target.error);
    tx.oncomplete = () => res(result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(new Error('Tx aborted'));
  });
}

export function req2p(r) {
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
export async function _triggerSync(store, data) {
  try {
    // Avoid circular import by using dynamic import
    const { getPrivacyMode } = await import('../privacy.store.js');
    if (getPrivacyMode() === 'airgap') return;

    const { SyncManager } = await import('../sync.js');
    SyncManager.push(store, data);
  } catch (e) {
    console.warn('[DB] Sync trigger failed', e);
  }
}

export function getAll(store) {
  return tx(store).then((s) => req2p(s.getAll()));
}
