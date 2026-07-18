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
import { Workouts } from './db/workouts.js';
import { Backup } from './db/backup.js';

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
