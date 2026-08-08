import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server.js';
import { classifyKeyCheck } from '../routes/integrations.js';

/* Гейт контракта /api/verify-key. Живой пинг провайдера тут не проверяется
   намеренно: он требует настоящего ключа и сети. Проверяется то, что ломается
   молча — схема входа и форма ответа (фронт читает ровно `ok` и `reason`). */

let server, baseUrl;

before(async () => {
  server = await startServer(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function post(body) {
  return fetch(`${baseUrl}/api/verify-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/verify-key — валидация', () => {
  test('пустое тело → 400', async () => {
    const res = await post({});
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  test('неизвестный движок → 400', async () => {
    const res = await post({ engine: 'openai', key: 'sk-ant-0123456789abcdef' });
    assert.equal(res.status, 400);
  });

  test('слишком короткий ключ → 400', async () => {
    const res = await post({ engine: 'anthropic', key: 'sk-a' });
    assert.equal(res.status, 400);
  });

  test('ключ длиннее лимита → 400 (не улетает в провайдера)', async () => {
    const res = await post({ engine: 'gemini', key: 'AIza' + 'x'.repeat(500) });
    assert.equal(res.status, 400);
  });
});

describe('classifyKeyCheck — код ответа не равен вердикту', () => {
  /* Живой баг: Gemini на мёртвый ключ отвечает 400 INVALID_ARGUMENT, а не 401.
     Маппинг по коду показывал «НЕТ СВЯЗИ» там, где связь есть, а ключ отклонён. */
  test('Gemini 400 API_KEY_INVALID → invalid_key', () => {
    const body = {
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
      },
    };
    assert.deepEqual(classifyKeyCheck(400, body), { ok: false, reason: 'invalid_key' });
  });

  test('Anthropic 401 authentication_error → invalid_key', () => {
    const body = { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } };
    assert.deepEqual(classifyKeyCheck(401, body), { ok: false, reason: 'invalid_key' });
  });

  test('Gemini 403 SERVICE_DISABLED → api_disabled (чинится не ключом)', () => {
    const body = {
      error: {
        code: 403,
        message: 'Generative Language API has not been used in project 123 before or it is disabled.',
        status: 'PERMISSION_DENIED',
        details: [{ reason: 'SERVICE_DISABLED' }],
      },
    };
    assert.deepEqual(classifyKeyCheck(403, body), { ok: false, reason: 'api_disabled' });
  });

  test('429 → коннект есть, лимит временный', () => {
    assert.deepEqual(classifyKeyCheck(429, null), { ok: true, reason: 'rate_limited' });
  });

  test('500 у провайдера → upstream_error, ключ не обвиняем', () => {
    assert.deepEqual(classifyKeyCheck(500, { error: { message: 'internal' } }), { ok: false, reason: 'upstream_error' });
  });

  test('пустое тело не роняет классификатор', () => {
    assert.equal(classifyKeyCheck(400, null).reason, 'upstream_error');
  });
});

describe('POST /api/verify-key — вердикт', () => {
  for (const engine of ['anthropic', 'gemini']) {
    test(`${engine}: заведомо мёртвый ключ → 200 с ok:false и причиной`, async () => {
      const key = engine === 'gemini' ? 'AIzaSy' + 'A'.repeat(33) : 'sk-ant-not-a-real-key-000000000000';
      const res = await post({ engine, key });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, false);
      // invalid_key при живой сети, offline-причины при её отсутствии — но
      // фронту в любом случае приходит строка, а не undefined.
      assert.equal(typeof body.reason, 'string');
    });
  }
});
