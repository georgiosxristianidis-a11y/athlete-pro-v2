// @ts-check
/* ════════════════════════════════════════════════════════
   db/backup.js — BACKUP / RESTORE (import/export + reminder logic)
   Facade split (DB-SPLIT card): moved verbatim from js/db.js.
   Backup JSON format is frozen (version 1) — old exports and the
   import ETL depend on it.
   ════════════════════════════════════════════════════════ */

import { S, getDeviceId, withMeta, tx, req2p } from './core.js';
import { Workouts } from './workouts.js';
import { OneRM } from './onerm.js';
import { Metrics } from './metrics.js';
import { Settings } from './settings.js';

export const Backup = {
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
export function shouldRemindBackup({ lastExportAt = 0, lastRemindAt = 0, workoutCount = 0, now = Date.now() } = {}) {
  if (!(workoutCount > 0)) return false;
  if (now - lastExportAt < BACKUP_REMIND_EVERY) return false;
  if (now - lastRemindAt < BACKUP_REMIND_EVERY) return false;
  return true;
}
