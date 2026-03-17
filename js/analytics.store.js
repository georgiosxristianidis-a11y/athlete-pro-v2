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
