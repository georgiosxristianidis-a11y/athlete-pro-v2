// @ts-check
/* ════════════════════════════════════════════════════════
   dashboard.store.js — Home read-model (zero DOM)
   ════════════════════════════════════════════════════════ */

import { weeklyVolumeFrom, monthlyVolumeFrom, weeklyCountFrom, pplTonnageFrom } from './db.js';

/** PPL rotation used to pick "what's next" off the last logged session. */
const NEXT_TYPE = { push: 'pull', pull: 'legs', legs: 'push' };

/**
 * Tonnage/session-count read-model for the Home stat chips.
 * @param {Array<{timestamp: number, tonnage: number, type: string}>} workouts
 * @returns {{weekVol: number, monthVol: number, weekCount: number, ppl: {push: number, pull: number, legs: number}}}
 */
export function getVolumeSummary(workouts) {
  return {
    weekVol: weeklyVolumeFrom(workouts),
    monthVol: monthlyVolumeFrom(workouts),
    weekCount: weeklyCountFrom(workouts),
    ppl: pplTonnageFrom(workouts),
  };
}

/**
 * PPL type for the next session, rotated off the most recent workout.
 * `workouts` is expected newest-first (DB.Workouts.getAll() order).
 * @param {Array<{type: string}>} workouts
 * @returns {'push'|'pull'|'legs'}
 */
export function getNextType(workouts) {
  const lastType = workouts[0]?.type || 'legs';
  return NEXT_TYPE[lastType] || 'push';
}

/**
 * Current-streak read-model: consecutive calendar days (ending today) with
 * a logged workout, plus a day→type map for the 7-day strip.
 * @param {Array<{timestamp: number, type: string}>} workouts
 * @returns {{streak: number, workedDays: Map<number, string>}}
 */
export function computeStreak(workouts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const workedDays = new Map();
  for (const w of workouts) {
    const d = new Date(w.timestamp);
    d.setHours(0, 0, 0, 0);
    workedDays.set(d.getTime(), w.type);
  }

  let streak = 0;
  for (let i = 0; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    if (workedDays.get(d.getTime())) streak++;
    else if (i > 0) break;
  }

  return { streak, workedDays };
}
