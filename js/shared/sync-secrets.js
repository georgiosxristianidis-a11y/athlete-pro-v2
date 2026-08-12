// @ts-check
/* ════════════════════════════════════════════════════════
   shared/sync-secrets.js — что никогда не уезжает с устройства

   BYOK-ключи (`gemini-key`, `anthropic-key`) лежат в том же key-value
   хранилище `settings`, что и «вес в кг» и «язык», а `settings` синкается
   целиком. Разницы между настройкой и секретом в коде не было — она жила
   в голове. Линия elite-hud-wow это доказала на сквозном PoC: ключ уехал
   открытым текстом на сервер и вернулся оттуда третьей стороне.

   Одна функция, один источник правды: и запись в IDB, и очередь синка, и
   слияние входящих строк спрашивают её. Гард — `test/perimeter-guard.test.js`.
   ════════════════════════════════════════════════════════ */

/** Имя настройки, оканчивающееся на секретный суффикс: `gemini-key`, `x_token`. */
const SECRET_KEY_RE = /(^|[-_.])(key|apikey|api-key|token|secret|password)$/i;

/**
 * Секрет ли это? Секреты не покидают устройство ни в каком режиме приватности.
 * @param {unknown} key имя настройки в store `settings`
 * @returns {boolean}
 */
export function isSecretKey(key) {
  return typeof key === 'string' && SECRET_KEY_RE.test(key);
}
