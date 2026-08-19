// @ts-check
/* ════════════════════════════════════════════════════════
   shared/ppl-color.js — единственный источник PPL-цвета для JS
   ────────────────────────────────────────────────────────
   PPL-закон живёт в токенах `css/base.css`: Push=green (`--c-push`),
   Pull=cyan (`--c-pull`), Legs=purple (`--c-legs`). Тема их
   переопределяет — в `:root[data-theme='light']` они другие.

   До DS-1 четыре модуля держали свою копию хексов, и копии разошлись:
   workout рисовал Pull как `#00e5ff`, analytics как `#00b8d4`. Ни одна
   не реагировала на светлую тему. Здесь цвет берётся из токена, а не
   дублируется.

   Почему hex, а не `var(--c-push)`: вызывающие клеят альфу
   (`${color}20`) и кормят цветом canvas `fillStyle` — CSS-переменная
   не умеет ни того, ни другого. Поэтому токен резолвится в hex здесь,
   один раз, с кэшем.
   ════════════════════════════════════════════════════════ */

/** @typedef {'push'|'pull'|'legs'} PplType */

/** Порядок закреплён PPL-законом — на нём строятся сетки выбора типа. */
export const PPL_TYPES = /** @type {PplType[]} */ (['push', 'pull', 'legs']);

/** @type {Record<PplType, string>} */
const TOKEN = { push: '--c-push', pull: '--c-pull', legs: '--c-legs' };

/**
 * Значения тёмной темы из `css/base.css :root`. Нужны там, где нет DOM
 * (node --test) и как страховка, если токен не отдался. Сверяется с CSS
 * тестом `test/ppl-color.test.js` — разъехаться молча не смогут.
 * @type {Record<PplType, string>}
 */
export const PPL_FALLBACK = { push: '#00e676', pull: '#00b8d4', legs: '#8b5cf6' };

/** @type {Partial<Record<PplType, string>> | null} */
let _cache = null;
let _watching = false;

/** Сбросить кэш — цвета перечитаются из токенов при следующем запросе. */
export function resetPplCache() {
  _cache = null;
}

/**
 * Тема меняет токены, поэтому кэш обязан умирать вместе с `data-theme`.
 * Наблюдатель ставится лениво, один раз за сессию.
 */
function _watchTheme() {
  if (_watching || typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
  _watching = true;
  new MutationObserver(resetPplCache).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

/**
 * `rgb(0, 230, 118)` → `#00e676`. Токены записаны хексами, но
 * getComputedStyle не обязан их таким возвращать — нормализуем,
 * иначе склейка альфы (`color + '20'`) даст мусор.
 * @param {string} v
 * @returns {string|null} hex или null, если формат незнакомый
 */
function _toHex(v) {
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return '#' + s.slice(1).split('').map((c) => c + c).join('').toLowerCase();
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]]
    .map((n) => Math.round(+n).toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();
}

/**
 * Цвет типа тренировки по PPL-закону — из токена текущей темы.
 * @param {string|null|undefined} type — 'push' | 'pull' | 'legs'
 * @returns {string} hex вида `#00e676`; для неизвестного типа — цвет Push
 */
export function pplColor(type) {
  const t = /** @type {PplType} */ (type);
  if (!TOKEN[t]) return pplColor('push');

  if (_cache?.[t]) return /** @type {string} */ (_cache[t]);
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return PPL_FALLBACK[t];
  }

  _watchTheme();
  const raw = getComputedStyle(document.documentElement).getPropertyValue(TOKEN[t]);
  const hex = _toHex(raw || '') || PPL_FALLBACK[t];
  _cache = { ..._cache, [t]: hex };
  return hex;
}

/**
 * Тот же цвет с альфой — вместо ручной склейки `${color}20` по коду.
 * @param {string|null|undefined} type
 * @param {number} alpha — 0..1
 * @returns {string} hex-8 вида `#00e67633`
 */
export function pplColorAlpha(type, alpha) {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
  return pplColor(type) + a;
}

/**
 * Известен ли тип PPL-закону. Заменяет проверки вида `PPL_HEX[w.type]`,
 * где словарь цветов подрабатывал валидатором.
 * @param {string|null|undefined} type
 * @returns {boolean}
 */
export function isPplType(type) {
  return !!TOKEN[/** @type {PplType} */ (type)];
}
