// @ts-check
/**
 * lazy-css.js — стили экрана едут вместе с его модулем (LOAD-1).
 *
 * До этого все 13 таблиц стояли в <head>: одиннадцать из них с media="print"
 * (не блокируют рендер), но браузер всё равно качал и парсил их на старте,
 * включая экраны, которые за сессию можно не открыть. Здесь ровно та же
 * механика, что у ленивого JS: точка загрузки переезжает к точке показа.
 *
 * Содержимое CSS не трогается — переезжает только момент загрузки.
 */

/** href -> Promise<void>; один и тот же файл грузим ровно один раз. */
const _pending = new Map();

/**
 * Сколько ждём ответа, прежде чем пустить навигацию дальше. Без этого
 * зависший запрос (сеть «есть», но мёртвая) заморозил бы Nav.go навсегда —
 * вспышка нестилизованного экрана неприятна, застрявшая навигация хуже.
 */
const CSS_TIMEOUT_MS = 2000;

/**
 * Загрузить таблицу стилей и дождаться её применения.
 * @param {string} href
 * @returns {Promise<void>}
 */
function _load(href) {
  const cached = _pending.get(href);
  if (cached) return cached;

  // Уже в разметке (base/dashboard и шелловые) — ничего не делаем.
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    const done = Promise.resolve();
    _pending.set(href, done);
    return done;
  }

  const p = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    link.addEventListener('load', finish, { once: true });
    link.addEventListener('error', () => {
      console.warn('[lazy-css] failed', href);
      finish();
    }, { once: true });
    setTimeout(finish, CSS_TIMEOUT_MS);
    document.head.appendChild(link);
  });

  _pending.set(href, p);
  return p;
}

/**
 * Дождаться, пока перечисленные таблицы окажутся в DOM и применятся.
 * @param {...string} hrefs
 * @returns {Promise<void>}
 */
export async function ensureCss(...hrefs) {
  await Promise.all(hrefs.map(_load));
}

/**
 * Экран -> его стили. Ключи совпадают с id из index.html и с ключами Nav.on,
 * так что новый экран забывает про CSS ровно там же, где забыл бы про handler.
 * s-home здесь нет намеренно: dashboard.css критический и стоит в <head>.
 * @type {Record<string, string[]>}
 */
export const SCREEN_CSS = {
  's-train': ['css/workout.css', 'css/summary.css'],
  's-stats': ['css/analytics.css'],
  's-journal': ['css/journal.css'],
  's-body': ['css/body-stats.css'],
  's-profile': ['css/profile.css'],
  's-intel': ['css/intel.css'],
  // Экран настроек Острова собран из карточек профиля (.profile-card).
  's-island-settings': ['css/profile.css'],
};

/**
 * Стили экрана — до того, как экран показан.
 * @param {string} id — id экрана ('s-train', …)
 * @returns {Promise<void>}
 */
export function ensureScreenCss(id) {
  const hrefs = SCREEN_CSS[id];
  return hrefs ? ensureCss(...hrefs) : Promise.resolve();
}
