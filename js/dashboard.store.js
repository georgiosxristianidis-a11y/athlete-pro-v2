// @ts-check
/* ════════════════════════════════════════════════════════
   dashboard.store.js — Home read-model (zero DOM)
   ════════════════════════════════════════════════════════ */

import { weeklyVolumeFrom, monthlyVolumeFrom, weeklyCountFrom, pplTonnageFrom } from './db.js';
import { loadPlan, nextWeightFor } from './workout.store.js';

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
 * Рост веса на следующую сессию для карточки рекомендаций Home. Тип — тот же,
 * что у hero (getNextType), вес — тот же расчёт, что Train подставит в
 * buildSession (nextWeightFor): что обещано на Home, то и встанет на барабан.
 * Раньше карточка читала флаг ap-last-workout-type и ключи ap-recommendations-*,
 * которые с 169d3399 никто не пишет, — секция была скрыта у всех.
 * @param {Array<{type: string, timestamp?: number, exercises?: Array}>} workouts newest-first
 * @param {'push'|'pull'|'legs'} nextType
 * @param {Object<string, Array>} [plan] loadPlan(); параметр — для тестов
 * @returns {Array<{name: string, from: number, to: number}>} только упражнения, где вес растёт
 */
export function getNextSessionRecs(workouts, nextType, plan = loadPlan()) {
  const recs = [];
  for (const ex of plan?.[nextType] || []) {
    const next = nextWeightFor(ex, workouts || []);
    if (next?.autoBumped) recs.push({ name: ex.name, from: next.lastWeight, to: next.weight });
  }
  return recs;
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
