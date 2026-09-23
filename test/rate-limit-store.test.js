// @ts-check
/**
 * Гард CORE-2: общий стор лимитера, а не молчаливый MemoryStore.
 *
 * Опорный факт: `docs/THREAT_MODEL.md` § «API Abuse» выдавал
 * `express-rate-limit` за защиту, а дефолтный `MemoryStore` держит счётчик в
 * памяти ОДНОГО serverless-инстанса — на Vercel это лимит инстанса, не
 * пользователя, сбрасываемый холодным стартом. Без переменных окружения
 * (локально, в тестах, в CI) это не ошибка, а честный fallback — но он
 * обязан быть виден, не тихим.
 *
 * `buildStore` — чистая функция от клиента, поэтому тестируется фейком без
 * сети: настоящий `@upstash/redis` создаётся только внутри
 * `sharedRateLimitStore`, когда переменные окружения на месте.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildStore, sharedRateLimitStore, rateLimitMode } from '../lib/rateLimitStore.js';

/** Фейковый Redis-клиент: команды, которые реально использует buildStore. */
function fakeRedis() {
  const store = new Map();
  const calls = [];
  return {
    calls,
    async incr(key) {
      calls.push(['incr', key]);
      const next = (store.get(key)?.n || 0) + 1;
      store.set(key, { ...store.get(key), n: next });
      return next;
    },
    async decr(key) {
      calls.push(['decr', key]);
      const next = (store.get(key)?.n || 0) - 1;
      store.set(key, { ...store.get(key), n: next });
      return next;
    },
    async pexpire(key, ms) {
      calls.push(['pexpire', key, ms]);
      store.set(key, { ...store.get(key), expiresAt: Date.now() + ms });
    },
    async pttl(key) {
      const rec = store.get(key);
      if (!rec?.expiresAt) return -1;
      return rec.expiresAt - Date.now();
    },
    async del(key) {
      calls.push(['del', key]);
      store.delete(key);
    },
  };
}

describe('buildStore — Store express-rate-limit поверх Redis-совместимого клиента', () => {
  test('increment: totalHits растёт, resetTime появляется после первого хита', async () => {
    const redis = fakeRedis();
    const store = buildStore(redis, 'rl:test:');
    store.init({ windowMs: 60_000 });

    const first = await store.increment('1.2.3.4');
    assert.equal(first.totalHits, 1);
    assert.ok(first.resetTime instanceof Date, 'TTL выставлен на первом хите — resetTime обязан быть датой');

    const second = await store.increment('1.2.3.4');
    assert.equal(second.totalHits, 2);
  });

  test('TTL выставляется только на первом хите — иначе окно никогда не закрывается', async () => {
    const redis = fakeRedis();
    const store = buildStore(redis, 'rl:test:');
    store.init({ windowMs: 60_000 });

    await store.increment('ip');
    await store.increment('ip');
    await store.increment('ip');

    const pexpireCalls = redis.calls.filter((c) => c[0] === 'pexpire');
    assert.equal(pexpireCalls.length, 1, 'pexpire позвали больше одного раза — окно у активного клиента не закроется');
  });

  test('ключи разных лимитеров не пересекаются — свой prefix на каждый', async () => {
    const redis = fakeRedis();
    const coachStore = buildStore(redis, 'rl:coach:');
    const apiStore = buildStore(redis, 'rl:api:');
    coachStore.init({ windowMs: 60_000 });
    apiStore.init({ windowMs: 60_000 });

    await coachStore.increment('1.2.3.4');
    const apiFirst = await apiStore.increment('1.2.3.4');
    assert.equal(apiFirst.totalHits, 1, 'счётчик coach и api для одного IP не должен быть общим');
  });

  test('decrement/resetKey бьют по тому же префиксованному ключу, что increment', async () => {
    const redis = fakeRedis();
    const store = buildStore(redis, 'rl:test:');
    store.init({ windowMs: 60_000 });

    await store.increment('ip');
    await store.decrement('ip');
    await store.resetKey('ip');

    assert.deepEqual(redis.calls.map((c) => c[1]), ['rl:test:ip', 'rl:test:ip', 'rl:test:ip', 'rl:test:ip']);
  });

  test('localKeys: false — double-count guard экспресса не путает это с MemoryStore', () => {
    const store = buildStore(fakeRedis(), 'rl:test:');
    assert.equal(store.localKeys, false);
  });
});

describe('sharedRateLimitStore / rateLimitMode — переключение по переменным окружения', () => {
  const KEYS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const saved = {};

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function clearEnv() {
    for (const k of KEYS) {
      if (!(k in saved)) saved[k] = process.env[k];
      delete process.env[k];
    }
  }

  test('без переменных окружения — undefined (дефолтный MemoryStore) и режим memory', () => {
    clearEnv();
    assert.equal(sharedRateLimitStore('rl:x:'), undefined);
    assert.equal(rateLimitMode(), 'memory');
  });

  test('KV_REST_API_URL/TOKEN на месте — реальный Store и режим shared', () => {
    clearEnv();
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    const store = sharedRateLimitStore('rl:x:');
    assert.ok(store, 'переменные заданы, а стор всё ещё undefined — упал на дефолтный MemoryStore молча');
    assert.equal(typeof store.increment, 'function');
    assert.equal(rateLimitMode(), 'shared');
  });

  test('UPSTASH_REDIS_REST_URL/TOKEN — тот же путь, что и KV_* (общий REST-контракт)', () => {
    clearEnv();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    assert.ok(sharedRateLimitStore('rl:x:'));
    assert.equal(rateLimitMode(), 'shared');
  });

  test('только URL без токена — не считается настроенным', () => {
    clearEnv();
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    assert.equal(sharedRateLimitStore('rl:x:'), undefined);
    assert.equal(rateLimitMode(), 'memory');
  });
});
