// @ts-check
/* ════════════════════════════════════════════════════════
   week.js — недельная математика (HOME-1)
   ────────────────────────────────────────────────────────
   Единственная копия ключа недели и серии «недели подряд». Ноль импортов:
   модуль сидит в бут-графе Главной (dashboard.store.js) и не должен тянуть
   туда ничего, кроме себя. Обёртки — weekKey/weeklyStreak в
   shared/badge-ladders.js и computeWeekStreak в dashboard.store.js.
   ════════════════════════════════════════════════════════ */

const DAY_MS = 86400000;

/**
 * Начало недели (понедельник 00:00 по локальному времени) в виде числа дней
 * от эпохи — ключ для сравнения «соседние недели». Через календарную дату,
 * а не деление на 7 суток: эпоха 01.01.1970 — четверг, а переход на летнее
 * время сдвигает сутки на час.
 * @param {number} ts
 * @returns {number}
 */
export function weekKey(ts) {
  const d = new Date(ts);
  const monOffset = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - monOffset);
  return Math.round(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()) / DAY_MS);
}

/**
 * Недели подряд, в каждой из которых не меньше `min` тренировок. Текущая
 * неделя ещё идёт: если в ней пока меньше `min`, серия не рвётся, а считается
 * от прошлой недели. Каждая сессия — тренировка, порядок массива не важен.
 * @param {Array<{ timestamp: number }> | null | undefined} workouts
 * @param {number} now
 * @param {number} min
 * @returns {number}
 */
export function streakWeeks(workouts, now, min) {
  /** @type {Map<number, number>} */
  const perWeek = new Map();
  for (const w of workouts || []) {
    if (!w || !Number.isFinite(w.timestamp)) continue;
    const k = weekKey(w.timestamp);
    perWeek.set(k, (perWeek.get(k) || 0) + 1);
  }
  let k = weekKey(now);
  if ((perWeek.get(k) || 0) < min) k -= 7;
  let n = 0;
  while ((perWeek.get(k) || 0) >= min) {
    n++;
    k -= 7;
  }
  return n;
}
