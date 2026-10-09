// @ts-check
/* ════════════════════════════════════════════════════════
   digit-roll.js — одометр разницы для чипов Home (BOOT-1)
   ────────────────────────────────────────────────────────
   Крутятся только разряды, изменившиеся с последнего увиденного значения,
   каждый вперёд (9 → 0 → 1). Нет базы, число не выросло или сменилась маска
   (длина, позиции '.' и 'k': 999 → 1.0k, 9 → 10, смена недели) — число стоит.

   Здесь нет DOM и анимации: модуль отдаёт строку разметки, движение — CSS
   `transform` колонки цифр (css/dashboard.css, .dig-roll). textContent
   разметки равен новому значению: пока колонка едет, лишние цифры лежат
   в `data-trail` и рисуются псевдоэлементом, а не узлами.
   ════════════════════════════════════════════════════════ */

import { esc } from './utils.js';

/** База разницы: показанные строки трёх чипов. Не в KEEP_ON_WIPE, не в бэкапе — производное. */
export const DASH_SEEN_KEY = 'ap-dash-seen';

/** @param {string} s маска: цифры → '#', остальное как есть */
const maskOf = (s) => s.replace(/\d/g, '#');

/**
 * Какие разряды крутить при переходе prev → next.
 * При равной маске строки одной длины с одинаковыми не-цифрами, поэтому
 * лексикографическое сравнение совпадает с числовым.
 * @param {string | null | undefined} prev
 * @param {string | null | undefined} next
 * @returns {number[] | null} индексы изменившихся цифр; null — числу стоять
 */
export function rollDiff(prev, next) {
  if (typeof prev !== 'string' || typeof next !== 'string') return null;
  if (!/\d/.test(next) || maskOf(prev) !== maskOf(next)) return null;
  if (next <= prev) return null;
  const idx = [];
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== prev[i] && next[i] >= '0' && next[i] <= '9') idx.push(i);
  }
  return idx;
}

/**
 * Число чипа в HTML: с колонками на изменившихся разрядах или просто текст.
 * @param {string | null | undefined} prev последнее увиденное
 * @param {string} next то, что показываем
 * @param {number} [chip] порядок чипа в ряду — сдвигает старт числа
 * @returns {string}
 */
export function chipValueHtml(prev, next, chip = 0) {
  const idx = rollDiff(prev, next);
  if (!idx || typeof prev !== 'string') return esc(next);
  let out = '';
  let ord = 0;
  for (let i = 0; i < next.length; i++) {
    if (!idx.includes(i)) {
      out += esc(next[i]);
      continue;
    }
    const from = Number(prev[i]);
    const steps = (Number(next[i]) - from + 10) % 10;
    const trail = Array.from({ length: steps }, (_, k) => (from + k) % 10).join('\n');
    out +=
      `<span class="dig-roll"><span class="dig-roll-col" data-trail="${trail}"` +
      ` style="--roll-n:${steps};--roll-i:${ord};--roll-c:${chip}">${next[i]}</span></span>`;
    ord++;
  }
  return out;
}

/** @returns {{w: string, m: string, s: string} | null} */
export function readSeen() {
  try {
    const raw = localStorage.getItem(DASH_SEEN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o.w === 'string' && typeof o.m === 'string' && typeof o.s === 'string'
      ? { w: o.w, m: o.m, s: o.s }
      : null;
  } catch {
    return null;
  }
}

/** @param {{w: string, m: string, s: string}} seen */
export function writeSeen(seen) {
  try {
    localStorage.setItem(DASH_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* private mode / квота — база не нужна, число просто встанет без анимации */
  }
}

export function clearSeen() {
  try {
    localStorage.removeItem(DASH_SEEN_KEY);
  } catch {
    /* private mode */
  }
}
