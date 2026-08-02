// @ts-check
/* ════════════════════════════════════════════════════════
   shared/theme.js — тема оформления (dark / light / auto)
   ────────────────────────────────────────────────────────
   Тема — это ТОЛЬКО набор токенов в `css/base.css`: тёмные лежат
   в `:root`, светлые в `:root[data-theme='light']`. Здесь нет ни
   одного цвета — только выбор атрибута на <html>.

   Предпочтение живёт в localStorage, НЕ в IndexedDB: атрибут
   выставляется синхронным `js/theme-boot.js` ДО первой отрисовки,
   а IDB асинхронна — через неё экран успел бы моргнуть тёмным.
   Ключ прошит в двух местах (здесь и в theme-boot.js), их совпадение
   сторожит `test/theme.test.js`.
   ════════════════════════════════════════════════════════ */

export const THEME_KEY = 'ap-theme';

/** @typedef {'dark'|'light'|'auto'} ThemePref */

/** Цвет статус-бара (meta theme-color) — совпадает с --c-bg темы. */
const META_COLOR = { dark: '#050507', light: '#f4f4f7' };

/**
 * Предпочтение → фактическая тема. Чистая функция: вся развилка
 * «auto» здесь, чтобы её можно было проверить без браузера.
 * @param {string|null|undefined} pref
 * @param {boolean} prefersLight — что говорит система (prefers-color-scheme: light)
 * @returns {'dark'|'light'}
 */
export function resolveTheme(pref, prefersLight = false) {
  if (pref === 'light') return 'light';
  if (pref === 'auto') return prefersLight ? 'light' : 'dark';
  return 'dark'; // дефолт и любое мусорное значение
}

/**
 * Сохранённое предпочтение. Дефолт — 'dark' (решение Gio, 2026-08-02).
 * @returns {ThemePref}
 */
export function getThemePref() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return (v === 'light' || v === 'auto' || v === 'dark') ? v : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Записать предпочтение и применить его на месте.
 * @param {ThemePref} pref
 */
export function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode */ }
  applyTheme();
}

/** Система сейчас в светлом режиме? */
function _systemLight() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
}

/**
 * Прошить фактическую тему в <html data-theme> + meta theme-color.
 * @returns {'dark'|'light'} фактическая тема
 */
export function applyTheme() {
  const theme = resolveTheme(getThemePref(), _systemLight());
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[theme]);
  return theme;
}

/**
 * Подписка на смену системной темы — нужна только в режиме 'auto'.
 * Слушатель ставится один раз за сессию.
 */
export function watchSystemTheme() {
  if (typeof matchMedia !== 'function') return;
  const mq = matchMedia('(prefers-color-scheme: light)');
  const onChange = () => { if (getThemePref() === 'auto') applyTheme(); };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onChange); // Safari < 14
}
