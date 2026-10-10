// @ts-check
/* ════════════════════════════════════════════════════════
   working-sets.js — что идёт в аналитику (WSET-1)
   ────────────────────────────────────────────────────────
   Тоннаж, объём и значки считают только рабочие подходы силовых
   упражнений. Вне счёта:
     • подводящие подходы — явная метка `set.warmup === true` либо авто:
       ведущие подходы легче WARMUP_RATIO от топ-веса упражнения в сессии.
       `set.warmup === false` — ручная правка «это рабочий», авто не трогает;
     • пресс и поясница — блоки core/align и имена из EXCLUDED_NAME_RE
       (добавленное вручную на тренировке `noDb` не несёт).
   Поднятый подход — как у кривых силы (1.27.162): done !== false, reps > 0.
   Модуль чистый: без DOM, IDB и флагов — гейт решает вызывающий.
   ════════════════════════════════════════════════════════ */

/** Подход легче этой доли топ-веса, стоящий до первого рабочего, — подводящий. */
export const WARMUP_RATIO = 0.6;

const EXCLUDED_BLOCKS = new Set(['core', 'align']);

// Группы abs и lower back из exercises-library.json + русские имена.
const EXCLUDED_NAME_RE =
  /crunch|plank|leg raise|knee raise|ab wheel|rollout|russian twist|dead ?bug|pallof|woodchop|mountain climber|hyperext|back extension|dragon flag|v-up|toes-to-bar|sit-?up|cat-cow|suitcase carry|пресс|скручиван|планк|гиперэкст|подъ[её]м ног/i;

/**
 * Упражнение вне аналитики (пресс, поясница, легаси Camera 4).
 * @param {{ name?: string, block?: string|null, noDb?: boolean }} ex
 * @returns {boolean}
 */
export function isExcludedExercise(ex) {
  if (!ex) return true;
  if (ex.noDb) return true;
  if (ex.block && EXCLUDED_BLOCKS.has(ex.block)) return true;
  return EXCLUDED_NAME_RE.test(String(ex.name || ''));
}

/**
 * @param {{ weight?: number, reps?: number, done?: boolean }} s
 * @returns {boolean}
 */
export function isLifted(s) {
  return !!s && s.done !== false && (Number(s.reps) || 0) > 0;
}

/**
 * Метка «подводящий» для каждого подхода упражнения, по индексу.
 * @param {Array<{ weight?: number, reps?: number, done?: boolean, warmup?: boolean }>} sets
 * @returns {boolean[]}
 */
export function warmupFlags(sets) {
  const list = Array.isArray(sets) ? sets : [];
  const top = list.reduce((m, s) => (isLifted(s) ? Math.max(m, Number(s.weight) || 0) : m), 0);
  const cutoff = top * WARMUP_RATIO;
  let ramp = top > 0; // авто-зона кончается на первом рабочем подходе
  return list.map((s) => {
    const w = Number(s?.weight) || 0;
    const auto = ramp && w < cutoff;
    if (w >= cutoff) ramp = false;
    if (s?.warmup === true) return true;
    if (s?.warmup === false) return false;
    return auto;
  });
}

/**
 * Тоннаж рабочих подходов одного упражнения (одностороннее ×2).
 * @param {{ name?: string, block?: string|null, noDb?: boolean, isUnilateral?: boolean,
 *           sets?: Array<{ weight?: number, reps?: number, done?: boolean, warmup?: boolean }> }} ex
 * @returns {number}
 */
export function workingTonnage(ex) {
  if (isExcludedExercise(ex)) return 0;
  const sets = ex.sets || [];
  const warm = warmupFlags(sets);
  const mul = ex.isUnilateral ? 2 : 1;
  let sum = 0;
  sets.forEach((s, i) => {
    if (warm[i] || !isLifted(s)) return;
    sum += (Number(s.weight) || 0) * (Number(s.reps) || 0) * mul;
  });
  return sum;
}

/**
 * Метки «подводящий» по плану — для подписи в сет-логгере: топ-вес берётся из
 * всех подходов с повторами, закрыты они или нет, чтобы «W» стояла до того,
 * как дошли до рабочего веса. Итог считает warmupFlags по закрытым — подпись
 * разойдётся с ним, только если рабочие подходы так и не закрыли.
 * @param {Array<{ weight?: number, reps?: number, done?: boolean, warmup?: boolean }>} sets
 * @returns {boolean[]}
 */
export function plannedWarmupFlags(sets) {
  return warmupFlags((Array.isArray(sets) ? sets : []).map((s) => ({ ...s, done: true })));
}

/**
 * Тоннаж упражнения по всем поднятым подходам ×1 — знаменатель доли рабочих.
 * @param {{ sets?: Array<{ weight?: number, reps?: number, done?: boolean }> }} ex
 * @returns {number}
 */
function liftedTonnage1x(ex) {
  return (ex?.sets || []).reduce(
    (sum, s) => (isLifted(s) ? sum + (Number(s.weight) || 0) * (Number(s.reps) || 0) : sum),
    0
  );
}

/**
 * Тоннаж сессии по рабочим подходам. Нет `exercises` (старые записи) —
 * пересчитывать не из чего, остаётся сохранённое число.
 *
 * Записи до WSET-1 не несут `isUnilateral`, а сохранённый тоннаж уже посчитан
 * с ×2 у гантелей. Пересчёт с нуля срезал бы их вдвое, поэтому у таких записей
 * сохранённое число масштабируется долей рабочих: множитель сокращается.
 * С WSET-1 флаг пишется в каждое упражнение — счёт точный.
 * @param {{ tonnage?: number, exercises?: Array<any> }} w
 * @returns {number}
 */
export function sessionWorkingTonnage(w) {
  const list = w?.exercises;
  const stored = Number(w?.tonnage) || 0;
  if (!Array.isArray(list) || !list.length) return stored;
  const working = list.reduce((sum, ex) => sum + workingTonnage(ex), 0);
  if (list.every((ex) => typeof ex?.isUnilateral === 'boolean')) return working;
  const all = list.reduce((sum, ex) => sum + liftedTonnage1x(ex), 0);
  if (all <= 0) return 0;
  return Math.round(stored * (working / all));
}
