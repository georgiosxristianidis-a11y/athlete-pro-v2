// @ts-check
/**
 * Гард CORE-2 — реальная отмена, не стаб оркестратора.
 *
 * Опорный факт: `req.on('close')` в `AIOrchestrator.streamResponse` не ловил
 * разрыв клиента — на Node 22 событие 'close' у REQUEST испускается, когда
 * тело запроса дочитано целиком (для JSON POST это происходит до входа в
 * хендлер, лимитер асинхронный), то есть к моменту подписки оно уже прошло.
 * Живой клиент, ушедший посреди генерации, никогда не долетал до контроллера
 * — апстрим догенерировал ответ полностью. Фикс — `res.on('close')`.
 *
 * Здесь НЕ стабится `AIOrchestrator.streamResponse` (как в `coach-sse.test.js`)
 * — тогда сам путь отмены остался бы непроверенным. Стабится уровень ниже:
 * `gemini.client(...)`, лежащий в границе с провайдером (тот же класс пробы,
 * что уже используют `coach-weekly-fallback.test.js` через `AIOrchestrator`).
 * Разрыв соединения — настоящий: `http.request(...).destroy()`, а не
 * AbortController на стороне теста, иначе проверялась бы отмена fetch, а не
 * `res.on('close')` сервера.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// COACH_STREAM_TIMEOUT_MS читается один раз при загрузке lib/aiOrchestrator.js —
// выставляем короткий идле-таймаут ДО импорта, чтобы гонять и его без 120с ожидания.
process.env.COACH_STREAM_TIMEOUT_MS = '250';

const { startServer } = await import('../server.js');
const gemini = (await import('../lib/geminiClient.js')).default;

let server, port;
const realClient = gemini.client;

before(async () => {
  server = await startServer(0);
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Фейковый Gemini-стрим: чанк каждые `stepMs`, уважает abortSignal (как настоящий SDK). */
function stubGeminiStream({ stepMs = 25, count = 400, hang = false } = {}) {
  let produced = 0;
  let capturedConfig = null;
  gemini.client = () => ({
    chats: {
      create: ({ config }) => {
        capturedConfig = config;
        const signal = config.abortSignal;
        return {
          async *sendMessageStream() {
            if (hang) {
              // Первый чанк уходит, дальше поток молчит — идле-таймаут обязан
              // поймать это САМ, а не ждать общего дедлайна на весь ответ.
              // Реальный SDK на abortSignal сам разрывает соединение и роняет
              // итератор — фейк обязан вести себя так же, иначе проверяется
              // "поток никогда не завершается", а не "идле-таймаут").
              produced++;
              yield { text: 'first ' };
              await new Promise((resolve) => {
                if (signal.aborted) return resolve();
                signal.addEventListener('abort', () => resolve(), { once: true });
              });
              return;
            }
            for (let i = 0; i < count; i++) {
              if (signal.aborted) return;
              await sleep(stepMs);
              if (signal.aborted) return;
              produced++;
              yield { text: `c${i} ` };
            }
          },
        };
      },
    },
  });
  return { getProduced: () => produced, getConfig: () => capturedConfig };
}

/** POST сырым http — даёт доступ к `.destroy()` сокета клиента. */
function postRaw(body) {
  const payload = JSON.stringify(body);
  const req = http.request(
    { host: '127.0.0.1', port, path: '/api/coach', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }
  );
  req.write(payload);
  req.end();
  return req;
}

describe('POST /api/coach — разрыв клиента останавливает апстрим (CORE-2)', () => {
  test('после req.destroy() генератор перестаёт производить чанки', async () => {
    const { getProduced } = stubGeminiStream({ stepMs: 25 });
    const req = postRaw({ messages: [{ role: 'user', content: 'go' }], engine: 'gemini' });

    await new Promise((resolve, reject) => {
      req.on('response', (res) => {
        res.on('data', () => {
          if (getProduced() >= 2) resolve();
        });
        res.on('error', () => {});
      });
      req.on('error', () => {}); // destroy() на живом сокете сам кидает ECONNRESET — не считается провалом теста
      setTimeout(() => reject(new Error('не дождались первых чанков')), 2000);
    });

    const atDestroy = getProduced();
    req.destroy();

    await sleep(400); // 16 шагов по 25мс, если отмена не сработала

    const after400ms = getProduced();
    assert.ok(
      after400ms <= atDestroy + 1,
      `генератор произвёл ${after400ms - atDestroy} чанков ПОСЛЕ разрыва — апстрим не остановился`
    );
    gemini.client = realClient;
  });

  test('maxOutputTokens доезжает до Gemini (CORE-2: потолка не было вовсе)', async () => {
    const { getConfig } = stubGeminiStream({ stepMs: 5, count: 3 });
    const req = postRaw({ messages: [{ role: 'user', content: 'go' }], engine: 'gemini' });
    await new Promise((resolve) => {
      req.on('response', (res) => { res.on('data', () => {}); res.on('end', resolve); });
    });
    const config = getConfig();
    assert.ok(config, 'chats.create не позвали — фейк не сработал');
    assert.equal(typeof config.maxOutputTokens, 'number');
    assert.ok(config.maxOutputTokens > 0);
    gemini.client = realClient;
  });

  // CORE-7: без thinkingConfig модели Gemini 3 думают на дефолтном (высоком)
  // уровне — время до первого токена уходит на скрытые рассуждения. Рычаг у
  // Gemini 3 — thinkingLevel; thinkingBudget с ним не смешиваем.
  test('thinkingConfig с низким уровнем доезжает до Gemini (CORE-7)', async () => {
    const { getConfig } = stubGeminiStream({ stepMs: 5, count: 3 });
    const req = postRaw({ messages: [{ role: 'user', content: 'go' }], engine: 'gemini' });
    await new Promise((resolve) => {
      req.on('response', (res) => { res.on('data', () => {}); res.on('end', resolve); });
    });
    const config = getConfig();
    assert.ok(config, 'chats.create не позвали — фейк не сработал');
    assert.ok(config.thinkingConfig, 'thinkingConfig не передан — модель думает на дефолтном уровне');
    assert.ok(
      ['LOW', 'MINIMAL'].includes(config.thinkingConfig.thinkingLevel),
      `thinkingLevel = ${config.thinkingConfig.thinkingLevel}, ожидался LOW или MINIMAL`
    );
    assert.equal(config.thinkingConfig.thinkingBudget, undefined, 'thinkingBudget не смешивать с thinkingLevel');
    gemini.client = realClient;
  });

  test('системный промпт коуча не просит <thinking> (CORE-7)', async () => {
    const { getConfig } = stubGeminiStream({ stepMs: 5, count: 3 });
    const req = postRaw({ messages: [{ role: 'user', content: 'go' }], engine: 'gemini' });
    await new Promise((resolve) => {
      req.on('response', (res) => { res.on('data', () => {}); res.on('end', resolve); });
    });
    const system = getConfig()?.systemInstruction?.parts?.[0]?.text;
    assert.equal(typeof system, 'string', 'systemInstruction не дошёл до chats.create');
    assert.doesNotMatch(system, /<thinking>/i, 'промпт просит модель рассуждать вслух в <thinking>');
    assert.doesNotMatch(system, /#gym/i, 'в промпте остался макрос #gym');
    gemini.client = realClient;
  });
});

describe('routes/coach.js — в исходнике промпта нет инструкций на <thinking> (CORE-7)', () => {
  test('ни одной строки кода с <thinking>/#gym вне комментариев', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../routes/coach.js', import.meta.url), 'utf8');
    // Комментарии вырезаются с якорем на начало строки: шаблон вида "image/*"
    // внутри строки иначе открыл бы блочный комментарий и съел кусок файла.
    const code = src
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /<thinking>/i, 'routes/coach.js всё ещё просит <thinking>');
    assert.doesNotMatch(code, /#gym/i, 'routes/coach.js всё ещё содержит #gym');
  });
});

describe('POST /api/coach — идле-таймаут ловит зависший поток целиком, не только первый байт (CORE-2)', () => {
  test('чанк пришёл, дальше поток молчит — SSE обрывается ошибкой в пределах idle-таймаута, не 120с', async () => {
    stubGeminiStream({ hang: true });
    const started = Date.now();

    const text = await new Promise((resolve, reject) => {
      const req = postRaw({ messages: [{ role: 'user', content: 'go' }], engine: 'gemini' });
      req.on('response', (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      setTimeout(() => reject(new Error('idle-таймаут не сработал за разумное время')), 5000);
    });

    const elapsed = Date.now() - started;
    assert.ok(elapsed < 2000, `SSE висел ${elapsed}мс — идле-таймаут (250мс) не поймал зависший поток`);
    assert.match(text, /"code":"AI_TIMEOUT"/, 'ожидался SSE-кадр с ошибкой AI_TIMEOUT');
    gemini.client = realClient;
  });
});

/** Зависший (не отвечающий без abort) фейк generateContent — реальный SDK на abortSignal рвёт запрос сам. */
function stubHangingGenerateContent() {
  let aborted = false;
  gemini.client = () => ({
    models: {
      generateContent: ({ config }) =>
        new Promise((_resolve, reject) => {
          const onAbort = () => {
            aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          };
          if (config.abortSignal.aborted) return onAbort();
          config.abortSignal.addEventListener('abort', onAbort, { once: true });
        }),
    },
  });
  return () => aborted;
}

describe('generateJSON — таймаут и отмена (CORE-2: не было ни того, ни другого)', () => {
  test('/generate-plan: зависший ответ модели обрывается по таймауту, а не висит', async () => {
    stubHangingGenerateContent();
    const started = Date.now();

    const res = await fetch(`http://127.0.0.1:${port}/api/coach/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'gemini' }),
    });

    const elapsed = Date.now() - started;
    // Нижняя граница отсекает ложный зелёный: без фикса generateJSON не
    // передаёт config в generateContent вовсе, фейк падает на config.abortSignal
    // мгновенно — фолбэк срабатывает за <10мс по СОВСЕМ другой причине.
    assert.ok(elapsed >= 200, `ответ пришёл за ${elapsed}мс — это не таймаут (250мс), а что-то другое упало раньше`);
    assert.ok(elapsed < 2000, `запрос висел ${elapsed}мс — таймаут generateJSON не сработал`);
    assert.equal(res.status, 200, 'маршрут деградирует на дефолтный план, а не падает 500');
    const body = await res.json();
    assert.equal(body.note, 'Default plan — AI unavailable');
    gemini.client = realClient;
  });

  test('разрыв клиента посреди /generate-plan доезжает до generateJSON через res.on(close)', async () => {
    const getAborted = stubHangingGenerateContent();

    const req = http.request({
      host: '127.0.0.1', port, path: '/api/coach/generate-plan', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    req.end(JSON.stringify({ engine: 'gemini' }));
    req.on('error', () => {}); // destroy() кидает ECONNRESET на клиенте — ожидаемо

    await sleep(80);
    req.destroy();
    await sleep(300);

    assert.equal(getAborted(), true, 'клиент отвалился, но generateJSON не узнал — сгенерирует впустую');
    gemini.client = realClient;
  });
});

/* CORE-2: engine: z.string() на 5 схемах пускал что угодно. coachSchema
   проверена юнит-тестом (test/coach-validate.test.js — экспортирован),
   остальные четыре схемы приватные — проверка идёт через реальный HTTP,
   валидация всё равно отрабатывает раньше AIOrchestrator. */
describe('engine ограничен списком провайдеров на всех AI-маршрутах (CORE-2)', () => {
  const post = (path, body) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const cases = [
    ['/api/coach/generate-plan', {}],
    ['/api/coach/recommendations', { workout: {}, nextSessionPlan: [{ name: 'Squat' }] }],
    ['/api/coach/weekly-report', { workouts: [] }],
    ['/api/coach/biometrics-scan', { workouts: [] }],
  ];

  for (const [path, base] of cases) {
    test(`${path}: engine: 'openai' — 400, не тихая нормализация в gemini`, async () => {
      const res = await post(path, { ...base, engine: 'openai' });
      assert.equal(res.status, 400, `${path} принял неизвестный engine`);
    });

    test(`${path}: engine: 'gemini'/'anthropic' — проходят схему`, async () => {
      const res = await post(path, { ...base, engine: 'gemini' });
      assert.notEqual(res.status, 400, `${path} отверг валидный engine 'gemini'`);
    });
  }
});

describe('GET /api/ai-status — режим лимитера виден снаружи (CORE-2)', () => {
  test('поле limiter присутствует и равно memory без KV/Upstash в окружении', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/ai-status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.limiter, 'memory', 'без переменных окружения режим обязан быть виден как memory, не молчать');
  });
});
