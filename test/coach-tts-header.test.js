// @ts-check
/**
 * Гард CORE-2: ключ TTS уходит заголовком, не query-параметром.
 *
 * `?key=...` в URL оседает открытым текстом в логах прокси/сервера, истории
 * браузера при ручном дебаге, метриках APM — везде, где логируется путь
 * запроса. `/verify-key` (`routes/integrations.js`) уже делает это верно
 * (`x-goog-api-key`); `/tts` был единственным маршрутом, который тащил ключ в URL.
 *
 * `AIOrchestrator.generateJSON` здесь НЕ стабится — маршрут `/tts` зовёт
 * Gemini напрямую через `fetch`, поэтому перехватывается `globalThis.fetch`.
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server.js';

let server, baseUrl;
const realFetch = globalThis.fetch;

before(async () => {
  server = await startServer(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => { globalThis.fetch = realFetch; });

function postTts(body) {
  return fetch(`${baseUrl}/api/coach/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function stubGeminiTts() {
  let captured = null;
  // Сервер и тестовый клиент живут в одном процессе Node — оба зовут один и
  // тот же globalThis.fetch. Перехватываем только вызов к Gemini (внутри
  // маршрута), запрос теста к собственному серверу идёт настоящим fetch —
  // иначе Express вообще не увидит запрос.
  globalThis.fetch = async (url, init) => {
    const href = typeof url === 'string' ? url : url.url;
    if (!href.includes('generativelanguage.googleapis.com')) return realFetch(url, init);
    // `Headers` нормализует регистр и не отвечает на []-доступ — читаем через .get().
    captured = { url: href, headers: new Headers(init?.headers || {}) };
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: 'BASE64AUDIO' } }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };
  return () => captured;
}

describe('POST /api/coach/tts — ключ Gemini уходит заголовком (CORE-2)', () => {
  test('URL не содержит ?key=, заголовок x-goog-api-key несёт ключ', async () => {
    const getCaptured = stubGeminiTts();
    // customKey в форме валидного Gemini-ключа — не зависит от того, задан ли
    // GOOGLE_GENERATIVE_AI_API_KEY в окружении прогона.
    const res = await postTts({ text: 'тест', customKey: 'AIza' + 'x'.repeat(35) });
    assert.equal(res.status, 200);

    const captured = getCaptured();
    assert.ok(captured, 'до fetch дело не дошло — маршрут не отработал');
    assert.doesNotMatch(captured.url, /[?&]key=/, 'ключ снова уехал в query string');
    assert.equal(captured.headers.get('x-goog-api-key'), 'AIza' + 'x'.repeat(35));
  });
});
