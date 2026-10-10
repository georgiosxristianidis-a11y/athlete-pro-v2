// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.progression-curves.js — Pure calculation engine
   for strength progression curves without DOM dependencies.
   Complies with docs/specs/task_contract.md.
   ════════════════════════════════════════════════════════ */

import { estimate1RM } from './strength-engine.js';

/**
 * @typedef {{
 *   t: number,           // epoch ms (mid-month timestamp or session timestamp)
 *   v: number,           // top working weight in kg
 *   est1RM?: number,     // estimated 1RM for this point
 *   volume?: number      // total volume for this point
 * }} ProgressionPoint
 *
 * @typedef {{
 *   name: string,
 *   pts: ProgressionPoint[],
 *   type: 'push'|'pull'|'legs'|'other',
 *   n: number,           // session count
 *   delta: number,       // current weight - first weight
 *   bestWeight: number,
 *   currentWeight: number
 * }} ExerciseProgressionCurve
 *
 * @typedef {{
 *   id: string,          // cache key: e.g. 'all' or exercise normalized name
 *   version: number,     // schema version (1)
 *   timestamp: number,   // last computed epoch ms
 *   workoutCount: number,// number of workouts included
 *   curves: ExerciseProgressionCurve[]
 * }} ProgressionCurveCacheRecord
 */

const KNOWN_TYPES = ['push', 'pull', 'legs', 'other'];

/**
 * Computes a stable cache key / signature for a list of workouts and computation options.
 * Format: `${validCount}:${maxUpdatedAt}:${minMonths}:${limit}`
 * @param {Array<import('./db.js').WorkoutRecord>|null|undefined} workouts
 * @param {{ minMonths?: number, limit?: number }} [options]
 * @returns {string}
 */
export function computeProgressionCacheKey(workouts, options = {}) {
  const minMonths = typeof options?.minMonths === 'number' && options.minMonths >= 0 ? options.minMonths : 1;
  const limit = typeof options?.limit === 'number' && options.limit > 0 ? options.limit : 6;

  if (!Array.isArray(workouts) || workouts.length === 0) {
    return `0:0:${minMonths}:${limit}`;
  }

  let count = 0;
  let maxTs = 0;

  for (const w of workouts) {
    if (!w || w._deleted) continue;
    count++;
    const ts = Number(w.updatedAt || w.timestamp) || 0;
    if (ts > maxTs) {
      maxTs = ts;
    }
  }

  return `${count}:${maxTs}:${minMonths}:${limit}`;
}

/**
 * Pure deterministic calculation of progression curves per exercise.
 * Aggregates monthly top working weight, best estimated 1RM, and total volume.
 * Robust against empty data, null/undefined, uncompleted sets, negative weights, and corrupted inputs.
 *
 * @param {Array<import('./db.js').WorkoutRecord>|null|undefined} workouts
 * @param {{ minMonths?: number, limit?: number }} [options]
 * @returns {ExerciseProgressionCurve[]}
 */
export function calculateProgressionCurves(workouts, options = {}) {
  const minMonths = typeof options?.minMonths === 'number' && options.minMonths >= 0 ? options.minMonths : 1;
  const limit = typeof options?.limit === 'number' && options.limit > 0 ? options.limit : 6;

  if (!Array.isArray(workouts) || workouts.length === 0) {
    return [];
  }

  /**
   * Structure:
   * Map<exerciseName, {
   *   months: Map<mk, { v: number, est1RM: number, volume: number }>,
   *   typeCounts: Record<string, number>,
   *   sessions: number,
   *   bestWeight: number
   * }>
   */
  const map = new Map();

  for (const w of workouts) {
    if (!w || w._deleted) continue;
    const ts = Number(w.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) continue;

    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;

    const mk = d.getFullYear() * 12 + d.getMonth();
    const rawType = typeof w.type === 'string' ? w.type.toLowerCase().trim() : 'other';
    const workoutType = KNOWN_TYPES.includes(rawType) ? rawType : 'other';

    const workoutId = w.id ?? ts;

    const exercises = Array.isArray(w.exercises) ? w.exercises : [];
    for (const ex of exercises) {
      if (!ex || typeof ex.name !== 'string') continue;
      const name = ex.name.trim();
      if (!name) continue;

      let topWeight = 0;
      let topEst1RM = 0;
      let sessionVolume = 0;
      let hasValidSet = false;

      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      for (const s of sets) {
        if (!s || s.done === false) continue;

        const weight = Number(s.weight);
        const reps = Number(s.reps);

        if (!Number.isFinite(weight) || weight <= 0) continue;
        if (!Number.isFinite(reps) || reps <= 0) continue;

        hasValidSet = true;
        if (weight > topWeight) {
          topWeight = weight;
        }

        const e1rm = estimate1RM(weight, reps);
        if (e1rm > topEst1RM) {
          topEst1RM = e1rm;
        }

        sessionVolume += weight * reps;
      }

      if (!hasValidSet || topWeight <= 0) continue;

      let entry = map.get(name);
      if (!entry) {
        entry = {
          months: new Map(),
          typeCounts: { push: 0, pull: 0, legs: 0, other: 0 },
          sessionIds: new Set(),
          bestWeight: 0,
        };
        map.set(name, entry);
      }

      entry.sessionIds.add(workoutId);
      entry.typeCounts[workoutType] = (entry.typeCounts[workoutType] || 0) + 1;
      if (topWeight > entry.bestWeight) {
        entry.bestWeight = topWeight;
      }

      const existingMonth = entry.months.get(mk);
      if (!existingMonth) {
        entry.months.set(mk, {
          v: topWeight,
          est1RM: topEst1RM,
          volume: sessionVolume,
        });
      } else {
        existingMonth.v = Math.max(existingMonth.v, topWeight);
        existingMonth.est1RM = Math.max(existingMonth.est1RM, topEst1RM);
        existingMonth.volume += sessionVolume;
      }
    }
  }

  /** @type {ExerciseProgressionCurve[]} */
  const out = [];

  for (const [name, data] of map.entries()) {
    if (data.months.size < minMonths) continue;

    const sortedMonthEntries = [...data.months.entries()].sort((a, b) => a[0] - b[0]);
    /** @type {ProgressionPoint[]} */
    const pts = sortedMonthEntries.map(([mk, mData]) => {
      const year = Math.floor(mk / 12);
      const month = mk % 12;
      // 15th day of the month at noon UTC for deterministic mid-month timestamp
      const midMonthTs = Date.UTC(year, month, 15, 12, 0, 0);
      return {
        t: midMonthTs,
        v: mData.v,
        est1RM: mData.est1RM,
        volume: mData.volume,
      };
    });

    if (pts.length === 0) continue;

    // Determine dominant type
    let dominantType = 'other';
    let maxTypeCount = -1;
    for (const t of KNOWN_TYPES) {
      const count = data.typeCounts[t] || 0;
      if (count > maxTypeCount) {
        maxTypeCount = count;
        dominantType = t;
      }
    }

    const firstWeight = pts[0].v;
    const currentWeight = pts[pts.length - 1].v;
    const delta = Math.round((currentWeight - firstWeight) * 10) / 10;

    out.push({
      name,
      pts,
      type: /** @type {'push'|'pull'|'legs'|'other'} */ (dominantType),
      n: data.sessionIds.size,
      delta,
      bestWeight: data.bestWeight,
      currentWeight,
    });
  }

  // Sort by session count descending, then by name
  out.sort((a, b) => {
    if (b.n !== a.n) return b.n - a.n;
    return a.name.localeCompare(b.name);
  });

  return out.slice(0, limit);
}
