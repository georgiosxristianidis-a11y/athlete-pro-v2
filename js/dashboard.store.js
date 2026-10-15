// @ts-check
/* ════════════════════════════════════════════════════════
   dashboard.store.js — Home read-model (zero DOM)
   ════════════════════════════════════════════════════════ */

import { weeklyVolumeFrom, monthlyVolumeFrom, weeklyCountFrom, pplTonnageFrom } from './db.js';
import { loadPlan, nextWeightFor } from './workout.store.js';
import { streakWeeks } from './shared/week.js';

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
 * HOME-2 «Сегодня» (флаг home-feed-a): до двух упражнений плана с весом на
 * следующую сессию — тот же nextWeightFor, что Train подставит. Берутся
 * упражнения с историей, без собственного веса тела и кора; истории нет —
 * первые силовые плана без веса. step > 0 только при автоподъёме.
 * @param {Array<{type: string, timestamp?: number, exercises?: Array}>} workouts newest-first
 * @param {'push'|'pull'|'legs'} nextType
 * @param {Object<string, Array>} [plan] loadPlan(); параметр — для тестов
 * @returns {{total: number, items: Array<{name: string, sets: number, reps: number, weight: number|null, last: number|null, step: number}>}}
 */
export function getTodayPreview(workouts, nextType, plan = loadPlan()) {
  const list = plan?.[nextType] || [];
  const loaded = list.filter((ex) => !ex.isBW && !ex.noDb);
  const row = (ex, next) => ({
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    weight: next ? next.weight : null,
    last: next ? next.lastWeight : null,
    step: next?.autoBumped ? Math.round((next.weight - next.lastWeight) * 10) / 10 : 0,
  });
  const withHistory = [];
  for (const ex of loaded) {
    const next = nextWeightFor(ex, workouts || []);
    if (next) withHistory.push(row(ex, next));
    if (withHistory.length === 2) break;
  }
  const items = withHistory.length ? withHistory : loaded.slice(0, 2).map((ex) => row(ex, null));
  return { total: list.length, items };
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

/** Нижний порог засчитанной недели: норма плана ниже двух не делает серию дешёвой. */
const WEEK_STREAK_FLOOR = 2;

/**
 * HOME-1: серия в НЕДЕЛЯХ (решение Gio 13.10). Неделя ISO пн–вс по местному
 * времени засчитана при тренировках ≥ max(норма плана, 2). Серия — подряд
 * засчитанные недели назад от прошлой; текущая незаконченная неделя даёт +1,
 * если уже засчитана, и не рвёт серию, если ещё нет. Как computeStreak:
 * каждая сохранённая сессия — тренировка, порядок массива не важен.
 * @param {Array<{timestamp: number}>} workouts
 * @param {number} [weeklyNorm] тренировок в неделю по плану
 * @param {number} [now]
 * @returns {number}
 */
export function computeWeekStreak(workouts, weeklyNorm = WEEK_STREAK_FLOOR, now = Date.now()) {
  return streakWeeks(workouts, now, Math.max(Number(weeklyNorm) || 0, WEEK_STREAK_FLOOR));
}
