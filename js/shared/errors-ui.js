// @ts-check
import { isRu } from '../locale.store.js';

/**
 * errors-ui.js — normalize any thrown value into a clean, user-facing message
 * (task 0-3). The UI never shows stack traces or raw internal error strings;
 * known failure shapes map to friendly, localized copy, everything else to a
 * safe generic. Pair with Toast / inline error slots.
 *
 *   import { toUserMessage } from '../shared/errors-ui.js';
 *   Toast.show(toUserMessage(err), 'error');
 *
 * @param {unknown} err              - Error, string, fetch/Response-ish, anything thrown.
 * @param {string}  [fallback]       - Context-specific default (already localized if you pass one).
 * @returns {string}
 */
export function toUserMessage(err, fallback) {
  const ru = isRu();
  const generic = fallback || (ru ? 'Что-то пошло не так. Попробуйте ещё раз.' : 'Something went wrong. Please try again.');

  // Pull a string to classify from, without ever surfacing it verbatim.
  const raw = err == null ? ''
    : typeof err === 'string' ? err
    : (/** @type {any} */ (err).message || /** @type {any} */ (err).error
       || /** @type {any} */ (err).statusText || /** @type {any} */ (err).reason || '');
  const s = String(raw).toLowerCase();

  // Lazy-loaded module (dynamic import()) failed. Browsers phrase this as a
  // "fetch" error even when the real cause has nothing to do with the network
  // (stale chunk after a deploy, syntax error in the chunk, CSP block) — check
  // this before the generic network classifier so we don't cry "offline" while
  // actually online (task F-6).
  if (s.includes('dynamically imported module') || s.includes('importing a module script failed')
      || s.includes('error loading dynamically imported module')) {
    if (!navigator.onLine) return ru ? 'Нет соединения. Проверьте интернет.' : 'No connection — check your internet.';
    return ru ? 'Не удалось загрузить часть приложения. Обновите страницу.' : 'Failed to load part of the app. Please refresh the page.';
  }
  // Offline / network — also trust the live connection flag.
  if (!navigator.onLine || s.includes('failed to fetch') || s.includes('networkerror')
      || s.includes('network request failed') || s.includes('load failed') || s.includes('err_internet')) {
    return ru ? 'Нет соединения. Проверьте интернет.' : 'No connection — check your internet.';
  }
  // Timeout / aborted request.
  if (s.includes('timeout') || s.includes('timed out') || s.includes('abort')) {
    return ru ? 'Превышено время ожидания. Попробуйте снова.' : 'Request timed out. Please try again.';
  }
  // Rate limited.
  if (s.includes('429') || s.includes('too many requests') || s.includes('rate limit')) {
    return ru ? 'Слишком много запросов. Подождите немного.' : 'Too many requests — please wait a moment.';
  }
  // Auth / API key.
  if (s.includes('401') || s.includes('403') || s.includes('unauthorized') || s.includes('forbidden')
      || s.includes('api key') || s.includes('apikey') || s.includes('invalid key')) {
    return ru ? 'Проблема с ключом доступа. Проверьте настройки.' : 'Authorization problem — check your key in Settings.';
  }
  // Server-side failure.
  if (s.includes('500') || s.includes('502') || s.includes('503') || s.includes('internal server')) {
    return ru ? 'Сервис временно недоступен. Попробуйте позже.' : 'Service temporarily unavailable. Try again later.';
  }
  return generic;
}
