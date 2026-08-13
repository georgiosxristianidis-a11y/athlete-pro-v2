// @ts-check
/* ════════════════════════════════════════════════════════
   intel.engine.js — Readiness index (INTEL-2)
   ────────────────────────────────────────────────────────
   Чистая математика готовности: DOM нет, DB нет, fetch нет.
   На вход — уже загруженный список тренировок, на выход — индекс
   0–100 и его слагаемые.

   Зачем локально, а не «спросить модель»: до INTEL-2 цифры виджета
   готовности приезжали из ответа LLM (`_widget: readiness`), то есть
   были выдуманы — одна и та же история давала разные числа, а в
   airgap-режиме не давала никаких. Индекс обязан быть детерминирован:
   один и тот же вход → одно и то же число, без сети.

   Четыре слагаемых и их веса — дефолт из литературы по мониторингу
   нагрузки (Gabbett/Foster), НЕ истина в последней инстанции. Они
   вынесены в экспортируемую константу WEIGHTS именно чтобы их можно
   было двигать после калибровки на реальной истории, не трогая формулу.

   Единица нагрузки — тоннаж сессии (кг·повторы). Одна единица на всю
   историю: смешивать тоннаж со sRPE нельзя — отношение acute/chronic
   сравнивает окна между собой, и смена шкалы посреди истории даёт
   скачок на ровном месте. INTEL-1 (session RPE) подключается сюда
   заменой одной функции `sessionLoad`, а не правкой формул.
   ════════════════════════════════════════════════════════ */

import { estimate1RM } from './strength-engine.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * Веса слагаемых индекса. Сумма = 1.
 * Дефолт из литературы; калибруются на реальной истории (см. шапку файла).
 * Слагаемое без данных не считается нулём — оно выпадает, а веса
 * оставшихся перенормируются (иначе новичок с пустой историей получал бы
 * «внимание» вместо честного «данных мало»).
 */
export const WEIGHTS = Object.freeze({
  acwr: 0.35,
  recovery: 0.30,
  monotony: 0.20,
  trend: 0.15,
});

/**
 * Пороги ЦНС. Стартовые значения, тоже под калибровку.
 * `intensity` — доля от лучшего расчётного 1ПМ, с которой подход
 * считается тяжёлым для нервной системы; `hours` — сколько такой
 * подход её занимает.
 */
export const CNS = Object.freeze({
  intensity: 0.85,
  hours: 72,
  /** Обычная (не-ЦНС) сессия: полное восстановление за двое суток. */
  baseHours: 48,
});

/** Окна ACWR: острое 7 дней, хроническое 28 (4 недели). */
export const WINDOWS = Object.freeze({ acuteDays: 7, chronicDays: 28 });

/* ════════════════════════════════════════════════════════
   БАЗОВЫЕ ПОМОЩНИКИ
   ════════════════════════════════════════════════════════ */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Линейная интерполяция score между двумя точками, с зажимом на концах. */
function ramp(x, x0, y0, x1, y1) {
  if (x1 === x0) return y0;
  const t = clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + t * (y1 - y0);
}

/**
 * Нагрузка одной сессии. Точка расширения для INTEL-1: когда появится
 * session RPE, здесь встанет sRPE = длительность × RPE — но менять
 * единицу можно только для ВСЕЙ истории разом, не для новых записей.
 * @param {{ tonnage?: number, exercises?: Array<{ sets: Array<{weight:number,reps:number,done:boolean}> }> }} w
 * @returns {number}
 */
export function sessionLoad(w) {
  if (Number.isFinite(w?.tonnage) && w.tonnage > 0) return w.tonnage;
  // Записи до появления поля tonnage (и импорт из старых бэкапов) считаем руками.
  let sum = 0;
  for (const ex of w?.exercises || []) {
    for (const s of ex?.sets || []) {
      if (s?.done === false) continue;
      sum += (Number(s?.weight) || 0) * (Number(s?.reps) || 0);
    }
  }
  return sum;
}

/**
 * Суммарная нагрузка за окно `(now - days*DAY, now]`.
 * @param {Array<Object>} workouts
 * @param {number} now
 * @param {number} days
 * @param {number} [offsetDays=0] сдвиг окна назад (для «прошлой недели»)
 * @returns {number}
 */
export function loadInWindow(workouts, now, days, offsetDays = 0) {
  const to = now - offsetDays * DAY;
  const from = to - days * DAY;
  let sum = 0;
  for (const w of workouts) {
    const t = w?.timestamp;
    if (!Number.isFinite(t) || t <= from || t > to) continue;
    sum += sessionLoad(w);
  }
  return sum;
}

/**
 * Суточные нагрузки за последние `days` дней, включая нули. Сутки
 * отсчитываются от `now` назад (скользящие 24-часовые корзины, не календарь):
 * иначе тренировка вчера вечером и сегодня утром попадали бы в разные дни
 * при разнице в 12 часов.
 * Нулевые дни — не шум, а сигнал: без них монотонность у человека,
 * который тренируется 3 раза в неделю, всегда выходила бы идеальной.
 * @param {Array<Object>} workouts
 * @param {number} now
 * @param {number} days
 * @returns {number[]} от старого дня к сегодняшнему
 */
export function dailyLoads(workouts, now, days) {
  const out = new Array(days).fill(0);
  for (const w of workouts) {
    const t = w?.timestamp;
    if (!Number.isFinite(t) || t > now) continue;
    const back = Math.floor((now - t) / DAY);
    if (back >= days) continue;
    out[days - 1 - back] += sessionLoad(w);
  }
  return out;
}

/* ════════════════════════════════════════════════════════
   1. ACWR — острая нагрузка против хронической
   ════════════════════════════════════════════════════════ */

/**
 * Acute:Chronic Workload Ratio. Хроническая приведена к недельному
 * эквиваленту (28 дней / 4), иначе отношение всегда было бы около 0.25.
 * @returns {number|null} null, если хронической базы ещё нет
 */
export function acwr(workouts, now) {
  const acute = loadInWindow(workouts, now, WINDOWS.acuteDays);
  const chronic = loadInWindow(workouts, now, WINDOWS.chronicDays) / (WINDOWS.chronicDays / WINDOWS.acuteDays);
  if (chronic <= 0) return null;
  return acute / chronic;
}

/**
 * Балл ACWR. «Sweet spot» 0.8–1.3 — плато 100.
 * Вверх наказываем жёстче, чем вниз: перегруз травмоопасен, недогруз —
 * всего лишь медленный прогресс.
 * @param {number|null} ratio
 * @returns {number|null}
 */
export function acwrScore(ratio) {
  if (ratio === null) return null;
  if (ratio >= 0.8 && ratio <= 1.3) return 100;
  if (ratio < 0.8) return Math.round(ramp(ratio, 0.0, 40, 0.8, 100));
  return Math.round(ramp(ratio, 1.3, 100, 2.0, 0));
}

/* ════════════════════════════════════════════════════════
   2. ВОССТАНОВЛЕНИЕ + ЦНС
   ════════════════════════════════════════════════════════ */

/**
 * Лучший расчётный 1ПМ по каждому упражнению за всю историю (Epley).
 * Считаем из самих тренировок, а не из стора 1ПМ: стор заполняется
 * вручную и у большинства упражнений пуст, а интенсивность нужна по всем.
 * @param {Array<Object>} workouts
 * @returns {Map<string, number>} имя в нижнем регистре → кг
 */
export function bestE1RM(workouts) {
  /** @type {Map<string, number>} */
  const best = new Map();
  for (const w of workouts) {
    for (const ex of w?.exercises || []) {
      const name = String(ex?.name || '').trim().toLowerCase();
      if (!name) continue;
      for (const s of ex?.sets || []) {
        if (s?.done === false) continue;
        const e = estimate1RM(Number(s?.weight) || 0, Number(s?.reps) || 0);
        if (e > (best.get(name) || 0)) best.set(name, e);
      }
    }
  }
  return best;
}

/**
 * Была ли сессия тяжёлой для ЦНС: хоть один подход на ≥85% от лучшего
 * расчётного 1ПМ этого упражнения.
 * @param {Object} workout
 * @param {Map<string, number>} best
 * @returns {boolean}
 */
export function isCnsHeavy(workout, best) {
  for (const ex of workout?.exercises || []) {
    const name = String(ex?.name || '').trim().toLowerCase();
    const ref = best.get(name);
    if (!ref) continue;
    for (const s of ex?.sets || []) {
      if (s?.done === false) continue;
      const wgt = Number(s?.weight) || 0;
      if (wgt >= ref * CNS.intensity) return true;
    }
  }
  return false;
}

/**
 * Восстановление: сколько прошло от последней сессии относительно того,
 * сколько ей нужно (72 ч после тяжёлой для ЦНС, 48 ч после обычной).
 * @returns {{ score: number|null, hoursSince: number|null, needHours: number, cnsHeavy: boolean }}
 */
export function recovery(workouts, now) {
  const past = workouts.filter(w => Number.isFinite(w?.timestamp) && w.timestamp <= now);
  if (!past.length) return { score: null, hoursSince: null, needHours: CNS.baseHours, cnsHeavy: false };
  const last = past.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  const best = bestE1RM(workouts);
  const heavy = isCnsHeavy(last, best);
  const needHours = heavy ? CNS.hours : CNS.baseHours;
  const hoursSince = (now - last.timestamp) / HOUR;
  return {
    score: Math.round(clamp(hoursSince / needHours, 0, 1) * 100),
    hoursSince,
    needHours,
    cnsHeavy: heavy,
  };
}

/**
 * Загруженность ЦНС в процентах (в виджете — отдельная красная шкала).
 * Это НЕ инверсия восстановления: считает только тяжёлые сессии в окне
 * 72 ч и гасит их линейно по мере отхода в прошлое.
 * @returns {number} 0–100
 */
export function cnsLoad(workouts, now) {
  const best = bestE1RM(workouts);
  let peak = 0;
  for (const w of workouts) {
    const t = w?.timestamp;
    if (!Number.isFinite(t) || t > now) continue;
    const hours = (now - t) / HOUR;
    if (hours >= CNS.hours) continue;
    if (!isCnsHeavy(w, best)) continue;
    peak = Math.max(peak, 1 - hours / CNS.hours);
  }
  return Math.round(peak * 100);
}

/* ════════════════════════════════════════════════════════
   3. МОНОТОННОСТЬ (Foster)
   ════════════════════════════════════════════════════════ */

/**
 * Monotony = среднесуточная нагрузка / её стандартное отклонение за 7 дней.
 * Высокая монотонность — одинаковые дни без разгрузки, классический
 * предиктор перетренированности.
 * @returns {number|null} null, если недели без нагрузки
 */
export function monotony(workouts, now) {
  const loads = dailyLoads(workouts, now, 7);
  const total = loads.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const mean = total / loads.length;
  const variance = loads.reduce((s, v) => s + (v - mean) ** 2, 0) / loads.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return 99; // семь одинаковых дней подряд — предел шкалы, не бесконечность
  return mean / sd;
}

/**
 * Балл монотонности: ≤1.5 безопасно, ≥2.5 — красная зона Foster.
 * @param {number|null} m
 * @returns {number|null}
 */
export function monotonyScore(m) {
  if (m === null) return null;
  return Math.round(ramp(m, 1.5, 100, 2.5, 0));
}

/** Strain = недельная нагрузка × монотонность (для отчётов, в индекс не входит). */
export function strain(workouts, now) {
  const m = monotony(workouts, now);
  if (m === null) return null;
  return loadInWindow(workouts, now, 7) * m;
}

/* ════════════════════════════════════════════════════════
   4. ТРЕНД
   ════════════════════════════════════════════════════════ */

/**
 * Недельный прирост нагрузки: эта неделя против предыдущей.
 * @returns {number|null} доля (+0.05 = +5%); null, если прошлой недели нет
 */
export function trend(workouts, now) {
  const prev = loadInWindow(workouts, now, 7, 7);
  if (prev <= 0) return null;
  const cur = loadInWindow(workouts, now, 7);
  return cur / prev - 1;
}

/**
 * Балл тренда. Максимум не на «чем больше, тем лучше», а на умеренном
 * росте ~+5%/нед (правило 10%): прыжок вдвое — такой же красный флаг,
 * как и обвал.
 * @param {number|null} t
 * @returns {number|null}
 */
export function trendScore(t) {
  if (t === null) return null;
  if (t >= 0.02 && t <= 0.10) return 100;
  if (t < 0.02) return Math.round(ramp(t, -0.40, 0, 0.02, 100));
  return Math.round(ramp(t, 0.10, 100, 0.50, 0));
}

/* ════════════════════════════════════════════════════════
   ИНДЕКС
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {{
 *   index: number|null,
 *   parts: { acwr: number|null, recovery: number|null, monotony: number|null, trend: number|null },
 *   cns: number,
 *   raw: {
 *     acwr: number|null, monotony: number|null, trend: number|null,
 *     strain: number|null, acuteLoad: number, chronicLoad: number,
 *     hoursSinceLast: number|null, needHours: number, cnsHeavy: boolean,
 *     sessions28d: number,
 *   },
 *   confidence: 'none'|'low'|'ok',
 *   weights: typeof WEIGHTS,
 * }} Readiness
 */

/**
 * Индекс готовности 0–100 и его разбор.
 *
 * Слагаемое без данных выпадает из суммы вместе со своим весом
 * (веса оставшихся перенормируются). Если данных нет вообще —
 * `index: null` и `confidence: 'none'`: пустой экран честнее нуля,
 * который читается как «ты в яме».
 *
 * @param {Array<Object>} workouts список записей тренировок (порядок не важен)
 * @param {{ now?: number }} [opts]
 * @returns {Readiness}
 */
export function readiness(workouts, opts = {}) {
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const list = Array.isArray(workouts) ? workouts.filter(w => Number.isFinite(w?.timestamp)) : [];

  const rawAcwr = acwr(list, now);
  const rawMono = monotony(list, now);
  const rawTrend = trend(list, now);
  const rec = recovery(list, now);

  const parts = {
    acwr: acwrScore(rawAcwr),
    recovery: rec.score,
    monotony: monotonyScore(rawMono),
    trend: trendScore(rawTrend),
  };

  let sum = 0;
  let weightSum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    if (parts[key] === null) continue;
    sum += parts[key] * WEIGHTS[key];
    weightSum += WEIGHTS[key];
  }

  const sessions28d = list.filter(w => w.timestamp > now - WINDOWS.chronicDays * DAY && w.timestamp <= now).length;
  const confidence = weightSum === 0 ? 'none' : (sessions28d < 6 ? 'low' : 'ok');

  return {
    index: weightSum === 0 ? null : Math.round(sum / weightSum),
    parts,
    cns: cnsLoad(list, now),
    raw: {
      acwr: rawAcwr,
      monotony: rawMono,
      trend: rawTrend,
      strain: strain(list, now),
      acuteLoad: loadInWindow(list, now, WINDOWS.acuteDays),
      chronicLoad: loadInWindow(list, now, WINDOWS.chronicDays),
      hoursSinceLast: rec.hoursSince,
      needHours: rec.needHours,
      cnsHeavy: rec.cnsHeavy,
      sessions28d,
    },
    confidence,
    weights: WEIGHTS,
  };
}
