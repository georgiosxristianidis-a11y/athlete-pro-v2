'use strict';
/**
 * BUDGET-1 — месячный потолок трат на серверном ключе (дефолт $5).
 *
 * Лимитеры по IP (CORE-2) режут частоту, а не деньги: смена IP их снимает,
 * а проект Gemini с привязанным биллингом списывает каждый анонимный запрос
 * с кредита владельца (Paid 1, предоплата €5 от 25.09, расход 1–10.10 €0.06).
 * Квоту в Google Cloud Console (решение CORE-2) не выставили — потолок держит
 * код, чтобы один скрипт не сжёг кредит разом.
 *
 * Как считает. До вызова модели запрос резервирует ХУДШУЮ стоимость в общем
 * месячном счётчике (KV, тот же Upstash, что у лимитеров): вход — UTF-8 байты
 * промпта (токен не короче байта, оценка сверху), выход — потолок ответа, в
 * который у Gemini входят и мысли. Резерв не влез — модель не зовётся. TTS
 * отдаёт `usageMetadata` и досчитывается по факту; поток и JSON идут через
 * `lib/aiOrchestrator.js` (каталог FABLE5), расход оттуда не читается — их
 * резерв остаётся как есть. Счётчик завышает траты, поэтому потолок
 * срабатывает раньше реальных $5, но не позже.
 *
 * BYOK не считается: платит владелец ключа. Модель без цены в таблице на
 * серверном ключе не идёт вовсе. KV задан, но не отвечает — отказ: деньги
 * важнее доступности, а BYOK продолжает работать.
 */
import { logWarn } from './logger.js';
import { sharedRedisClient } from './rateLimitStore.js';
import { resolveGeminiModel } from '../js/shared/ai-engine.js';

/**
 * Цены Google за 1M токенов, Standard paid tier — ai.google.dev/gemini-api/docs/pricing,
 * сверено 2026-10-10. `from` — с какой даты действует строка (Flash дорожает вдвое 01.01.2027).
 * Выход включает мысли. Новая модель в ALLOWED_GEMINI_MODELS без строки здесь = красный тест.
 */
const PRICES = new Map([
  ['gemini-3.6-flash', [
    { from: '2026-01-01', inUsd: 0.75, outUsd: 3.75 },
    { from: '2027-01-01', inUsd: 1.5, outUsd: 7.5 },
  ]],
  ['gemini-3.1-pro-preview', [{ from: '2026-01-01', inUsd: 2, outUsd: 12 }]],
  ['gemini-2.5-flash-preview-tts', [{ from: '2026-01-01', inUsd: 0.5, outUsd: 10 }]],
]);

export const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * Потолки ответа — зеркало `lib/aiOrchestrator.js` (те же env и дефолты, у
 * Anthropic там те же 1024/1500). Импортом не берём: файл в каталоге FABLE5.
 * Расхождение ловит test/server-key-budget.test.js.
 */
export const OUT_TOKENS = Object.freeze({
  stream: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_STREAM) || 1024,
  json: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_JSON) || 1500,
});

/**
 * Аудио Gemini — 32 токена в секунду; медленная «тренерская» речь ≈ 8 симв/с
 * → 4 токена на символ, ×1.5 запаса. Это только резерв: TTS досчитывается по
 * `usageMetadata` ответа.
 */
export const TTS_OUT_TOKENS_PER_CHAR = 6;

const DEFAULT_CAP_USD = 5;
const KEY_TTL_S = 40 * 24 * 3600;

/** @param {NodeJS.ProcessEnv} [env] */
export function capMicros(env = process.env) {
  const usd = Number(env.SERVER_KEY_MONTHLY_CAP_USD);
  return Math.round((Number.isFinite(usd) && usd >= 0 ? usd : DEFAULT_CAP_USD) * 1e6);
}

/** Верхняя оценка токенов: UTF-8 байты всех частей промпта. */
export function byteTokens(...parts) {
  let n = 0;
  for (const p of parts) n += Buffer.byteLength(typeof p === 'string' ? p : JSON.stringify(p ?? ''), 'utf8');
  return n;
}

/**
 * @param {string} model
 * @param {Date} [now]
 * @returns {{inUsd:number,outUsd:number}|null}
 */
export function priceFor(model, now = new Date()) {
  const rows = PRICES.get(model);
  if (!rows) return null;
  const day = now.toISOString().slice(0, 10);
  let hit = null;
  for (const row of rows) if (row.from <= day) hit = row;
  return hit;
}

/**
 * Микродоллары (1e-6 USD), целое — счётчик в Redis без float.
 * токены × $/1M = микродоллары.
 */
export function costMicros(price, inTokens, outTokens) {
  return Math.ceil(inTokens * price.inUsd + outTokens * price.outUsd);
}

/** Фактическая стоимость по `usageMetadata` Gemini; null — поля нет. */
export function usageMicros(price, usage) {
  if (!usage || typeof usage !== 'object') return null;
  const inT = Number(usage.promptTokenCount) || 0;
  const outT = (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0);
  if (!inT && !outT) return null;
  return costMicros(price, inT, outT);
}

const _monthKey = (now) => `budget:server-key:${now.toISOString().slice(0, 7)}`;

/**
 * Счётчик трат за UTC-месяц. `redis` — клиент Upstash или фейк с
 * `incrby(key, n)` / `expire(key, s)`; null — счётчик в памяти процесса.
 * @param {{ redis?: {incrby(k:string,n:number):Promise<number>, expire(k:string,s:number):Promise<unknown>}|null, now?: () => Date }} [opts]
 */
export function createBudget({ redis = null, now = () => new Date() } = {}) {
  const mem = new Map();
  const incr = redis
    ? async (key, n) => {
      const total = await redis.incrby(key, n);
      if (n > 0 && total === n) await redis.expire(key, KEY_TTL_S);
      return total;
    }
    : async (key, n) => {
      const total = (mem.get(key) || 0) + n;
      mem.set(key, total);
      return total;
    };

  return {
    mode: redis ? 'shared' : 'memory',
    /**
     * @param {number} micros
     * @param {number} [cap]
     * @returns {Promise<{ok:boolean, spent:number, settle:(actual:number)=>Promise<void>}>}
     */
    async reserve(micros, cap = capMicros()) {
      const key = _monthKey(now());
      const spent = await incr(key, micros);
      if (spent > cap) {
        await incr(key, -micros);
        return { ok: false, spent: spent - micros, settle: async () => {} };
      }
      let open = true;
      return {
        ok: true,
        spent,
        // Факт вместо резерва: разница — в обе стороны, один раз.
        settle: async (actual) => {
          if (!open) return;
          open = false;
          const diff = Math.max(0, Math.round(actual)) - micros;
          if (diff) await incr(key, diff);
        },
      };
    },
  };
}

let _budget = null;
function _shared() {
  _budget ??= createBudget({ redis: sharedRedisClient() });
  return _budget;
}

/** Режим счётчика — наружу через `/api/ai-status`, не остаток. */
export function budgetMode() {
  return _shared().mode;
}

/** @param {'gemini'|'anthropic'} engine */
function _serverKeyConfigured(engine, env = process.env) {
  const key = engine === 'anthropic' ? env.ANTHROPIC_API_KEY : env.GOOGLE_GENERATIVE_AI_API_KEY;
  return !!key && !key.includes('your-') && key.length > 10;
}

/** @param {'gemini'|'anthropic'} engine */
function _modelFor(engine, env = process.env) {
  return engine === 'anthropic'
    ? env.CLAUDE_MODEL || 'claude-sonnet-4-6'
    : resolveGeminiModel(env.GEMINI_MODEL);
}

const _NOOP = Object.freeze({ ok: true, settle: async () => {} });

/**
 * Перед вызовом модели. BYOK или серверного ключа нет (провайдер и так
 * откажет без трат) — пропуск без учёта.
 * @param {import('express').Request} req
 * @param {{ engine: 'gemini'|'anthropic', customKey?: string, model?: string, inTokens: number, outTokens: number }} opts
 * @returns {Promise<{ok:true, settle:(actualMicros:number)=>Promise<void>} | {ok:false, status:number, code:string, error:string}>}
 */
export async function reserveServerSpend(req, { engine, customKey, model, inTokens, outTokens }, budget = _shared()) {
  if (customKey || !_serverKeyConfigured(engine)) return _NOOP;

  const m = model || _modelFor(engine);
  const price = priceFor(m);
  if (!price) {
    logWarn(req, 'budget_unpriced', `no price for ${m} — server key spend refused`);
    return { ok: false, status: 503, code: 'BUDGET_UNPRICED', error: 'BUDGET_UNPRICED: server key is not priced for this model' };
  }

  let r;
  try {
    r = await budget.reserve(costMicros(price, inTokens, outTokens));
  } catch (err) {
    logWarn(req, 'budget_unavailable', err?.message || String(err));
    return { ok: false, status: 503, code: 'BUDGET_UNAVAILABLE', error: 'BUDGET_UNAVAILABLE: spend counter is down — use your own key in Settings' };
  }
  if (!r.ok) {
    logWarn(req, 'budget_exhausted', 'monthly server key budget is spent', { spentMicros: r.spent });
    return { ok: false, status: 429, code: 'BUDGET_EXHAUSTED', error: 'BUDGET_EXHAUSTED: the shared coach is out for this month — add your own key in Settings' };
  }
  return {
    ok: true,
    settle: async (actual) => {
      try {
        await r.settle(actual);
      } catch (err) {
        logWarn(req, 'budget_settle_failed', err?.message || String(err));
      }
    },
  };
}
