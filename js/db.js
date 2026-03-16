/* ════════════════════════════════════════════════════════
   db.js — Athlete Pro  |  IndexedDB data layer
   Block 2 — all stores, all CRUD, Promise-based API
   ════════════════════════════════════════════════════════ */

'use strict';

const DB_NAME = 'athlete-pro';
const DB_VERSION = 1;

/* ── Store names ── */
const S = {
  WORKOUTS: 'workouts', // completed sessions
  ORM: 'oneRM', // estimated 1RM per exercise
  METRICS: 'bodyMetrics', // weight / height over time
  EVENTS: 'events', // audit log
  SETTINGS: 'settings', // key-value prefs
};

/* ════════════════════════════════════════════════════════
   OPEN
   ════════════════════════════════════════════════════════ */
let _db = null;

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
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/* ── Internal helpers ── */
function tx(store, mode = 'readonly') {
  return openDB().then((db) => {
    const t = db.transaction(store, mode);
    return t.objectStore(store);
  });
}

function req2p(r) {
  return new Promise((res, rej) => {
    r.onsuccess = (e) => res(e.target.result);
    r.onerror = (e) => rej(e.target.error);
  });
}

function getAll(store) {
  return tx(store).then((s) => req2p(s.getAll()));
}

/* ════════════════════════════════════════════════════════
   WORKOUTS
   ════════════════════════════════════════════════════════ */
const Workouts = {
  /** Save a completed session. Returns new id. */
  save(session) {
    session.timestamp = session.timestamp || Date.now();
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.add(session)));
  },

  /** Get all sessions, sorted newest first. */
  getAll() {
    return getAll(S.WORKOUTS).then((list) => list.sort((a, b) => b.timestamp - a.timestamp));
  },

  /** Get last N sessions. */
  getLast(n = 5) {
    return this.getAll().then((list) => list.slice(0, n));
  },

  /** Delete a workout by id. */
  deleteById(id) {
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.delete(id)));
  },

  /** Get last session of a specific type (push/pull/legs). */
  getLastByType(type) {
    return this.getAll().then((list) => list.find((w) => w.type === type) || null);
  },

  /** Weekly volume (kg) — last 7 days. */
  weeklyVolume() {
    const since = Date.now() - 7 * 86400000;
    return this.getAll().then((list) =>
      list.filter((w) => w.timestamp >= since).reduce((sum, w) => sum + (w.tonnage || 0), 0)
    );
  },

  /** Monthly volume (kg) — last 30 days. */
  monthlyVolume() {
    const since = Date.now() - 30 * 86400000;
    return this.getAll().then((list) =>
      list.filter((w) => w.timestamp >= since).reduce((sum, w) => sum + (w.tonnage || 0), 0)
    );
  },

  /** Sessions this calendar month. */
  monthlyCount() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return this.getAll().then((list) => list.filter((w) => w.timestamp >= from).length);
  },

  /** PPL split totals: { push, pull, legs } tonnage. */
  pplTonnage() {
    return this.getAll().then((list) => {
      const r = { push: 0, pull: 0, legs: 0 };
      list.forEach((w) => {
        if (r[w.type] !== undefined) r[w.type] += w.tonnage || 0;
      });
      return r;
    });
  },

  /** Weekly tonnage per week for last 12 weeks (for chart). */
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
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.delete(id)));
  },

  /** Wipe all sessions. */
  clear() {
    return tx(S.WORKOUTS, 'readwrite').then((s) => req2p(s.clear()));
  },
};

/* ════════════════════════════════════════════════════════
   ONE-REP MAX  (Epley: 1RM = w × (1 + r/30))
   ════════════════════════════════════════════════════════ */
const OneRM = {
  epley(weight, reps) {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  },

  /** Update 1RM for an exercise if new value is higher. */
  update(exerciseName, weight, reps) {
    const value = this.epley(weight, reps);
    return tx(S.ORM, 'readwrite').then((s) => {
      return req2p(s.get(exerciseName)).then((existing) => {
        if (!existing || value > existing.value) {
          return req2p(s.put({ id: exerciseName, value, timestamp: Date.now() }));
        }
      });
    });
  },

  /** Get 1RM for one exercise. */
  get(exerciseName) {
    return tx(S.ORM).then((s) => req2p(s.get(exerciseName)));
  },

  /** Get all 1RMs. */
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
  bmi(weight, heightCm) {
    const h = heightCm / 100;
    return Math.round((weight / (h * h)) * 10) / 10;
  },

  /** Save a metrics entry. */
  save(weight, heightCm) {
    const entry = {
      weight,
      height: heightCm,
      bmi: this.bmi(weight, heightCm),
      timestamp: Date.now(),
    };
    return tx(S.METRICS, 'readwrite').then((s) => req2p(s.add(entry)));
  },

  /** Get latest entry. */
  latest() {
    return getAll(S.METRICS).then((list) => {
      if (!list.length) return null;
      return list.sort((a, b) => b.timestamp - a.timestamp)[0];
    });
  },

  /** Get all entries sorted newest first (for chart). */
  getAll() {
    return getAll(S.METRICS).then((list) => list.sort((a, b) => b.timestamp - a.timestamp));
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
  set(key, value) {
    return tx(S.SETTINGS, 'readwrite').then((s) => req2p(s.put({ key, value })));
  },

  get(key, fallback = null) {
    return tx(S.SETTINGS).then((s) => req2p(s.get(key)).then((r) => (r ? r.value : fallback)));
  },

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
      req2p(s.add({ type, payload, timestamp: Date.now() }))
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
   BACKUP / RESTORE
   ════════════════════════════════════════════════════════ */
const Backup = {
  /** Export full DB as JSON string. */
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

  /** Import from JSON string. Merges — does NOT wipe first. */
  async import(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.workouts) throw new Error('Invalid backup file');

    const [wsStore, ormStore, metStore, setStore] = await Promise.all([
      tx(S.WORKOUTS, 'readwrite'),
      tx(S.ORM, 'readwrite'),
      tx(S.METRICS, 'readwrite'),
      tx(S.SETTINGS, 'readwrite'),
    ]);

    const puts = [
      ...data.workouts.map((w) => req2p(wsStore.put(w))),
      ...data.orm.map((o) => req2p(ormStore.put(o))),
      ...data.metrics.map((m) => req2p(metStore.put(m))),
      ...Object.entries(data.settings || {}).map(([key, value]) =>
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
async function clearAll() {
  await Promise.all([
    Workouts.clear(),
    OneRM.clear(),
    Metrics.clear(),
    Events.clear(),
    Settings.clear(),
  ]);
}

/* ── Init DB on load ── */
openDB().catch((err) => console.error('[db] open failed', err));

/* ── Public API ── */
const DB = { Workouts, OneRM, Metrics, Settings, Events, Backup, clearAll, openDB };
