// @ts-check
/**
 * AI settings — engine, BYOK key, coach tone. Zero DOM (Store/View).
 *
 * Key flow: input → debounce → save → live ping via /api/verify-key.
 * The view owns the indicator; this module returns verdicts and persists.
 */
import { DB } from './db.js';
import { DEFAULT_AI_ENGINE } from './shared/ai-engine.js';

export const KEY_DEBOUNCE_MS = 650;
export const KEY_PREFIX = { gemini: 'AIza', anthropic: 'sk-ant-' };
export const KEY_FIELD = { gemini: 'gemini-key', anthropic: 'anthropic-key' };

/** @typedef {'gemini' | 'anthropic'} AiEngine */

/**
 * Гонка: пользователь дописывает ключ, пока летит проверка предыдущего.
 * Ответ старого запроса обязан быть выброшен.
 */
let _keyCheckSeq = 0;

/** @param {string} [engine] @returns {AiEngine} */
export function normalizeEngine(engine) {
  return engine === 'anthropic' ? 'anthropic' : 'gemini';
}

/** @param {string} [engine] */
export function keyField(engine) {
  return KEY_FIELD[normalizeEngine(engine)];
}

/** @param {string} [engine] */
export function keyPrefix(engine) {
  return KEY_PREFIX[normalizeEngine(engine)];
}

/** @param {string} engine @param {string} val */
export function keyLooksValid(engine, val) {
  const v = String(val || '').trim();
  return v.startsWith(KEY_PREFIX[normalizeEngine(engine)] || '') && v.length > 30;
}

/**
 * Стартовое состояние индикатора — без сетевой проверки: открытие настроек
 * не должно молча стучаться к провайдеру (приложение airgap-first).
 * Сохранённый ключ показывается как «сохранён», а не как «подключён».
 *
 * @param {string} val
 * @param {string} prefix
 * @param {boolean} serverHas
 * @returns {'empty'|'server'|'saved'|'partial'}
 */
export function keyConnInitState(val, prefix, serverHas) {
  const trimmed = String(val || '').trim();
  if (!trimmed) return serverHas ? 'server' : 'empty';
  return trimmed.startsWith(prefix) && trimmed.length > 30 ? 'saved' : 'partial';
}

/** Invalidate in-flight verify so a stale ping cannot paint the indicator. */
export function bumpKeyCheckSeq() {
  _keyCheckSeq += 1;
  return _keyCheckSeq;
}

/** @returns {Promise<AiEngine>} */
export async function getEngine() {
  const raw = await DB.Settings.get('ai-engine');
  return normalizeEngine(raw || DEFAULT_AI_ENGINE);
}

/**
 * Persist the selected engine. Airgap is a hard stop — the view shows the toast.
 * @param {string} engine
 * @returns {Promise<{ ok: true, engine: AiEngine } | { ok: false, reason: 'airgap' }>}
 */
export async function setEngine(engine) {
  const { getPrivacyMode } = await import('./privacy.store.js');
  if (getPrivacyMode() === 'airgap') return { ok: false, reason: 'airgap' };
  const next = normalizeEngine(engine);
  await DB.Settings.set('ai-engine', next);
  return { ok: true, engine: next };
}

/** Тон коуча, 0 (терапевт) .. 100 (Гоггинс). Дефолт — нейтрально. */
export function getTone() {
  return DB.Settings.get('intel-tone', 50);
}

/** @param {string|number} value */
export function setTone(value) {
  const n = Number(value);
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
  return DB.Settings.set('intel-tone', clamped);
}

/**
 * Пинг провайдера через backend-прокси (ключ на фронте наружу не уходит).
 * @param {AiEngine} engine
 * @param {string} key
 * @returns {Promise<{state:'ok'|'invalid'|'offline'|'blocked'|'disabled', latencyMs?:number}>}
 */
export async function verifyKey(engine, key) {
  try {
    const { safeFetch } = await import('./privacy.store.js');
    const res = await safeFetch(
      '/api/verify-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, key }),
      },
      'ai'
    );
    const data = await res.json();
    if (data.ok) return { state: 'ok', latencyMs: data.latencyMs };
    // «Ключ не принят» и «API не включён в проекте» чинятся по-разному.
    return {
      state: { invalid_key: 'invalid', api_disabled: 'disabled' }[data.reason] || 'offline',
    };
  } catch (err) {
    if (err && /** @type {Error} */ (err).name === 'PrivacyBlockedError')
      return { state: 'blocked' };
    return { state: 'offline' };
  }
}

/**
 * Применить ключ: сохранить, проверить коннект. DOM не трогает.
 * @param {string} engine
 * @param {string} raw
 * @returns {Promise<{ stale: boolean, state?: string, latencyMs?: number }>}
 */
export async function commitKey(engine, raw) {
  const eng = normalizeEngine(engine);
  const val = String(raw || '').trim();
  const seq = ++_keyCheckSeq;

  await DB.Settings.set(KEY_FIELD[eng], val);

  if (!val) {
    return seq === _keyCheckSeq ? { stale: false, state: 'empty' } : { stale: true };
  }
  if (!keyLooksValid(eng, val)) {
    return seq === _keyCheckSeq ? { stale: false, state: 'partial' } : { stale: true };
  }

  const verdict = await verifyKey(eng, val);
  if (seq !== _keyCheckSeq) return { stale: true };
  return { stale: false, ...verdict };
}

/**
 * Auth payload for P.A.N.D.A. Core text requests — selected engine plus its BYOK key.
 * TTS stays on Gemini separately (routes/coach.js is pinned to gemini-tts).
 * @returns {Promise<{ engine: AiEngine, customKey: string|undefined }>}
 */
export async function aiAuth() {
  const engine = await getEngine();
  const raw = await DB.Settings.get(keyField(engine));
  const customKey = raw ? String(raw) : undefined;
  return { engine, customKey };
}
