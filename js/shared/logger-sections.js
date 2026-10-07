// @ts-check
/* ════════════════════════════════════════════════════════
   logger-sections.js — секционный режим сет-логгера (LOG-SEC-1)

   Ноль DOM. План тренировки режется на секции по `ex.block`, а дальше
   чистые функции отвечают на три вопроса: из чего состоят секции, какая
   открыта сейчас и какая откроется следом. Экран (`workout.view/sections.js`)
   только раскладывает ответы по DOM.

   Порядок секций — порядок первого появления блока в плане (тот же, что у
   `blockOrder`): пользователь проходит их именно так. Упражнения без блока
   (на живую добавленные в план без `block`) собираются в одну секцию
   OTHER_BLOCK, чтобы ни одно не выпало с экрана.
   ════════════════════════════════════════════════════════ */

/** Секция для упражнений без `block`. */
export const OTHER_BLOCK = '_';

/**
 * @typedef {object} Section
 * @property {string} id       id блока (или OTHER_BLOCK)
 * @property {number[]} eis    индексы упражнений в плане, в порядке плана
 * @property {number} total    сколько упражнений
 * @property {number} doneEx   сколько упражнений закрыто целиком
 * @property {boolean} allDone все упражнения закрыты
 * @property {boolean} anyDone есть хотя бы один закрытый подход
 */

/**
 * @param {Array<{block?: string, skipped?: boolean, sets: Array<{done?: boolean}>}>} plan
 * @returns {Section[]}
 */
export function sectionList(plan) {
  /** @type {Map<string, Section>} */
  const map = new Map();
  (plan || []).forEach((ex, ei) => {
    const id = ex.block || OTHER_BLOCK;
    let sec = map.get(id);
    if (!sec) {
      sec = { id, eis: [], total: 0, doneEx: 0, allDone: false, anyDone: false };
      map.set(id, sec);
    }
    sec.eis.push(ei);
    // FIELD-1: пропущенное карточкой в секции остаётся, но в счёт не идёт —
    // ни сделанным, ни ждущим; секцию открытой не держит.
    if (ex.skipped) return;
    sec.total++;
    const sets = ex.sets || [];
    if (sets.length && sets.every((s) => s.done)) sec.doneEx++;
    if (sets.some((s) => s.done)) sec.anyDone = true;
  });
  const secs = [...map.values()];
  for (const s of secs) s.allDone = s.doneEx === s.total;
  return secs;
}

/**
 * Упражнение в фокусе внутри секции: первое недоделанное строго после `after`,
 * иначе первое недоделанное в секции (пропущенное выше). -1 — сделано всё.
 *
 * @param {Section} sec
 * @param {Array<{skipped?: boolean, sets: Array<{done?: boolean}>}>} plan
 * @param {number} [after]
 * @returns {number}
 */
export function focusInSection(sec, plan, after = -1) {
  const undone = (/** @type {number} */ ei) =>
    !plan[ei].skipped && plan[ei].sets.some((s) => !s.done);
  const next = sec.eis.find((ei) => ei > after && undone(ei));
  if (next !== undefined) return next;
  const any = sec.eis.find(undone);
  return any === undefined ? -1 : any;
}

/**
 * Какая секция откроется после `fromId`: следующая по порядку с недоделанным
 * упражнением, а если дальше таких нет — первая пропущенная выше. null — всё
 * закрыто. Сама `fromId` не кандидат: вызывается, когда её закрыли или ушли из неё.
 *
 * @param {Section[]} secs
 * @param {string | null} fromId
 * @returns {Section | null}
 */
export function nextSection(secs, fromId) {
  const from = secs.findIndex((s) => s.id === fromId);
  const after = secs.slice(from + 1).find((s) => !s.allDone);
  if (after) return after;
  return secs.find((s, i) => i !== from && !s.allDone) || null;
}

/**
 * Секция при входе на экран (старт, возобновление): та, где лежит первое
 * недоделанное упражнение плана. null — сделано всё.
 *
 * @param {Section[]} secs
 * @returns {Section | null}
 */
export function initialSection(secs) {
  return secs.find((s) => !s.allDone) || null;
}
