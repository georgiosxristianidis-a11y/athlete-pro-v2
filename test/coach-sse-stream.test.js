// @ts-check
/**
 * Гард CORE-3 — в браузере есть стриминг.
 *
 * Опорный факт: `app.use(compression())` (server.js) копит `text/event-stream`
 * целиком, пока клиент шлёт `Accept-Encoding: gzip` (а любой браузер шлёт).
 * zlib отдаёт первый блок только после закрытия потока или заполнения 16 КБ,
 * поэтому ответ /api/coach приходил одним куском в конце генерации, а
 * heartbeat `: ping` сидел в том же буфере. `test/coach-sse.test.js` подменяет
 * `streamResponse` целиком и на это слеп; `coach-cancel.test.js` ходит без
 * Accept-Encoding — Node-клиент его не ставит.
 *
 * Стабится граница с провайдером (`gemini.client`), как в `coach-cancel.test.js`:
 * настоящие `streamResponse` и `res.write` в пути. Клиент — сырой `http` с
 * `Accept-Encoding: gzip`, чтобы время прихода считалось по кадру, а не по
 * телу целиком.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';

const { startServer } = await import('../server.js');
const gemini = (await import('../lib/geminiClient.js')).default;

let server, port;
const realClient = gemini.client;

before(async () => {
  server = await startServer(0);
  port = server.address().port;
});

after(() => {
  gemini.client = realClient;
  return new Promise((resolve) => server.close(resolve));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Фейковый Gemini-стрим: `count` чанков с паузой `stepMs` между ними. */
function stubGeminiStream({ stepMs, count }) {
  gemini.client = () => ({
    chats: {
      create: ({ config }) => ({
        async *sendMessageStream() {
          for (let i = 0; i < count; i++) {
            if (config.abortSignal.aborted) return;
            await sleep(stepMs);
            yield { text: `c${i} ` };
          }
        },
      }),
    },
  });
}

/**
 * POST /api/coach с gzip в Accept-Encoding; отдаёт заголовки и метки времени
 * прихода каждого ДЕКОДИРОВАННОГО куска тела от старта запроса. Считать сырые
 * куски нельзя: zlib отдаёт 10-байтовый gzip-заголовок на первой же записи,
 * и буферизованный ответ выглядел бы стримовым (ложный зелёный).
 */
function coachTimeline() {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ messages: [{ role: 'user', content: 'go' }], engine: 'gemini' });
    const started = Date.now();
    const req = http.request({
      host: '127.0.0.1', port, path: '/api/coach', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept-Encoding': 'gzip',
      },
    }, (res) => {
      const arrivals = [];
      const body = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
      body.on('data', () => arrivals.push(Date.now() - started));
      body.on('end', () => resolve({ headers: res.headers, arrivals, total: Date.now() - started }));
      body.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    setTimeout(() => reject(new Error('стрим не завершился за 5с')), 5000);
    req.end(payload);
  });
}

describe('POST /api/coach — кадры доезжают по мере генерации при Accept-Encoding: gzip (CORE-3)', () => {
  test('первый кадр приходит задолго до конца ответа, а не одним куском в конце', async () => {
    // 6 чанков по 150 мс: генерация ~900 мс. Буферизованный ответ даёт первый
    // кусок тела только к концу, стримовый — через ~150 мс.
    stubGeminiStream({ stepMs: 150, count: 6 });
    const { arrivals, total } = await coachTimeline();

    assert.ok(arrivals.length >= 2, `тело пришло ${arrivals.length} куском — это не стрим`);
    const first = arrivals[0];
    assert.ok(
      first < total - 500,
      `первый кусок на ${first} мс при конце на ${total} мс — ответ копится до конца генерации`
    );
  });

  test('event-stream не сжимается — иначе zlib снова накопит кадры', async () => {
    stubGeminiStream({ stepMs: 5, count: 2 });
    const { headers } = await coachTimeline();
    assert.equal(headers['content-type'], 'text/event-stream');
    assert.equal(headers['content-encoding'], undefined, 'event-stream ушёл сжатым');
  });
});

describe('сжатие остальных ответов не задето (CORE-3)', () => {
  test('крупный не-SSE ответ по-прежнему идёт gzip', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get({
        host: '127.0.0.1', port, path: '/index.html',
        headers: { 'Accept-Encoding': 'gzip' },
      }, (r) => { r.resume(); r.on('end', () => resolve(r)); }).on('error', reject);
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-encoding'], 'gzip', 'compression() перестал сжимать обычные ответы');
  });
});
