/**
 * BUDGET-1 — месячный потолок трат на серверном ключе.
 *
 * Проект Gemini с привязанным биллингом списывает каждый анонимный запрос с
 * кредита владельца (предоплата €5 от 25.09), лимитеры по IP деньги не держат.
 * Инварианты:
 *   1. Резерв не влез в потолок — модель не зовётся, счётчик не растёт.
 *   2. Цена — по дате (Flash вдвое дороже с 2027), у каждой модели сервера есть строка.
 *   3. Потолки ответа в счётчике = потолкам в lib/aiOrchestrator.js.
 *   4. KV не отвечает — отказ, а не бесплатный проход.
 *   5. BYOK мимо счётчика: платит владелец ключа.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TTS_MODEL, OUT_TOKENS, capMicros, byteTokens, priceFor, costMicros, usageMicros,
  createBudget, reserveServerSpend,
} from '../lib/serverKeyBudget.js';
import { ALLOWED_GEMINI_MODELS } from '../js/shared/ai-engine.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** Фейк Upstash: incrby/expire поверх Map, журнал expire. */
function fakeRedis() {
  const data = new Map();
  const expires = [];
  return {
    data, expires,
    async incrby(key, n) { const v = (data.get(key) || 0) + n; data.set(key, v); return v; },
    async expire(key, s) { expires.push([key, s]); return 1; },
  };
}

describe('Цены и оценка', () => {
  test('Flash дорожает вдвое 01.01.2027 — цена берётся по дате', () => {
    assert.deepEqual(priceFor('gemini-3.6-flash', new Date('2026-12-31T23:59:00Z')), { from: '2026-01-01', inUsd: 0.75, outUsd: 3.75 });
    assert.equal(priceFor('gemini-3.6-flash', new Date('2027-01-01T00:00:00Z')).outUsd, 7.5);
  });

  test('модель без строки в таблице — null, прототип не цена', () => {
    assert.equal(priceFor('gemini-9-ultra'), null);
    assert.equal(priceFor('__proto__'), null);
    assert.equal(priceFor('constructor'), null);
  });

  test('у каждой модели, которую сервер может позвать, есть цена', () => {
    for (const m of [...ALLOWED_GEMINI_MODELS, TTS_MODEL]) {
      assert.ok(priceFor(m), `${m} без цены — на серверном ключе его счётчик откажет (BUDGET_UNPRICED)`);
    }
  });

  test('микродоллары: токены × $/1M, округление вверх', () => {
    const p = { inUsd: 0.75, outUsd: 3.75 };
    assert.equal(costMicros(p, 1_000_000, 0), 750_000, '1M входа = $0.75');
    assert.equal(costMicros(p, 1000, 1024), 4590);
    assert.equal(costMicros({ inUsd: 0.1, outUsd: 0 }, 3, 0), 1, 'дробь округляется вверх, не в ноль');
  });

  test('оценка входа — UTF-8 байты: кириллица вдвое, объекты через JSON', () => {
    assert.equal(byteTokens('abc'), 3);
    assert.equal(byteTokens('жим'), 6);
    assert.equal(byteTokens({ a: 1 }, null), JSON.stringify({ a: 1 }).length + 2);
  });

  test('факт TTS по usageMetadata: мысли считаются как выход', () => {
    const p = priceFor(TTS_MODEL);
    assert.equal(usageMicros(p, { promptTokenCount: 100, candidatesTokenCount: 1000, thoughtsTokenCount: 10 }), Math.ceil(100 * 0.5 + 1010 * 10));
    assert.equal(usageMicros(p, undefined), null);
    assert.equal(usageMicros(p, {}), null);
  });

  test('потолок из env, мусор и минус — дефолт $5', () => {
    assert.equal(capMicros({}), 5_000_000);
    assert.equal(capMicros({ SERVER_KEY_MONTHLY_CAP_USD: '2.5' }), 2_500_000);
    assert.equal(capMicros({ SERVER_KEY_MONTHLY_CAP_USD: 'abc' }), 5_000_000);
    assert.equal(capMicros({ SERVER_KEY_MONTHLY_CAP_USD: '-1' }), 5_000_000);
    assert.equal(capMicros({ SERVER_KEY_MONTHLY_CAP_USD: '0' }), 0, 'ноль — осознанно выключенный серверный коуч');
  });

  test('потолки ответа = lib/aiOrchestrator.js (иначе резерв меньше худшего случая)', () => {
    const src = read('lib/aiOrchestrator.js');
    const num = (re) => Number(src.match(re)?.[1]);
    assert.equal(OUT_TOKENS.stream, num(/GEMINI_MAX_OUTPUT_TOKENS_STREAM\)\s*\|\|\s*(\d+)/));
    assert.equal(OUT_TOKENS.json, num(/GEMINI_MAX_OUTPUT_TOKENS_JSON\)\s*\|\|\s*(\d+)/));
    const anthropicMax = [...src.matchAll(/max_tokens:\s*(\d+)/g)].map((m) => Number(m[1]));
    assert.ok(anthropicMax.length >= 2, 'не найдены max_tokens Anthropic');
    for (const n of anthropicMax) assert.ok(n <= OUT_TOKENS.json, `max_tokens ${n} выше резерва ${OUT_TOKENS.json}`);
  });

  test('TTS зовёт ровно ту модель, что стоит в таблице цен', () => {
    const src = read('routes/coach.js');
    assert.equal(src.includes(`'${TTS_MODEL}'`) || src.includes(`"${TTS_MODEL}"`), false,
      'имя TTS-модели снова литералом в routes/coach.js — счётчик может разойтись с вызовом');
    assert.match(src, /models\/\$\{TTS_MODEL\}:generateContent/);
  });
});

describe('Счётчик за месяц', () => {
  test('резерв сверх потолка откатывается, счётчик не растёт', async () => {
    const b = createBudget({ now: () => new Date('2026-10-10T12:00:00Z') });
    assert.equal(b.mode, 'memory');
    const r1 = await b.reserve(6000, 10_000);
    assert.equal(r1.ok, true);
    const r2 = await b.reserve(6000, 10_000);
    assert.equal(r2.ok, false);
    assert.equal(r2.spent, 6000, 'отказ не оставляет резерв в счётчике');
    await r1.settle(1000); // факт меньше резерва — разница вернулась
    assert.equal((await b.reserve(9000, 10_000)).ok, true, '1000 + 9000 = потолок ровно');
    assert.equal((await b.reserve(1, 10_000)).ok, false);
  });

  test('settle срабатывает один раз и умеет доплатить сверх резерва', async () => {
    const redis = fakeRedis();
    const b = createBudget({ redis, now: () => new Date('2026-10-10T12:00:00Z') });
    const r = await b.reserve(100, 10_000);
    await r.settle(250);
    await r.settle(0);
    assert.equal(redis.data.get('budget:server-key:2026-10'), 250);
  });

  test('общий счётчик: ключ по UTC-месяцу, TTL ставится один раз, месяцы не смешиваются', async () => {
    const redis = fakeRedis();
    let now = new Date('2026-10-31T23:59:00Z');
    const b = createBudget({ redis, now: () => now });
    assert.equal(b.mode, 'shared');
    await b.reserve(100, 1000);
    await b.reserve(100, 1000);
    now = new Date('2026-11-01T00:00:01Z');
    await b.reserve(100, 1000);
    assert.equal(redis.data.get('budget:server-key:2026-10'), 200);
    assert.equal(redis.data.get('budget:server-key:2026-11'), 100);
    assert.deepEqual(redis.expires.map(([k]) => k), ['budget:server-key:2026-10', 'budget:server-key:2026-11']);
    assert.ok(redis.expires.every(([, s]) => s > 31 * 24 * 3600), 'TTL короче месяца — счётчик обнулится посреди месяца');
  });
});

describe('reserveServerSpend', () => {
  const KEY = 'AIza' + 'x'.repeat(35);
  let saved;
  before(() => { saved = process.env.GOOGLE_GENERATIVE_AI_API_KEY; process.env.GOOGLE_GENERATIVE_AI_API_KEY = KEY; });
  after(() => {
    if (saved === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = saved;
  });

  test('KV не отвечает — 503 BUDGET_UNAVAILABLE, а не бесплатный проход', async () => {
    const down = { async reserve() { throw new Error('upstash down'); } };
    const r = await reserveServerSpend({}, { engine: 'gemini', inTokens: 10, outTokens: 10 }, down);
    assert.deepEqual([r.ok, r.status, r.code], [false, 503, 'BUDGET_UNAVAILABLE']);
  });

  test('модель без цены на серверном ключе не идёт', async () => {
    const r = await reserveServerSpend({}, { engine: 'gemini', model: 'gemini-9-ultra', inTokens: 1, outTokens: 1 }, createBudget());
    assert.deepEqual([r.ok, r.code], [false, 'BUDGET_UNPRICED']);
  });

  test('исчерпан — 429 и стабильный токен BUDGET_EXHAUSTED в error', async () => {
    const savedCap = process.env.SERVER_KEY_MONTHLY_CAP_USD;
    process.env.SERVER_KEY_MONTHLY_CAP_USD = '0';
    try {
      const r = await reserveServerSpend({}, { engine: 'gemini', inTokens: 1, outTokens: 1 }, createBudget());
      assert.deepEqual([r.ok, r.status, r.code], [false, 429, 'BUDGET_EXHAUSTED']);
      assert.match(r.error, /BUDGET_EXHAUSTED/);
    } finally {
      if (savedCap === undefined) delete process.env.SERVER_KEY_MONTHLY_CAP_USD;
      else process.env.SERVER_KEY_MONTHLY_CAP_USD = savedCap;
    }
  });

  test('BYOK и отсутствующий серверный ключ — мимо счётчика', async () => {
    const spy = { calls: 0, async reserve() { this.calls++; return { ok: true, settle: async () => {} }; } };
    await reserveServerSpend({}, { engine: 'gemini', customKey: KEY, inTokens: 1, outTokens: 1 }, spy);
    await reserveServerSpend({}, { engine: 'anthropic', inTokens: 1, outTokens: 1 }, spy);
    assert.equal(spy.calls, 0);
  });
});

/* Сквозной: потолок $0, серверный ключ задан — ни один маршрут не доходит до модели. */
describe('Маршруты: потолок исчерпан — модель не зовётся', () => {
  const KEY = 'AIza' + 'y'.repeat(35);
  const env = {};
  let server, port, gemini, realClient, realFetch;
  let upstream = 0;

  before(async () => {
    for (const k of ['GOOGLE_GENERATIVE_AI_API_KEY', 'SERVER_KEY_MONTHLY_CAP_USD']) env[k] = process.env[k];
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = KEY;
    process.env.SERVER_KEY_MONTHLY_CAP_USD = '0';
    ({ gemini } = await import('../lib/geminiClient.js'));
    realClient = gemini.client;
    gemini.client = () => { upstream++; throw new Error('upstream must not be called'); };
    realFetch = globalThis.fetch;
    globalThis.fetch = (url, opts) => {
      if (String(url).includes('googleapis.com')) { upstream++; throw new Error('upstream must not be called'); }
      return realFetch(url, opts);
    };
    const { startServer } = await import('../server.js');
    server = await startServer(0);
    port = server.address().port;
  });

  after(async () => {
    gemini.client = realClient;
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const post = (p, body) => realFetch(`http://127.0.0.1:${port}/api/coach${p}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  test('чат: 429 BUDGET_EXHAUSTED чистым JSON, до заголовков SSE', async () => {
    const res = await post('', { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(res.status, 429);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    assert.equal((await res.json()).code, 'BUDGET_EXHAUSTED');
  });

  test('озвучка: 429 BUDGET_EXHAUSTED', async () => {
    const res = await post('/tts', { text: 'Жми!' });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).code, 'BUDGET_EXHAUSTED');
  });

  test('недельный отчёт: честный локальный фолбэк', async () => {
    const res = await post('/weekly-report', { workouts: [{ tonnage: 1000 }], lang: 'ru' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.degraded, true);
    assert.equal(body.report.score, 33);
  });

  test('биометрия и план: фолбэк, не 500', async () => {
    const bio = await (await post('/biometrics-scan', { workouts: [] })).json();
    assert.equal(bio.warning, 'BUDGET_EXHAUSTED');
    const plan = await (await post('/generate-plan', {})).json();
    assert.equal(plan.note, 'Default plan — AI unavailable');
  });

  test('ни один маршрут не дошёл до Google', () => {
    assert.equal(upstream, 0, 'при исчерпанном потолке модель всё-таки вызвана — деньги ушли');
  });

  test('BYOK проходит мимо исчерпанного потолка', async () => {
    const res = await post('/weekly-report', { workouts: [], customKey: KEY });
    assert.equal(res.status, 200);
    assert.ok(upstream >= 1, 'BYOK-запрос остановлен серверным потолком — платит ведь владелец ключа');
  });

  test('/api/ai-status показывает режим счётчика', async () => {
    const body = await (await realFetch(`http://127.0.0.1:${port}/api/ai-status`)).json();
    assert.equal(body.budget, 'memory');
  });
});
