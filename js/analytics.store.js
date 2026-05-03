// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.store.js — Analytics data layer
   Calendar state, data fetching, formatters
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

/* ══════════════════════════════════════════════
   CALENDAR STATE
   ══════════════════════════════════════════════ */
const now = new Date();
let _calYear = now.getFullYear();
let _calMonth = now.getMonth();
/** @type {import('./db.js').WorkoutRecord[]} */
let _calWorkouts = [];

export const CalState = {
  /** @returns {number} */
  get year() { return _calYear; },
  /** @returns {number} */
  get month() { return _calMonth; },
  /** @returns {import('./db.js').WorkoutRecord[]} */
  get workouts() { return _calWorkouts; },
  /** @param {import('./db.js').WorkoutRecord[]} w */
  set workouts(w) { _calWorkouts = w; },
};

/* ══════════════════════════════════════════════
   NAVIGATION MUTATORS
   ══════════════════════════════════════════════ */

/**
 * Move calendar to previous month.
 * @returns {{ year: number, month: number }}
 */
export function calPrev() {
  _calMonth--;
  if (_calMonth < 0) { _calMonth = 11; _calYear--; }
  return { year: _calYear, month: _calMonth };
}

/**
 * Move calendar to next month.
 * @returns {{ year: number, month: number }}
 */
export function calNext() {
  _calMonth++;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  return { year: _calYear, month: _calMonth };
}

/* ══════════════════════════════════════════════
   DATA FETCHING
   ══════════════════════════════════════════════ */

/**
 * Fetch all analytics data in one call.
 * @returns {Promise<{ workouts: import('./db.js').WorkoutRecord[], orms: import('./db.js').OneRMRecord[], metrics: import('./db.js').MetricsRecord[] }>}
 */
export async function fetchAllData() {
  const [workouts, orms, metrics] = await Promise.all([
    DB.Workouts.getAll(),
    DB.OneRM.getAll(),
    DB.Metrics.getAll(),
  ]);
  _calWorkouts = workouts;
  return { workouts, orms, metrics };
}

/**
 * Fetch weekly volume trend data.
 * @param {number} weeks
 * @returns {Promise<Array<{label: string, start: number, end: number, tonnage: number}>>}
 */
export async function fetchWeeklyTrend(weeks) {
  return DB.Workouts.weeklyTrend(weeks);
}

/**
 * Fetch PPL tonnage distribution.
 * @returns {Promise<{push: number, pull: number, legs: number}>}
 */
export async function fetchPPLTonnage() {
  return DB.Workouts.pplTonnage();
}

/* ══════════════════════════════════════════════
   PURE FORMATTERS
   ══════════════════════════════════════════════ */

/**
 * Format volume number with unit suffix.
 * @param {number} kg
 * @returns {string}
 */
export function fmtVol(kg) {
  return kg >= 1000 ? (kg / 1000).toFixed(1) + 'k' : Math.round(kg).toString();
}

/**
 * Format week label from a trend bucket's midpoint date.
 * @param {{ start: number, end: number, tonnage: number, label: string }} bucket
 * @returns {string}
 */
export function weekLabel(bucket) {
  const d = new Date(bucket.start + 3 * 86400000);
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/** Compound lifts to highlight in personal metrics (names match exercise / 1RM ids). */
const MAIN_LIFT_IDS = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press'];

/**
 * Simple training snapshot for personal metrics (scripts, console, or future UI).
 * IndexedDB stores one row per lift for 1RM — use Analytics / workouts for history charts.
 * @returns {Promise<{
 *   weekWorkouts: number,
 *   monthWorkouts: number,
 *   mainLifts: Array<{ id: string, oneRM: number | null, updatedAt: number | null }>
 * }>}
 */
export async function getTrainingSnapshot() {
  const workouts = await DB.Workouts.getAll();
  const orms = await DB.OneRM.getAll();
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const monthMs = 30 * 86400000;
  const weekWorkouts = workouts.filter((w) => w.timestamp >= now - weekMs).length;
  const monthWorkouts = workouts.filter((w) => w.timestamp >= now - monthMs).length;
  const byId = Object.fromEntries(orms.map((o) => [o.id, o]));
  const mainLifts = MAIN_LIFT_IDS.map((id) => {
    const r = byId[id];
    return { id, oneRM: r ? r.value : null, updatedAt: r ? r.timestamp : null };
  });
  return { weekWorkouts, monthWorkouts, mainLifts };
}
