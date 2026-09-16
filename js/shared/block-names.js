// @ts-check
/* ════════════════════════════════════════════════════════
   block-names.js — canonical block id → display label map
   Zero DOM. Extracted from chamber-pill.js (A5) so that
   workout.store.js does not import a DOM-rendering module
   just for these constants.
   ════════════════════════════════════════════════════════ */

/**
 * Каноническая карта названий блоков — ЕДИНСТВЕННАЯ в приложении.
 *
 * До этого их было три и они расходились: логгер сетов звал блок
 * `shape` — VOLUME, отчёт — SHAPE, эта карта — SHAPE; `thickness` был
 * то THICKNESS, то THICK. Один блок обязан называться одним словом на
 * всех экранах, иначе пользователь думает, что это разные вещи.
 *
 * Слова короткие намеренно: подпись стоит рядом с неоновой шкалой
 * этапов и не должна с ней спорить за внимание.
 */
export const BLOCK_NAMES = {
  power:      ['POWER',     'СИЛА'],
  shape:      ['SHAPE',     'ФОРМА'],
  width:      ['WIDTH',     'ШИРИНА'],
  thickness:  ['THICK',     'ТОЛЩИНА'],
  heavy:      ['HEAVY',     'ТЯЖЁЛЫЙ'],
  iso:        ['ISO',       'ИЗО'],
  arms:       ['ARMS',      'РУКИ'],
  shoulders:  ['SHOULDERS', 'ПЛЕЧИ'],
  core:       ['CORE',      'КОР'],
  align:      ['ALIGN',     'ОСАНКА'],
  glutes:     ['GLUTES',    'ЯГОДИЦЫ'],
  quads:      ['QUADS',     'КВАДРИЦЕПС'],
  hamstrings: ['HAMS',      'БИЦЕПС БЕДРА'],
};

/**
 * Map a block identifier to a display label.
 * @param {string} block
 * @param {boolean} [ru]  вернуть русское название
 * @returns {string}
 */
export function blockLabel(block, ru = false) {
  const pair = BLOCK_NAMES[block?.toLowerCase()];
  if (!pair) return block?.toUpperCase() ?? '—';
  return ru ? pair[1] : pair[0];
}

/** Английские названия карты — для мест, где язык не при чём (данные сессии). */
export const BLOCK_NAMES_EN = Object.fromEntries(
  Object.entries(BLOCK_NAMES).map(([id, pair]) => [id, pair[0]]),
);
