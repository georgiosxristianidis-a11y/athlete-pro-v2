// @ts-check
/* ════════════════════════════════════════════════════════
   badge-ladders.js — значки-лестницы комнаты атлета (WSET-2)
   ────────────────────────────────────────────────────────
   Чистая математика, без DOM и БД. Вход — сессии из DB.Workouts.getAll()
   (при флаге working-sets тоннаж в них уже рабочий) и данные атлета.
   Выход — по лестнице: значение, сколько ступеней взято, доля каждого
   сегмента полосы. Решения Gio 13.10 — docs/handoff/HANDOFF_working_sets.md.
   ════════════════════════════════════════════════════════ */
import { exrxTier, mcCullochAge } from '../strength-engine.js';

const DAY_MS = 86400000;

/** Пороги лестниц. Тоннаж — в тоннах, серия — в неделях. */
export const RUNGS = {
  sessionTonnes: [5, 10, 15, 20],
  totalTonnes: [100, 500, 1000],
  workouts: [10, 50, 100, 250],
  weekStreak: [3, 6, 12, 26],
  prs: [10, 25, 50, 100],
  dayStreak: [7],
};

/**
 * Начало недели (понедельник 00:00 по локальному времени) в виде числа дней
 * от эпохи — ключ для сравнения «соседние недели». Через календарную дату,
 * а не деление на 7 суток: неделя с четверга (эпоха 01.01.1970 — четверг)
 * была ошибкой старого `_calcConsistency`.
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
 * от прошлой недели.
 * @param {Array<{ timestamp: number }>} workouts
 * @param {number} now
 * @param {number} [min]
 * @returns {number}
 */
export function weeklyStreak(workouts, now, min = 2) {
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

/**
 * Дни подряд с тренировкой (сегодня без тренировки серию не рвёт).
 * Логика прежнего `_calcStreak`, вынесена без изменений поведения.
 * @param {Array<{ timestamp: number }>} workouts
 * @param {number} now
 * @returns {number}
 */
export function dayStreak(workouts, now) {
  if (!workouts || !workouts.length) return 0;
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const dates = new Set(workouts.map((w) => key(new Date(w.timestamp))));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (dates.has(key(new Date(now - i * DAY_MS)))) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

/**
 * Сколько ступеней взято и доля заполнения каждого сегмента полосы.
 * Сегмент i идёт от предыдущей ступени (для первого — от нуля) к rungs[i].
 * @param {number[]} rungs по возрастанию
 * @param {number} value
 * @returns {{ reached: number, segs: number[], next: number|null }}
 */
export function climb(rungs, value) {
  const v = Number.isFinite(value) && value > 0 ? value : 0;
  let reached = 0;
  const segs = rungs.map((hi, i) => {
    if (v >= hi) reached = i + 1;
    const lo = i ? rungs[i - 1] : 0;
    return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  });
  return { reached, segs, next: reached < rungs.length ? rungs[reached] : null };
}

/**
 * @typedef {{
 *   id: string, value: number, rungs: number[], reached: number,
 *   segs: number[], next: number|null
 * }} Ladder
 */

/**
 * Вариант E (Gio 14.10): три главные карточки — тоннаж за сессию, тренировки
 * и жим; нет жима (нет 1RM или веса) — вместо него недельная серия. Остальное
 * уходит под «Все достижения».
 * @param {Ladder[]} ladders
 * @returns {{ heroes: Ladder[], rest: Ladder[] }}
 */
export function splitHeroes(ladders) {
  const by = new Map((ladders || []).map((l) => [l.id, l]));
  const ids = ['sessionTonnes', 'workouts', by.has('bench') ? 'bench' : 'weekStreak'];
  const heroes = ids.map((id) => by.get(id)).filter(Boolean);
  return { heroes, rest: (ladders || []).filter((l) => !heroes.includes(l)) };
}

/**
 * Заливка одной полосы: доля текущего сегмента, у потолка лестницы — полная.
 * @param {Ladder} l
 * @returns {number}
 */
export function currentFill(l) {
  return l.next === null ? 1 : l.segs[l.reached] ?? 0;
}

/**
 * @param {Array<{ timestamp: number, tonnage?: number, prs?: unknown[] }>} workouts
 * @param {{
 *   now?: number, benchOneRM?: number, sex?: 'm'|'f', bodyweight?: number, age?: number
 * }} [ctx]
 * @returns {Ladder[]}
 */
export function buildLadders(workouts, ctx = {}) {
  const ws = (workouts || []).filter(Boolean);
  const now = ctx.now ?? Date.now();
  const tons = ws.map((w) => (Number.isFinite(w.tonnage) ? Number(w.tonnage) : 0));

  /** @type {Array<[string, number[], number]>} */
  const plain = [
    ['sessionTonnes', RUNGS.sessionTonnes, Math.max(0, ...tons) / 1000],
    ['totalTonnes', RUNGS.totalTonnes, tons.reduce((a, b) => a + b, 0) / 1000],
    ['workouts', RUNGS.workouts, ws.length],
    ['weekStreak', RUNGS.weekStreak, weeklyStreak(ws, now)],
    ['prs', RUNGS.prs, ws.reduce((a, w) => a + (Array.isArray(w.prs) ? w.prs.length : 0), 0)],
  ];
  const out = plain.map(([id, rungs, value]) => ({ id, value, rungs, ...climb(rungs, value) }));

  const bench = _benchLadder(ctx);
  if (bench) out.push(bench);

  const days = dayStreak(ws, now);
  out.push({ id: 'dayStreak', value: days, rungs: RUNGS.dayStreak, ...climb(RUNGS.dayStreak, days) });
  return out;
}

/**
 * Жим: ступени — пороги Novice..Elite из таблицы exrxTier под вес и пол
 * атлета, значение — 1RM с поправкой на возраст (как в движке). Нет 1RM или
 * веса — лестницы нет, плитка не рисуется.
 * @param {{ benchOneRM?: number, sex?: 'm'|'f', bodyweight?: number, age?: number }} ctx
 * @returns {Ladder|null}
 */
function _benchLadder(ctx) {
  const { benchOneRM, bodyweight, age } = ctx;
  if (!benchOneRM || !bodyweight) return null;
  const t = exrxTier({ lift: 'bench', sex: ctx.sex || 'm', bodyweight, oneRM: benchOneRM, age });
  if (!t) return null;
  const rungs = t.thresholds.slice(1).map((v) => Math.round(v));
  const value = benchOneRM * mcCullochAge(age || 30);
  return { id: 'bench', value, rungs, ...climb(rungs, value) };
}
