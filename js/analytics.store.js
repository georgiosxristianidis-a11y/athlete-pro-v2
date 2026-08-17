// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.store.js — Analytics data layer
   Calendar state, data fetching, formatters
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { estimate1RM } from './strength-engine.js';

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
   PERIOD SELECTOR (AN-1)
   Rolling windows, not calendar-aligned — a calendar week/month would
   go near-empty right after it starts (e.g. "this week" on a Monday),
   which is a confusing default for a stats screen the user opens mid-week.
   ══════════════════════════════════════════════ */

/** @typedef {'week'|'month'|'3month'|'custom'} PeriodKey */
/** @typedef {{ from: number, to: number }} CustomRange */

export const PERIOD_DAYS = { week: 7, month: 30, '3month': 90 };
const PERIOD_STORAGE_KEY = 'ap-analytics-period';

/**
 * Resolve a period into an inclusive [since, until] epoch-ms window.
 * `until` is clamped to "now" so a stray future custom end-date can't pull
 * in workouts that shouldn't exist yet.
 * @param {PeriodKey} period
 * @param {CustomRange|null} [customRange]
 * @param {Date} [ref=new Date()]
 * @returns {{ since: number, until: number }}
 */
export function periodRange(period, customRange = null, ref = new Date()) {
  const now = ref.getTime();
  if (period === 'custom' && customRange) {
    return { since: customRange.from, until: Math.min(customRange.to, now) };
  }
  const days = PERIOD_DAYS[period] ?? PERIOD_DAYS.month;
  return { since: now - days * 86400000, until: now };
}

/**
 * Load the user's saved period choice. Falls back to 'month' (matches the
 * pre-AN-1 default) on first run or a corrupt/unknown stored value.
 * @returns {{ period: PeriodKey, customRange: CustomRange|null }}
 */
export function loadPeriodPref() {
  try {
    const raw = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.period === 'custom' && Number.isFinite(saved.from) && Number.isFinite(saved.to)) {
        return { period: 'custom', customRange: { from: saved.from, to: saved.to } };
      }
      if (Object.prototype.hasOwnProperty.call(PERIOD_DAYS, saved.period)) {
        return { period: saved.period, customRange: null };
      }
    }
  } catch { /* ignore — corrupt storage falls back to default */ }
  return { period: 'month', customRange: null };
}

/**
 * @param {PeriodKey} period
 * @param {CustomRange|null} [customRange]
 */
export function savePeriodPref(period, customRange = null) {
  try {
    const payload = period === 'custom' && customRange
      ? { period, from: customRange.from, to: customRange.to }
      : { period };
    localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(payload));
  } catch { /* ignore — persistence is best-effort */ }
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

// Volume formatting now lives in the shared format layer (2-3); re-exported
// here so existing `import { fmtVol } from './analytics.store.js'` keeps working.
export { fmtVol } from './shared/format.js';

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

/**
 * Extract full chronological history and progression metrics for a single exercise.
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @param {string} exerciseName
 * @returns {{
 *   name: string,
 *   type: 'push'|'pull'|'legs',
 *   sessionsCount: number,
 *   totalSets: number,
 *   totalVolume: number,
 *   bestWeight: number,
 *   firstWeight: number,
 *   currentWeight: number,
 *   delta: number,
 *   best1RM: number,
 *   current1RM: number,
 *   sessions: Array<{
 *     id: string|number,
 *     timestamp: number,
 *     type: string,
 *     topWeight: number,
 *     est1RM: number,
 *     volume: number,
 *     sets: Array<{ weight: number, reps: number, done?: boolean }>
 *   }>,
 *   pts: Array<{ t: number, v: number, est1RM: number, volume: number }>
 * }}
 */
export function fetchExerciseHistory(workouts, exerciseName) {
  const normTarget = (exerciseName || '').trim().toLowerCase();
  if (!normTarget || !Array.isArray(workouts)) {
    return {
      name: exerciseName || '',
      type: 'push',
      sessionsCount: 0,
      totalSets: 0,
      totalVolume: 0,
      bestWeight: 0,
      firstWeight: 0,
      currentWeight: 0,
      delta: 0,
      best1RM: 0,
      current1RM: 0,
      sessions: [],
      pts: [],
    };
  }

  const typeCounts = { push: 0, pull: 0, legs: 0 };
  const rawSessions = [];

  for (const w of workouts) {
    if (!w || !Array.isArray(w.exercises)) continue;
    for (const ex of w.exercises) {
      if (!ex || !ex.name) continue;
      const normName = ex.name.trim().toLowerCase();
      const aliases = Array.isArray(ex.alias) ? ex.alias.map((a) => String(a).trim().toLowerCase()) : [];
      if (normName !== normTarget && !aliases.includes(normTarget)) continue;

      if (w.type && Object.prototype.hasOwnProperty.call(typeCounts, w.type)) {
        typeCounts[w.type]++;
      }

      let topWeight = 0;
      let top1RM = 0;
      let sessionVolume = 0;
      let validSetsCount = 0;

      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      for (const s of sets) {
        if (!s || s.done === false) continue;
        const weight = Number(s.weight) || 0;
        const reps = Number(s.reps) || 0;
        if (weight > topWeight) topWeight = weight;
        const e1rm = estimate1RM(weight, reps);
        if (e1rm > top1RM) top1RM = e1rm;
        if (weight > 0 && reps > 0) {
          sessionVolume += weight * reps;
          validSetsCount++;
        } else if (reps > 0) {
          validSetsCount++;
        }
      }

      rawSessions.push({
        id: w.id,
        timestamp: w.timestamp || Date.now(),
        type: w.type || 'push',
        topWeight,
        est1RM: top1RM,
        volume: sessionVolume,
        validSetsCount,
        sets,
      });
      break;
    }
  }

  rawSessions.sort((a, b) => a.timestamp - b.timestamp);

  const dominantType = /** @type {'push'|'pull'|'legs'} */ (
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'push'
  );

  let totalVolume = 0;
  let totalSets = 0;
  let bestWeight = 0;
  let best1RM = 0;

  for (const s of rawSessions) {
    totalVolume += s.volume;
    totalSets += s.validSetsCount;
    if (s.topWeight > bestWeight) bestWeight = s.topWeight;
    if (s.est1RM > best1RM) best1RM = s.est1RM;
  }

  const firstWeight = rawSessions.find((s) => s.topWeight > 0)?.topWeight || 0;
  const currentWeight = [...rawSessions].reverse().find((s) => s.topWeight > 0)?.topWeight || 0;
  const current1RM = [...rawSessions].reverse().find((s) => s.est1RM > 0)?.est1RM || 0;
  const delta = firstWeight > 0 && currentWeight > 0 ? currentWeight - firstWeight : 0;

  const pts = rawSessions
    .filter((s) => s.topWeight > 0)
    .map((s) => ({
      t: s.timestamp,
      v: s.topWeight,
      est1RM: s.est1RM,
      volume: s.volume,
    }));

  return {
    name: exerciseName,
    type: dominantType,
    sessionsCount: rawSessions.length,
    totalSets,
    totalVolume,
    bestWeight,
    firstWeight,
    currentWeight,
    delta,
    best1RM,
    current1RM,
    sessions: rawSessions,
    pts,
  };
}

