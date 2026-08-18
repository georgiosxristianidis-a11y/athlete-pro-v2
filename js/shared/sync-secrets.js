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

   Синк — не единственная дверь наружу. `DB.Settings.getAll()` отдаёт store
   целиком, и этот же объект уезжал в тело запроса как `profile`, а оттуда —
   в текст промпта (`Profile: ${JSON.stringify(profile)}`). Путь мимо очереди
   синка, поэтому фильтр в `push()`/`set()` его не видел: ключ доезжал до
   стороннего движка в открытом виде. Отсюда `stripSecrets()` — та же функция
   правды, но для исходящего снимка настроек.
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

/**
 * Снимок настроек без секретов — всё, что уходит с устройства, проходит здесь.
 * BYOK-ключ передаётся отдельным полем `customKey` осознанно; в `profile`,
 * который попадает в текст промпта, ему делать нечего.
 * @template {Record<string, *>} T
 * @param {T} settings результат `DB.Settings.getAll()`
 * @returns {Partial<T>} копия без секретных ключей
 */
export function stripSecrets(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const safe = /** @type {Partial<T>} */ ({});
  for (const key of Object.keys(settings)) {
    if (!isSecretKey(key)) safe[key] = settings[key];
  }
  return safe;
}
