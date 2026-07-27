// @ts-check
/* ════════════════════════════════════════════════════════
   block-ticks.js — позиция блока в тренировке, полосками

   Заменяет римскую нумерацию в заголовках блоков («БЛОК IV: КОР»)
   на ту же грамматику, что уже стоит в шапке онбординга
   (js/onboarding.js): ряд сегментов, залитых накопительно до текущего,
   текущий — с подсветкой. Одна и та же метафора прогресса в двух
   местах приложения вместо двух разных.

   Почему полоски, а не цифры: римская нумерация требует чтения и
   перевода («IV — это который?»), полоски читаются периферийным
   зрением за один взгляд — а в логгере сетов взгляд короткий.

   Ориентация вертикальная: в онбординге прогресс горизонтальный,
   потому что он про путь; здесь полоски стоят слева от названия
   блока как отметка уровня, и вертикаль не спорит с горизонталью
   строки. Форма (▣▥◆○) остаётся за chamber-pill — полоски говорят
   «где я», глифы говорят «что это»; лок 2026-06-20 не тронут.
   ════════════════════════════════════════════════════════ */

import { esc } from './utils.js';

/**
 * Собрать упорядоченный список уникальных блоков плана.
 * Порядок = порядок первого появления в плане (он же порядок,
 * в котором пользователь их проходит).
 *
 * @param {Array<{block?: string}>} plan
 * @returns {string[]} id блоков без повторов, в порядке прохождения
 */
export function blockOrder(plan) {
  const seen = [];
  for (const ex of plan || []) {
    const id = ex && ex.block;
    if (id && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

/**
 * HTML-строка с полосками-этапами.
 *
 * Заливка накопительная (как в онбординге): при index=3 из 4 горят
 * четыре полоски, последняя — активная. Пустой строкой отвечает на
 * вырожденный вход, чтобы вызывающий код не проверял границы сам.
 *
 * @param {object} opts
 * @param {number} opts.index   позиция блока, 0-based
 * @param {number} opts.total   сколько всего блоков в тренировке
 * @param {string} [opts.color] цвет активных полосок (PPL-токен сессии)
 * @param {string} [opts.label] название блока — уходит в aria-label
 * @returns {string}
 */
export function blockTicks({ index, total, color = 'var(--c-chrome)', label = '' }) {
  if (!Number.isInteger(index) || !Number.isInteger(total)) return '';
  if (total < 1 || index < 0 || index >= total) return '';

  const ticks = Array.from({ length: total }, (_, i) => {
    const on = i <= index;
    const cur = i === index;
    const cls = `blk-tick${on ? ' is-on' : ''}${cur ? ' is-current' : ''}`;
    // Цвет приходит переменной, а не в background: активные полоски красятся
    // PPL-цветом сессии, погашенные — токеном рамки из CSS.
    return `<i class="${cls}"></i>`;
  }).join('');

  const aria = label
    ? `${esc(label)}, ${index + 1} / ${total}`
    : `${index + 1} / ${total}`;

  return `<span class="blk-ticks" style="--blk-on:${color}" role="img" aria-label="${aria}">${ticks}</span>`;
}
