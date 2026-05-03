/* ════════════════════════════════════════════════════════
   db-firebase.js — Athlete Pro  |  Firebase Firestore layer
   Drop-in copy of db.js using Cloud Firestore instead of
   IndexedDB.  Exposes the same API surface as `DB` so
   either layer can be used without changing other files.

   Usage:
     1. Call FirebaseDB.init(config) before any other call.
     2. config comes from /api/firebase-config (see server.js)
        or can be passed manually.
     3. Replace DB with FirebaseDB (or keep both for sync).

   NOTE: Firestore IDs are strings, not auto-increment ints.
         All methods that accept/return `id` use string IDs.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

export const FirebaseDB = (() => {
  let _db = null;
  let _app = null;
  let _ready = false;

  /* ── Collection names (mirror db.js S constants) ── */
  const C = {
    WORKOUTS: 'workouts',
    ORM: 'oneRM',
    METRICS: 'bodyMetrics',
    EVENTS: 'events',
    SETTINGS: 'settings',
  };

  /* ════════════════════════════════════════════════════
     DYNAMIC SDK LOADER — injects Firebase scripts only
     when Firebase is configured and needed
     ════════════════════════════════════════════════════ */

  function _loadFirebaseSDK() {
    if (window.firebase) return Promise.resolve();
    const BASE = 'https://www.gstatic.com/firebasejs/10.12.0/';
    function _injectScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('[FirebaseDB] Failed to load: ' + src));
        document.head.appendChild(s);
      });
    }
    return _injectScript(BASE + 'firebase-app-compat.js')
      .then(() => _injectScript(BASE + 'firebase-firestore-compat.js'));
  }

  /* ════════════════════════════════════════════════════
     INIT — call once with Firebase project config
     ════════════════════════════════════════════════════ */

  /**
   * Initialize Firebase and Firestore.
   * config = { apiKey, authDomain, projectId, appId }
   * Returns the Firestore db instance.
   */
  function init(config) {
    if (_db) return _db;
    if (!config || !config.projectId) {
      throw new Error('[FirebaseDB] init() requires a valid Firebase config object.');
    }

    /* Prevent double-initialize if firebase app already exists */
    try {
      _app = firebase.app();
    } catch (_) {
      _app = firebase.initializeApp(config);
    }

    _db = firebase.firestore();
    _ready = true;
    console.info('[FirebaseDB] Connected to project:', config.projectId);
    return _db;
  }

  /**
   * Auto-initialize by fetching config from the local server.
   * Returns a Promise<Firestore | null>.
   */
  async function autoInit() {
    if (_db) return _db;
    try {
      const res = await fetch('/api/firebase-config');
      const cfg = await res.json();
      if (!cfg.configured) {
        console.warn('[FirebaseDB] Not configured. Add Firebase vars to .env');
        return null;
      }
      await _loadFirebaseSDK();
      return init(cfg);
    } catch (err) {
      console.error('[FirebaseDB] autoInit failed:', err.message);
      return null;
    }
  }

  function isReady() {
    return _ready;
  }

  /* ── Internal: get store or throw ── */
  function db() {
    if (!_db)
      throw new Error(
        '[FirebaseDB] Not initialized. Call FirebaseDB.init() or FirebaseDB.autoInit() first.'
      );
    return _db;
  }

  /* ── Internal: delete every doc in a collection ── */
  async function _clearCollection(collName) {
    const snap = await db().collection(collName).get();
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    return batch.commit();
  }

  /* ── Internal: map a Firestore doc to a plain object ── */
  function _doc(d) {
    return { id: d.id, ...d.data() };
  }

  /* ════════════════════════════════════════════════════
     WORKOUTS
     Schema: { type, date, timestamp, duration,
               tonnage, exercises: [{name,sets:[…]}] }
     Firestore ID: auto-generated string
     ════════════════════════════════════════════════════ */
  const Workouts = {
    /** Save a completed session. Returns the new Firestore doc ID. */
    save(session) {
      session.timestamp = session.timestamp || Date.now();
      return db()
        .collection(C.WORKOUTS)
        .add(session)
        .then((ref) => ref.id);
    },

    /** All sessions sorted newest first. */
    getAll() {
      return db()
        .collection(C.WORKOUTS)
        .orderBy('timestamp', 'desc')
        .get()
        .then((snap) => snap.docs.map(_doc));
    },

    /** Last N sessions. */
    getLast(n = 5) {
      return db()
        .collection(C.WORKOUTS)
        .orderBy('timestamp', 'desc')
        .limit(n)
        .get()
        .then((snap) => snap.docs.map(_doc));
    },

    /** Last session of a specific type (push/pull/legs). */
    getLastByType(type) {
      return db()
        .collection(C.WORKOUTS)
        .where('type', '==', type)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get()
        .then((snap) => (snap.empty ? null : _doc(snap.docs[0])));
    },

    /** Weekly volume (kg) — last 7 days. */
    weeklyVolume() {
      const since = Date.now() - 7 * 86400000;
      return db()
        .collection(C.WORKOUTS)
        .where('timestamp', '>=', since)
        .get()
        .then((snap) => snap.docs.reduce((sum, d) => sum + (d.data().tonnage || 0), 0));
    },

    /** Monthly volume (kg) — last 30 days. */
    monthlyVolume() {
      const since = Date.now() - 30 * 86400000;
      return db()
        .collection(C.WORKOUTS)
        .where('timestamp', '>=', since)
        .get()
        .then((snap) => snap.docs.reduce((sum, d) => sum + (d.data().tonnage || 0), 0));
    },

    /** Sessions this calendar month. */
    monthlyCount() {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return db()
        .collection(C.WORKOUTS)
        .where('timestamp', '>=', from)
        .get()
        .then((snap) => snap.size);
    },

    /** PPL split tonnage totals: { push, pull, legs }. */
    async pplTonnage() {
      const snap = await db().collection(C.WORKOUTS).get();
      const r = { push: 0, pull: 0, legs: 0 };
      snap.docs.forEach((d) => {
        const w = d.data();
        if (r[w.type] !== undefined) r[w.type] += w.tonnage || 0;
      });
      return r;
    },

    /** Weekly tonnage per week for last N weeks (for chart). */
    async weeklyTrend(weeks = 12) {
      const since = Date.now() - weeks * 7 * 86400000;
      const snap = await db().collection(C.WORKOUTS).where('timestamp', '>=', since).get();

      const buckets = Array.from({ length: weeks }, (_, i) => {
        const end = Date.now() - i * 7 * 86400000;
        const start = end - 7 * 86400000;
        return { label: `W-${i}`, start, end, tonnage: 0 };
      }).reverse();

      snap.docs.forEach((d) => {
        const w = d.data();
        const b = buckets.find((b) => w.timestamp >= b.start && w.timestamp < b.end);
        if (b) b.tonnage += w.tonnage || 0;
      });

      return buckets;
    },

    /** Delete one session by Firestore document ID. */
    delete(id) {
      return db().collection(C.WORKOUTS).doc(id).delete();
    },

    /** Wipe all sessions. */
    clear() {
      return _clearCollection(C.WORKOUTS);
    },
  };

  /* ════════════════════════════════════════════════════
     ONE-REP MAX  (Epley: 1RM = w × (1 + r/30))
     Firestore ID: exercise name (human-readable key)
     ════════════════════════════════════════════════════ */
  const OneRM = {
    epley(weight, reps) {
      if (reps === 1) return weight;
      return Math.round(weight * (1 + reps / 30));
    },

    /** Update if new computed 1RM is higher than stored. */
    async update(exerciseName, weight, reps) {
      const value = this.epley(weight, reps);
      const ref = db().collection(C.ORM).doc(exerciseName);
      const doc = await ref.get();
      if (!doc.exists || value > doc.data().value) {
        return ref.set({ id: exerciseName, value, timestamp: Date.now() });
      }
    },

    /** Get 1RM record for one exercise. */
    get(exerciseName) {
      return db()
        .collection(C.ORM)
        .doc(exerciseName)
        .get()
        .then((d) => (d.exists ? _doc(d) : null));
    },

    /** Get all 1RM records. */
    getAll() {
      return db()
        .collection(C.ORM)
        .get()
        .then((snap) => snap.docs.map(_doc));
    },

    clear() {
      return _clearCollection(C.ORM);
    },
  };

  /* ════════════════════════════════════════════════════
     BODY METRICS
     Schema: { weight, height, bmi, timestamp }
     ════════════════════════════════════════════════════ */
  const Metrics = {
    bmi(weight, heightCm) {
      const h = heightCm / 100;
      return Math.round((weight / (h * h)) * 10) / 10;
    },

    save(weight, heightCm) {
      const entry = {
        weight,
        height: heightCm,
        bmi: this.bmi(weight, heightCm),
        timestamp: Date.now(),
      };
      return db()
        .collection(C.METRICS)
        .add(entry)
        .then((ref) => ref.id);
    },

    latest() {
      return db()
        .collection(C.METRICS)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get()
        .then((snap) => (snap.empty ? null : _doc(snap.docs[0])));
    },

    getAll() {
      return db()
        .collection(C.METRICS)
        .orderBy('timestamp', 'desc')
        .get()
        .then((snap) => snap.docs.map(_doc));
    },

    clear() {
      return _clearCollection(C.METRICS);
    },
  };

  /* ════════════════════════════════════════════════════
     SETTINGS  (key-value store)
     Firestore ID: setting key (e.g. 'weightUnit')
     ════════════════════════════════════════════════════ */
  const Settings = {
    set(key, value) {
      return db().collection(C.SETTINGS).doc(key).set({ key, value });
    },

    get(key, fallback = null) {
      return db()
        .collection(C.SETTINGS)
        .doc(key)
        .get()
        .then((d) => (d.exists ? d.data().value : fallback));
    },

    async getAll() {
      const snap = await db().collection(C.SETTINGS).get();
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data().value;
      });
      return map;
    },

    clear() {
      return _clearCollection(C.SETTINGS);
    },
  };

  /* ════════════════════════════════════════════════════
     EVENTS  (audit log — append only)
     ════════════════════════════════════════════════════ */
  const Events = {
    log(type, payload = {}) {
      return db().collection(C.EVENTS).add({ type, payload, timestamp: Date.now() });
    },

    getAll() {
      return db()
        .collection(C.EVENTS)
        .orderBy('timestamp', 'desc')
        .get()
        .then((snap) => snap.docs.map(_doc));
    },

    clear() {
      return _clearCollection(C.EVENTS);
    },
  };

  /* ════════════════════════════════════════════════════
     BACKUP / RESTORE
     Same JSON format as db.js Backup so files are
     interchangeable between IndexedDB and Firestore.
     ════════════════════════════════════════════════════ */
  const Backup = {
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
          source: 'firebase',
          workouts,
          orm,
          metrics,
          settings,
        },
        null,
        2
      );
    },

    async import(jsonStr) {
      const data = JSON.parse(jsonStr);
      if (!data.workouts) throw new Error('Invalid backup file');

      const batchWrite = async (items, collName, keyFn = null) => {
        /* Firestore batch limit is 500 ops — split if needed */
        const chunks = [];
        for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
        for (const chunk of chunks) {
          const batch = db().batch();
          chunk.forEach((item) => {
            const id = keyFn ? keyFn(item) : db().collection(collName).doc().id;
            const ref = db().collection(collName).doc(String(id));
            batch.set(ref, item);
          });
          await batch.commit();
        }
      };

      await batchWrite(data.workouts, C.WORKOUTS);
      await batchWrite(data.orm, C.ORM, (o) => o.id);
      await batchWrite(data.metrics, C.METRICS);

      /* Settings is an object map, not an array */
      const settingsArr = Object.entries(data.settings || {}).map(([key, value]) => ({
        key,
        value,
      }));
      await batchWrite(settingsArr, C.SETTINGS, (s) => s.key);

      return true;
    },
  };

  /* ════════════════════════════════════════════════════
     NUKE — clear all collections
     ════════════════════════════════════════════════════ */
  async function clearAll() {
    await Promise.all([
      Workouts.clear(),
      OneRM.clear(),
      Metrics.clear(),
      Events.clear(),
      Settings.clear(),
    ]);
  }

  /* ════════════════════════════════════════════════════
     PUBLIC API  — mirrors DB from db.js exactly
     ════════════════════════════════════════════════════ */
  return {
    /* Setup */
    init,
    autoInit,
    isReady,

    /* Data stores */
    Workouts,
    OneRM,
    Metrics,
    Settings,
    Events,
    Backup,
    clearAll,
  };
})();
