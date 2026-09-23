'use strict';
/**
 * Общее хранилище для `express-rate-limit` (CORE-2).
 *
 * Без него счётчик живёт в `MemoryStore` — памяти ОДНОГО процесса. На Vercel
 * serverless это не лимит пользователя, а лимит инстанса: холодный старт
 * обнуляет счётчик, а параллельные инвокации вообще не видят друг друга.
 * `docs/THREAT_MODEL.md` § «API Abuse» называл эти лимитеры защитой — не были.
 *
 * Vercel KV и Upstash Redis делят один REST-контракт (KV — это Upstash под
 * капотом), поэтому один клиент `@upstash/redis` обслуживает оба: полноценный
 * Redis-протокол не нужен, только HTTP — годится для serverless без сокета.
 *
 * Ключ квоты/само хранилище — настройки аккаунта Gio (решение CORE-2,
 * 2026-09-23, вариант A). Без переменных окружения — не ошибка, а честный
 * fallback на `MemoryStore` с громким предупреждением: тихого возврата дыры
 * не будет, режим виден в `/api/ai-status` (`rateLimitMode()`).
 */
import { Redis } from '@upstash/redis';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ url: string, token: string } | null}
 */
function _credsFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

let _warned = false;
function _warnOnce() {
  if (_warned) return;
  _warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[RateLimit] KV_REST_API_URL/UPSTASH_REDIS_REST_URL не заданы — лимитер живёт в памяти ' +
      'процесса. На serverless (Vercel) это лимит одного инстанса, не пользователя.'
  );
}

/**
 * `Store` из `express-rate-limit` поверх Redis-совместимого клиента — чистая
 * функция от клиента, тестируется фейком без сети (`test/rate-limit-store.test.js`).
 * @param {{incr(key:string):Promise<number>, pexpire(key:string,ms:number):Promise<unknown>, pttl(key:string):Promise<number>, decr(key:string):Promise<number>, del(key:string):Promise<unknown>}} redis
 * @param {string} prefix — свой на каждый лимитер, иначе разные маршруты делят один счётчик
 * @returns {import('express-rate-limit').Store}
 */
export function buildStore(redis, prefix) {
  let windowMs = 0;
  return {
    localKeys: false,
    prefix,
    init(options) {
      windowMs = options.windowMs;
    },
    async increment(key) {
      const fullKey = `${prefix}${key}`;
      const totalHits = await redis.incr(fullKey);
      // TTL выставляется только на первом хите окна — иначе каждый запрос
      // отодвигал бы дедлайн, и окно никогда не закрывалось бы для активного клиента.
      if (totalHits === 1) await redis.pexpire(fullKey, windowMs);
      const ttl = await redis.pttl(fullKey);
      return { totalHits, resetTime: ttl > 0 ? new Date(Date.now() + ttl) : undefined };
    },
    async decrement(key) {
      await redis.decr(`${prefix}${key}`);
    },
    async resetKey(key) {
      await redis.del(`${prefix}${key}`);
    },
  };
}

let _redis = null;
function _client(creds) {
  _redis ??= new Redis(creds);
  return _redis;
}

/**
 * @param {string} prefix
 * @returns {import('express-rate-limit').Store | undefined} `undefined` →
 *   вызывающий код остаётся на дефолтном `MemoryStore` express-rate-limit
 *   (`store: undefined` — библиотека сама подставляет `new MemoryStore()`).
 */
export function sharedRateLimitStore(prefix) {
  const creds = _credsFromEnv();
  if (!creds) {
    _warnOnce();
    return undefined;
  }
  return buildStore(_client(creds), prefix);
}

/** Режим лимитера — наружу через `/api/ai-status`, не молчит в проде. */
export function rateLimitMode() {
  return _credsFromEnv() ? 'shared' : 'memory';
}
