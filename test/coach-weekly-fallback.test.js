// @ts-check
/**
 * Гард: недельный отчёт переживает падение ИИ, а недописанный BYOK до
 * провайдера не доезжает.
 *
 * Опорный факт, ради которого заведён: вызов `AIOrchestrator.generateJSON`
 * в маршруте `/weekly-report` стоял ВНЕ try — try ловил только разбор JSON.
 * Любое падение модели (сеть, 400 API_KEY_INVALID, лимит провайдера) уходило
 * через asyncHandler в 500, и пользователь получал пустой экран вместо
 * отчёта, хотя счёт и сводку по своим же цифрам можно отдать без модели.
 *
 * Вторая половина: сервер предпочитает `customKey` ключу окружения, поэтому
 * половина строки в поле настроек превращала рабочий запрос в отказ
 * провайдера. Гейт на форму ключа обязан стоять с обеих сторон — клиент
 * отсекает в `aiAuth()`, но в маршруты ходят и мимо интерфейса.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server.js';
import { keyLooksValid } from '../js/shared/ai-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Исходник без комментариев: иначе гард зеленеет на закомментированной строке. */
const code = (rel) =>
  readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

let server, baseUrl;

before(async () => {
  server = await startServer(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const postWeekly = (body) =>
  fetch(`${baseUrl}/api/coach/weekly-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/weekly-report — отчёт вместо 500, когда ИИ недоступен', () => {
  test('падение модели отдаёт отчёт, а не пятисотку', async () => {
    const res = await postWeekly({
      workouts: [
        { type: 'push', tonnage: 5200, timestamp: Date.now() },
        { type: 'pull', tonnage: 4800, timestamp: Date.now() },
      ],
      profile: {},
    });
    assert.equal(res.status, 200, 'падение ИИ снова уходит в 500');
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.report, 'отчёта нет — пользователь увидит пустой экран');
    assert.equal(typeof body.report.score, 'number');
    assert.equal(typeof body.report.summary, 'string');
    assert.ok(Array.isArray(body.report.pros));
    assert.ok(Array.isArray(body.report.cons));
  });

  test('запасной отчёт честно помечен degraded', async () => {
    const res = await postWeekly({ workouts: [{ type: 'push', tonnage: 1000 }], profile: {} });
    const body = await res.json();
    // В тестовой среде ключа провайдера нет, значит путь всегда запасной.
    assert.equal(body.degraded, true, 'запасной отчёт выдаёт себя за ответ модели');
    assert.match(body.report.summary, /coach is offline/i);
  });

  test('пустая неделя — нулевой счёт, а не выдуманный', async () => {
    const res = await postWeekly({ workouts: [], profile: {} });
    const body = await res.json();
    assert.equal(body.report.score, 0);
    assert.deepEqual(body.report.cons, ['Zero sessions this week']);
  });

  test('счёт считается по своим же цифрам, а не берётся с потолка', async () => {
    const three = await (
      await postWeekly({ workouts: [{ tonnage: 1 }, { tonnage: 1 }, { tonnage: 1 }] })
    ).json();
    const one = await (await postWeekly({ workouts: [{ tonnage: 1 }] })).json();
    assert.equal(three.report.score, 100, 'три тренировки — целевая частота PPL');
    assert.ok(one.report.score < three.report.score);
    assert.deepEqual(one.report.cons, ['Below three sessions this week']);
  });
});

describe('форма BYOK — гейт с обеих сторон', () => {
  test('keyLooksValid отличает ключ от огрызка', () => {
    assert.equal(keyLooksValid('gemini', 'AIza' + 'x'.repeat(35)), true);
    assert.equal(keyLooksValid('gemini', 'AIzaKEY'), false, 'короткий огрызок принят');
    assert.equal(keyLooksValid('gemini', 'sk-ant-' + 'x'.repeat(35)), false, 'чужой префикс');
    assert.equal(keyLooksValid('anthropic', 'sk-ant-' + 'x'.repeat(35)), true);
    assert.equal(keyLooksValid('gemini', ''), false);
    assert.equal(keyLooksValid('gemini', undefined), false);
  });

  test('каждый маршрут с customKey пропускает его через _safeCustomKey', () => {
    const src = code('routes/coach.js');
    const raw = [...src.matchAll(/customKey/g)].length;
    const gated = [...src.matchAll(/_safeCustomKey\(/g)].length;
    assert.ok(gated >= 4, `_safeCustomKey зовётся ${gated} раз — маршрут остался без гейта`);
    assert.ok(raw > 0);
    assert.doesNotMatch(
      src,
      /apiKey = customKey \|\|/,
      'TTS снова берёт customKey без проверки формы'
    );
  });

  test('клиент не отправляет недописанный ключ', () => {
    const src = code('js/ai-settings.store.js');
    assert.match(
      src,
      /keyLooksValid\(engine, val\) \? val : undefined/,
      'aiAuth снова шлёт на сервер всё, что лежит в поле'
    );
  });

  test('серверный маршрут не тащит в свой граф браузерный фасад БД', () => {
    const src = code('routes/coach.js');
    assert.doesNotMatch(
      src,
      /from '\.\.\/js\/ai-settings\.store\.js'/,
      'ai-settings.store.js импортирует ./db.js и за ним восемь store-модулей IndexedDB'
    );
    for (const spec of [...src.matchAll(/from '(\.\.\/js\/[^']+)'/g)].map((m) => m[1])) {
      assert.match(
        spec,
        /^\.\.\/js\/shared\//,
        `сервер импортирует ${spec} — из js/ ему положен только js/shared/`
      );
    }
  });
});
