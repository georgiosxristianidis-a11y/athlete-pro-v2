// @ts-check
/**
 * Default coach engine and Gemini model — one source for client and server.
 *
 * Server Google key is the launch path; Anthropic stays selectable.
 * Chat/JSON only: TTS keeps its own preview-tts model in routes/coach.js.
 */

/** @typedef {'gemini' | 'anthropic'} AiEngine */

/** @type {AiEngine} */
export const DEFAULT_AI_ENGINE = 'gemini';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/** Models Gio will actually use. 2.x flash is too weak for the coach. */
export const ALLOWED_GEMINI_MODELS = Object.freeze(['gemini-3.6-flash', 'gemini-3.1-pro-preview']);

/**
 * @param {string | undefined} envValue
 * @returns {string}
 */
export function resolveGeminiModel(envValue) {
  if (envValue && ALLOWED_GEMINI_MODELS.includes(envValue)) return envValue;
  return DEFAULT_GEMINI_MODEL;
}

/**
 * Префикс ключа провайдера. Живёт здесь, а не в `js/ai-settings.store.js`,
 * потому что форму ключа проверяют обе стороны: вид — перед сохранением,
 * сервер — перед тем как предпочесть BYOK ключу окружения. Тащить ради семи
 * строк весь `ai-settings.store.js` в граф сервера нельзя: он импортирует
 * `./db.js`, а за ним восемь store-модулей IndexedDB.
 */
export const KEY_PREFIX = { gemini: 'AIza', anthropic: 'sk-ant-' };

/** @param {string} [engine] @returns {AiEngine} */
export function normalizeEngine(engine) {
  return engine === 'anthropic' ? 'anthropic' : 'gemini';
}

/**
 * Форма ключа, а не его годность: сеть здесь не трогается.
 * @param {string} engine
 * @param {string} val
 */
export function keyLooksValid(engine, val) {
  const v = String(val || '').trim();
  return v.startsWith(KEY_PREFIX[normalizeEngine(engine)] || '') && v.length > 30;
}
