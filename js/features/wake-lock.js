// @ts-check
/* ════════════════════════════════════════════════════════
   wake-lock.js — Screen Wake Lock API management
   Держит экран включённым на живой тренировке (UX-2a).

   Блокировка = «сессия жива» И «keep-awake ON». Эти два входа меняются
   независимо (старт/восстановление/финиш сессии; тумблер в профиле), поэтому
   модуль помнит оба и сводит их в одно желаемое состояние.

   Браузер сам снимает блокировку, когда страница скрывается (экран выключен,
   смена приложения, PiP) — событие `release` приходит, а обратно она не
   возвращается. Пока блокировка желаема, модуль слушает `visibilitychange`
   и при возврате страницы запрашивает её заново.
   ════════════════════════════════════════════════════════ */

import { listenerGroup } from '../shared/utils.js';

/** @type {WakeLockSentinel | null} */
let _wakeLock = null;
/** @type {Promise<boolean> | null} */
let _pending = null;
/** Тренировка идёт. */
let _live = false;
/** Настройка `keep-awake`; дефолт ON (BG-1, opt-out). */
let _enabled = true;
/** @type {ReturnType<typeof listenerGroup> | null} */
let _visOn = null;

const _wanted = () => _live && _enabled;

function _onVisibility() {
  if (document.visibilityState === 'visible' && _wanted()) _request();
}

/** Один слушатель на страницу — повторный вызов не плодит дубли. */
function _listen() {
  if (_visOn || typeof document === 'undefined') return;
  _visOn = listenerGroup(/** @type {any} */ (document));
  _visOn.add('visibilitychange', _onVisibility);
}

function _unlisten() {
  if (!_visOn) return;
  _visOn.release();
  _visOn = null;
}

/**
 * Идемпотентный запрос: уже держим — ничего; запрос в полёте — ждём его;
 * страница скрыта — браузер откажет, ждём visibilitychange.
 * @returns {Promise<boolean>}
 */
function _request() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return Promise.resolve(false);
  if (_wakeLock && !_wakeLock.released) return Promise.resolve(true);
  if (_pending) return _pending;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return Promise.resolve(false);
  }
  _pending = (async () => {
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // Пока шёл запрос, тренировку закончили или тумблер выключили.
      if (!_wanted()) {
        sentinel.release().catch(() => {});
        return false;
      }
      _wakeLock = sentinel;
      sentinel.addEventListener('release', () => {
        if (_wakeLock === sentinel) _wakeLock = null;
      });
      return true;
    } catch (err) {
      // NotAllowedError (скрытая страница, экономия заряда) — повторим на visible.
      console.warn('[WakeLock] Failed to acquire:', /** @type {Error} */ (err).message);
      return false;
    } finally {
      _pending = null;
    }
  })();
  return _pending;
}

async function _drop() {
  const sentinel = _wakeLock;
  _wakeLock = null;
  if (!sentinel || sentinel.released) return;
  try {
    await sentinel.release();
  } catch (err) {
    console.warn('[WakeLock] Failed to release:', /** @type {Error} */ (err).message);
  }
}

/** @returns {Promise<boolean>} true — блокировка сейчас держится */
function _reconcile() {
  if (_wanted()) {
    _listen();
    return _request();
  }
  _unlisten();
  return _drop().then(() => false);
}

/**
 * Тренировка началась или восстановлена: держать экран, если настройка ON.
 * @param {boolean} [enabled] — значение `keep-awake`; не передано — прежнее
 * @returns {Promise<boolean>}
 */
export function startWakeLockSession(enabled) {
  if (enabled !== undefined) _enabled = enabled;
  _live = true;
  return _reconcile();
}

/**
 * Тренировка завершена, отменена или спасена в журнал.
 * @returns {Promise<boolean>}
 */
export function releaseWakeLock() {
  _live = false;
  return _reconcile();
}

/**
 * Тумблер «Keep screen awake»: действует сразу, в том числе на идущую тренировку.
 * Без живой сессии только запоминает значение.
 * @param {boolean} enabled
 * @returns {Promise<boolean>}
 */
export function setWakeLockEnabled(enabled) {
  _enabled = enabled;
  return _reconcile();
}

/**
 * Check if a wake lock is active.
 * @returns {boolean}
 */
export function isWakeLockActive() {
  return _wakeLock !== null && !_wakeLock.released;
}
