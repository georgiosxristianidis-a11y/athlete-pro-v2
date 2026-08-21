// @ts-check
/* ════════════════════════════════════════════════════════
   usage.js — счётчик живых установок (флаг 'usage-stats', OFF)
   ────────────────────────────────────────────────────────
   Ровно ТРИ события уходят в Vercel Web Analytics:
     app_open          — запуск приложения (одно на сессию вкладки)
     workout_completed — сессия сохранена в историю
     coach_message     — пользователь задал вопрос коучу

   Что НЕ уходит никогда: текст сообщений коучу, имена упражнений,
   веса, тоннаж, id устройства, любые ключи. Разрешённые поля payload
   перечислены в SCHEMA — всё, чего там нет, режется до отправки.
   Событие вне EVENTS не отправляется вообще: имя — белый список, а не
   строка от вызывающего.

   ── Почему не `import { track } from '@vercel/analytics'` ──
   Проект — vanilla ES-модули без сборщика: голый специфер браузер не
   разрешит, а импорт-карта живёт в index.html, который в этой карточке
   не трогаем (SPLASH-1). Поэтому здесь повторён ровно тот путь, которым
   идёт сам пакет (@vercel/analytics 2.0.1, dist/index.mjs): инжект
   /_vercel/insights/script.js с data-sdkn/data-sdkv и вызов
   window.va('event', { name, data }). Протокол и дашборд — те же.

   ── Пять ворот, все должны быть открыты ──
     1. flag('usage-stats')       — по умолчанию OFF, ничего не грузится
     2. DNT / GPC                 — сигнал браузера сильнее тумблера
     3. самоисключение автора     — localStorage 'ap-usage-exclude'
     4. тумблер пользователя      — DB.Settings 'usage.enabled'
     5. прод-хост                 — /_vercel/insights есть только на Vercel

   ── Airgap ──
   Режим «без сети» считается, но только агрегатом: у события срезается
   payload целиком, наружу уходит одно имя. Отключается тем же тумблером,
   что и у всех; строка в настройках говорит об этом прямым текстом.

   ── Очередь ──
   Офлайн (или скрипт ещё не поднялся) → событие ложится в IndexedDB
   (DB.Settings, ключ 'usage.queue', не в отдельный store — схему не
   мигрируем). Досылка на 'online' и на следующем старте. Потолок 50
   записей и 7 дней: недельной давности app_open дашборду не нужен.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { flag } from './flags.js';
import { VERSION } from './version.js';

const SCRIPT_SRC = '/_vercel/insights/script.js';
const SDK_NAME = '@vercel/analytics';
const SDK_VERSION = '2.0.1';

const KEY_ENABLED = 'usage.enabled'; // синкается: тумблер — решение человека, а не устройства
// Очередь синкаться НЕ должна: она про одно устройство. Префикс 'ap-' — это и
// есть выключатель синка (js/db/settings.js: ключи 'ap-*' не идут в _triggerSync).
// Без него устройство B подтянуло бы недосланное устройства A и посчитало дважды.
const KEY_QUEUE = 'ap-usage-queue';
const KEY_EXCLUDE = 'ap-usage-exclude'; // localStorage: переживает очистку данных

const QUEUE_MAX = 50;
const QUEUE_TTL = 7 * 24 * 3600e3;

/** Белый список событий. Имени вне этого набора не существует. */
export const EVENTS = /** @type {const} */ (['app_open', 'workout_completed', 'coach_message']);

/**
 * Разрешённые поля payload на событие. Значение — только скаляр
 * (строка/число/булево); всё остальное режется, как и любой ключ вне схемы.
 * @type {Record<string, string[]>}
 */
const SCHEMA = {
  app_open: ['version', 'mode'],
  workout_completed: ['type'],
  coach_message: [],
};

/* ── In-memory ── */
let _enabled = true; // opt-out: тумблер живёт под флагом, который сам OFF
let _initialized = false;
let _injected = false;
let _openSent = false;

/* ════════════════════════════════════════════════════════
   ВОРОТА
   ════════════════════════════════════════════════════════ */

/** Сигнал браузера «не следить» — DNT или Global Privacy Control. */
export function isDoNotTrack() {
  if (typeof navigator === 'undefined') return false;
  const nav = /** @type {any} */ (navigator);
  const win = /** @type {any} */ (typeof window === 'undefined' ? {} : window);
  return (
    nav.doNotTrack === '1' ||
    nav.doNotTrack === 'yes' ||
    win.doNotTrack === '1' ||
    nav.msDoNotTrack === '1' ||
    nav.globalPrivacyControl === true
  );
}

/** Самоисключение автора: своё устройство из счёта вон. */
export function isSelfExcluded() {
  try {
    return localStorage.getItem(KEY_EXCLUDE) === '1';
  } catch {
    return false;
  }
}

/** @param {boolean} on */
export function setSelfExcluded(on) {
  try {
    if (on) localStorage.setItem(KEY_EXCLUDE, '1');
    else localStorage.removeItem(KEY_EXCLUDE);
  } catch {
    /* private mode — молча */
  }
}

/**
 * Хост, на котором эндпоинт /_vercel/insights вообще существует.
 * Локалка и LAN отсекаются: там SPA-фолбэк сервера отдаст на script.js
 * index.html, и в консоль прилетит синтаксическая ошибка на ровном месте.
 */
function _isProdHost() {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  if (location.protocol !== 'https:') return false;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return false;
  if (/^(?:10|127)\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

/** Тумблер пользователя (в памяти; источник правды — DB.Settings). */
export function isUsageEnabled() {
  return _enabled;
}

/**
 * Может ли счётчик вообще работать на этом устройстве — без учёта тумблера.
 * Настройки показывают строку только когда true.
 */
export function isUsageAvailable() {
  return flag('usage-stats') && !isDoNotTrack() && !isSelfExcluded();
}

/**
 * Почему счётчик молчит. Настройки печатают это под заголовком строки.
 * @returns {'ok'|'flag'|'dnt'|'excluded'|'off'|'host'}
 */
export function getUsageState() {
  if (!flag('usage-stats')) return 'flag';
  if (isDoNotTrack()) return 'dnt';
  if (isSelfExcluded()) return 'excluded';
  if (!_enabled) return 'off';
  if (!_isProdHost()) return 'host';
  return 'ok';
}

/* ════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════ */

/**
 * Читает тумблер, поднимает скрипт Vercel и досылает очередь.
 * Безопасно звать при выключённом флаге — тогда не делает ничего.
 * @returns {Promise<void>}
 */
export async function initUsage() {
  if (_initialized) return;
  _initialized = true;

  if (typeof window !== 'undefined') {
    window.Usage = {
      track: trackUsage,
      excludeSelf: setSelfExcluded,
      isExcluded: isSelfExcluded,
      state: getUsageState,
      queue: getQueue,
    };
  }

  if (!flag('usage-stats')) return;

  const stored = await DB.Settings.get(KEY_ENABLED, null).catch(() => null);
  _enabled = stored === null ? true : !!stored;

  if (getUsageState() !== 'ok') return;

  _injectScript();
  window.addEventListener('online', () => { void flushQueue(); });
  await flushQueue();
}

/** @param {boolean} on */
export async function setUsageEnabled(on) {
  _enabled = !!on;
  await DB.Settings.set(KEY_ENABLED, _enabled);
  if (!_enabled) {
    await DB.Settings.set(KEY_QUEUE, []); // выключил — недосланное не переживает решение
    return;
  }
  if (getUsageState() === 'ok') {
    _injectScript();
    await flushQueue();
  }
}

/** Инжект первоисточника — тот же тег, что ставит сам @vercel/analytics. */
function _injectScript() {
  if (_injected || typeof document === 'undefined') return;
  if (document.head.querySelector(`script[src="${SCRIPT_SRC}"]`)) { _injected = true; return; }

  // Очередь-заглушка пакета: вызовы до загрузки скрипта буферизуются в vaq.
  if (!window.va) {
    window.va = function va(...params) {
      (window.vaq = window.vaq || []).push(params);
    };
  }

  const script = document.createElement('script');
  script.src = SCRIPT_SRC;
  script.defer = true;
  script.dataset.sdkn = SDK_NAME;
  script.dataset.sdkv = SDK_VERSION;
  script.onerror = () => {
    // Web Analytics не включена в проекте Vercel, либо блокировщик. Не шумим
    // тостом: счётчик — не функция приложения, его молчание ничего не ломает.
    console.debug('[usage] insights script blocked or not enabled');
  };
  document.head.appendChild(script);
  _injected = true;
}

/* ════════════════════════════════════════════════════════
   TRACK
   ════════════════════════════════════════════════════════ */

/**
 * Санитайзер payload: белый список ключей + только скаляры.
 * В режиме airgap возвращает undefined — наружу уходит голое имя.
 * @param {string} name
 * @param {Record<string, unknown>} [data]
 * @returns {Record<string, string|number|boolean>|undefined}
 */
export function sanitizePayload(name, data) {
  if (_privacyMode() === 'airgap') return undefined;
  const allowed = SCHEMA[name];
  if (!allowed || !allowed.length || !data) return undefined;
  /** @type {Record<string, string|number|boolean>} */
  const out = {};
  for (const key of allowed) {
    const v = data[key];
    const ok = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    if (ok) out[key] = /** @type {string|number|boolean} */ (v);
  }
  return Object.keys(out).length ? out : undefined;
}

function _privacyMode() {
  try {
    return typeof window !== 'undefined' && window.__privacyMode ? window.__privacyMode() : 'airgap';
  } catch {
    return 'airgap';
  }
}

/**
 * Единственная точка отправки. Имя вне EVENTS игнорируется.
 * Никогда не бросает и ничего не ждёт: вызывающий код (сохранение
 * тренировки, отправка вопроса коучу) не должен падать из-за счётчика.
 * @param {string} name
 * @param {Record<string, unknown>} [data]
 * @returns {Promise<void>}
 */
export async function trackUsage(name, data) {
  try {
    if (!(/** @type {readonly string[]} */ (EVENTS).includes(name))) return;
    if (getUsageState() !== 'ok') return;

    const payload = sanitizePayload(name, data);

    // Офлайн или скрипт ещё не поднялся → в очередь, а не в никуда.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await _enqueue(name, payload);
      return;
    }
    _send(name, payload);
  } catch {
    /* счётчик молчит громче, чем падает */
  }
}

/**
 * @param {string} name
 * @param {Record<string, string|number|boolean>|undefined} data
 */
function _send(name, data) {
  const va = typeof window !== 'undefined' ? window.va : null;
  if (typeof va !== 'function') return;
  va('event', data ? { name, data } : { name });
}

/** Одно app_open на сессию вкладки — перерисовки и возвраты из фона не в счёт. */
export function trackAppOpen() {
  if (_openSent) return Promise.resolve();
  _openSent = true;
  return trackUsage('app_open', { version: VERSION, mode: _privacyMode() });
}

/* ════════════════════════════════════════════════════════
   ОЧЕРЕДЬ (DB.Settings, без миграции схемы)
   ════════════════════════════════════════════════════════ */

/** @returns {Promise<Array<{n: string, d?: Record<string, string|number|boolean>, t: number}>>} */
export async function getQueue() {
  const raw = await DB.Settings.get(KEY_QUEUE, []).catch(() => []);
  return Array.isArray(raw) ? raw : [];
}

async function _enqueue(name, data) {
  const q = await getQueue();
  q.push({ n: name, ...(data ? { d: data } : {}), t: Date.now() });
  await DB.Settings.set(KEY_QUEUE, _prune(q));
}

/**
 * Чистка очереди: протухшее вон, потолок сверху (режем старое, не новое).
 * @template {{t: number}} T
 * @param {T[]} q
 * @param {number} [now]
 * @returns {T[]}
 */
export function _prune(q, now = Date.now()) {
  const fresh = q.filter((e) => e && typeof e.t === 'number' && now - e.t < QUEUE_TTL);
  return fresh.length > QUEUE_MAX ? fresh.slice(fresh.length - QUEUE_MAX) : fresh;
}

/**
 * Досылка. Очередь чистится ДО отправки: повторный вход (два 'online' подряд)
 * не должен отправить одно и то же дважды.
 * @returns {Promise<number>} сколько записей ушло
 */
export async function flushQueue() {
  if (getUsageState() !== 'ok') return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  const q = _prune(await getQueue());
  if (!q.length) return 0;
  if (typeof window === 'undefined' || typeof window.va !== 'function') return 0;

  await DB.Settings.set(KEY_QUEUE, []);
  for (const e of q) _send(e.n, e.d);
  return q.length;
}
