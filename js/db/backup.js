// @ts-check
/* ════════════════════════════════════════════════════════
   db/backup.js — BACKUP / RESTORE (import/export + reminder logic)
   Facade split (DB-SPLIT card): moved verbatim from js/db.js.
   Backup JSON stays version 1 so old files and the import ETL still
   parse. Additive optional collections (`plans`, `local`) are allowed;
   a file without them imports as an empty extra, not a hard fail.
   ════════════════════════════════════════════════════════ */

import { S, getDeviceId, withMeta, openDB } from './core.js';
import { Workouts } from './workouts.js';
import { OneRM } from './onerm.js';
import { Metrics } from './metrics.js';
import { Settings } from './settings.js';
import { PlannedWorkouts } from './planned.js';

/**
 * localStorage keys that belong in a backup. The editable training plan
 * lives here (`ap-custom-plan-A/B`), not in IndexedDB — an IDB-only export
 * restored on a clean phone would silently fall back to the PPL | GIO
 * preset and look like "history came back, the plan did not".
 * Device id, in-progress session, flags, and sync cursors stay off the list.
 */
export const LOCAL_BACKUP_KEYS = Object.freeze([
  'ap-custom-plan',
  'ap-custom-plan-A',
  'ap-custom-plan-B',
  'ap-week-mode',
  'ap-core-checklist',
  'ap-custom-workouts',
  'ap-theme',
]);

/** Cap a single localStorage value so a hostile file cannot fill the origin. */
const LOCAL_VALUE_MAX = 512 * 1024;

/**
 * @returns {Record<string, string>}
 */
function readLocalBackup() {
  /** @type {Record<string, string>} */
  const local = {};
  if (typeof localStorage === 'undefined') return local;
  try {
    for (const key of LOCAL_BACKUP_KEYS) {
      const v = localStorage.getItem(key);
      if (v !== null) local[key] = v;
    }
  } catch {
    /* private mode / missing storage */
  }
  return local;
}

/**
 * Restore allowlisted keys only. Unknown keys (including ap-device-id)
 * are ignored so a backup cannot steal this installation's identity.
 * @param {unknown} local
 */
function writeLocalBackup(local) {
  if (!local || typeof local !== 'object' || Array.isArray(local)) return;
  if (typeof localStorage === 'undefined') return;
  try {
    for (const key of LOCAL_BACKUP_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(local, key)) continue;
      const v = /** @type {Record<string, unknown>} */ (local)[key];
      if (typeof v !== 'string') continue;
      if (v.length > LOCAL_VALUE_MAX) continue;
      localStorage.setItem(key, v);
    }
  } catch {
    /* private mode / missing storage */
  }
}

export const Backup = {
  /**
   * Export full DB + plan localStorage as JSON string.
   * @returns {Promise<string>}
   */
  async export() {
    const [workouts, orm, metrics, settings, plans] = await Promise.all([
      Workouts.getAll(),
      OneRM.getAll(),
      Metrics.getAll(),
      Settings.getAll(),
      PlannedWorkouts.getAll(),
    ]);
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        workouts,
        orm,
        metrics,
        settings,
        plans,
        local: readLocalBackup(),
      },
      null,
      2
    );
  },

  /**
   * Import from JSON string. Merges IDB — does NOT wipe first.
   * On a clean profile that is restore; on a dirty one leftovers stay.
   * @param {string} jsonStr
   * @returns {Promise<boolean>}
   */
  async import(jsonStr) {
    const data = JSON.parse(jsonStr);

    // Structural Validation Guard
    if (!data || typeof data !== 'object') throw new Error('Invalid backup format');
    if (!Array.isArray(data.workouts)) throw new Error('Missing workouts array');

    // Validate core data integrity
    const validWorkouts = data.workouts.filter((w) => w && w.type && Array.isArray(w.exercises));
    const validORM = Array.isArray(data.orm)
      ? data.orm.filter((o) => o && o.id && typeof o.value === 'number')
      : [];
    const validMetrics = Array.isArray(data.metrics)
      ? data.metrics.filter((m) => m && typeof m.weight === 'number')
      : [];
    const validSettings =
      data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? data.settings
        : {};
    const validPlans = Array.isArray(data.plans)
      ? data.plans
          .filter(
            (p) => p && typeof p === 'object' && typeof p.name === 'string' && p.payload != null
          )
          .slice(0, 200)
      : [];

    // Value-range guard. Structural validation above only checks shape; a corrupt
    // or hostile backup can still carry NaN/negative/absurd numbers that poison
    // tonnage + analytics or blow up rendering ("1,000,000 sets" DoS). Clamp
    // numerics to a sane finite range and cap collection sizes.
    const SANE = (n) => (Number.isFinite(n) && n >= 0 && n < 1e6 ? n : 0);
    validWorkouts.forEach((w) => {
      w.exercises = w.exercises.slice(0, 200).map((ex) => ({
        ...ex,
        sets: Array.isArray(ex.sets)
          ? ex.sets.slice(0, 200).map((s) => ({ ...s, weight: SANE(s.weight), reps: SANE(s.reps) }))
          : [],
      }));
    });
    validMetrics.forEach((m) => {
      m.weight = SANE(m.weight);
    });
    validORM.forEach((o) => {
      o.value = SANE(o.value);
    });

    // One transaction across stores. Await-then-put on separate txs can
    // auto-close (inactive) or resolve onsuccess before commit — WebKit then
    // serves the previous snapshot to the next read, which looks like a
    // silent failed restore.
    const db = await openDB();
    const trans = db.transaction([S.WORKOUTS, S.ORM, S.METRICS, S.SETTINGS, S.PLANS], 'readwrite');
    const committed = new Promise((res, rej) => {
      trans.oncomplete = () => res();
      trans.onerror = () => rej(trans.error);
      trans.onabort = () => rej(new Error('Tx aborted'));
    });

    // Stamp CRDT metadata on import so restored/migrated rows sync cleanly:
    // withMeta assigns a UUID id when missing (keeps existing ids) and refreshes
    // updatedAt (= import time) + deviceId. Without it, imported rows have no
    // updatedAt and LWW would fall back to the historical workout timestamp.
    validWorkouts.forEach((w) => {
      if (!w.timestamp) w.timestamp = Date.now();
      withMeta(w);
    });
    validMetrics.forEach((m) => withMeta(m));
    validORM.forEach((o) => withMeta(o));
    validPlans.forEach((p) => {
      if (!p.timestamp) p.timestamp = Date.now();
      withMeta(p);
    });

    const wsStore = trans.objectStore(S.WORKOUTS);
    const ormStore = trans.objectStore(S.ORM);
    const metStore = trans.objectStore(S.METRICS);
    const setStore = trans.objectStore(S.SETTINGS);
    const planStore = trans.objectStore(S.PLANS);
    validWorkouts.forEach((w) => wsStore.put(w));
    validORM.forEach((o) => ormStore.put(o));
    validMetrics.forEach((m) => metStore.put(m));
    validPlans.forEach((p) => planStore.put(p));
    Object.entries(validSettings).forEach(([key, value]) =>
      setStore.put({ key, value, updatedAt: Date.now(), deviceId: getDeviceId() })
    );
    await committed;
    writeLocalBackup(data.local);
    return true;
  },
};

/* ════════════════════════════════════════════════════════
   BACKUP REMINDER — pure logic (no IDB, no DOM — unit-testable)
   Settings keys are `ap-*` so Settings.set() keeps them device-local
   (never pushed through sync — each device tracks its own exports).
   ════════════════════════════════════════════════════════ */
export const K_LAST_EXPORT = 'ap-backup-last-export';
export const K_LAST_REMIND = 'ap-backup-last-remind';
export const BACKUP_REMIND_EVERY = 14 * 24 * 3600 * 1000; // 2 weeks

/**
 * Should we nudge the user to export? True when there is history worth
 * saving, no export happened within the window, and we haven't already
 * nagged within the same window (≈ one toast per 2 weeks, max).
 * @param {{ lastExportAt?: number, lastRemindAt?: number,
 *           workoutCount?: number, now?: number }} p
 * @returns {boolean}
 */
export function shouldRemindBackup({
  lastExportAt = 0,
  lastRemindAt = 0,
  workoutCount = 0,
  now = Date.now(),
} = {}) {
  if (!(workoutCount > 0)) return false;
  if (now - lastExportAt < BACKUP_REMIND_EVERY) return false;
  if (now - lastRemindAt < BACKUP_REMIND_EVERY) return false;
  return true;
}
