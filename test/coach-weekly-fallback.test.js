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
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server.js';
import { AIOrchestrator } from '../lib/aiOrchestrator.js';
import { keyLooksValid } from '../js/shared/ai-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Исходник без комментариев: иначе гард зеленеет на закомментированной строке. */
const code = (rel) =>
  readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

let server, baseUrl;
const realGenerateJSON = AIOrchestrator.generateJSON;

before(async () => {
  server = await startServer(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

// Stub must not leak: with a live key in .env, generateJSON would hit Gemini
// and the fallback asserts (degraded / local score) would fail or take ~17s.
afterEach(() => {
  AIOrchestrator.generateJSON = realGenerateJSON;
});

/** Force the weekly-report catch path without a network round-trip. */
function stubProviderFailure() {
  AIOrchestrator.generateJSON = async () => {
    const err = new Error('forced provider failure for fallback test');
    err.code = 'AI_TEST_STUB';
    throw err;
  };
}

const postWeekly = (body) =>
  fetch(`${baseUrl}/api/coach/weekly-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/weekly-report — отчёт вместо 500, когда ИИ недоступен', () => {
  test('падение модели отдаёт отчёт, а не пятисотку', async () => {
    stubProviderFailure();
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
    stubProviderFailure();
    const res = await postWeekly({ workouts: [{ type: 'push', tonnage: 1000 }], profile: {}, lang: 'en' });
    const body = await res.json();
    // Stub forces the catch path even when .env has a live provider key.
    assert.equal(body.degraded, true, 'запасной отчёт выдаёт себя за ответ модели');
    assert.match(body.report.summary, /coach is offline/i);
  });

  test('запасной отчёт на el — греческий, а не русский (I18N-EL)', async () => {
    stubProviderFailure();
    // Свой адрес: coachLimiter 10/мин с IP, квоту общего адреса блок уже выбрал.
    const res = await fetch(`${baseUrl}/api/coach/weekly-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.8.0.1' },
      body: JSON.stringify({ workouts: [{ type: 'push', tonnage: 1000 }], profile: {}, lang: 'el' }),
    });
    const body = await res.json();
    assert.equal(body.degraded, true);
    assert.match(body.report.summary, /εκτός σύνδεσης/);
    assert.doesNotMatch(body.report.summary, /[а-яё]/i, 'грек получил русский отчёт');
  });

  test('пустая неделя — нулевой счёт, а не выдуманный', async () => {
    stubProviderFailure();
    const res = await postWeekly({ workouts: [], profile: {}, lang: 'en' });
    const body = await res.json();
    assert.equal(body.report.score, 0);
    assert.deepEqual(body.report.cons, ['Zero sessions this week']);
  });

  test('счёт считается по своим же цифрам, а не берётся с потолка', async () => {
    stubProviderFailure();
    const three = await (
      await postWeekly({ workouts: [{ tonnage: 1 }, { tonnage: 1 }, { tonnage: 1 }] })
    ).json();
    const one = await (await postWeekly({ workouts: [{ tonnage: 1 }], lang: 'en' })).json();
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

/* CORE-1 (23.09): report из модели уезжал JSON.parse'ом прямо в ответ клиенту,
   а клиент кладёт report.summary/pros/cons в innerHTML без формы — pros/cons
   могли быть чем угодно, что провайдер решит вернуть. _parseWeeklyReport — та
   же схема, что уже защищает /biometrics-scan (_parseBiometricsReport).
   CORE-6: score из этой схемы убран вообще — модель его больше не присылает,
   отчёт считает его сам (см. describe выше), поэтому ниже он не проверяется. */
describe('/weekly-report — форма отчёта, а не доверие к JSON модели (CORE-1)', () => {
  function stubProviderReturns(json) {
    AIOrchestrator.generateJSON = async () => JSON.stringify(json);
  }

  test('score модели игнорируется — считается только локально (CORE-6)', async () => {
    stubProviderReturns({ score: 150, summary: 'ok', pros: [], cons: [] });
    const body = await (
      await postWeekly({ workouts: [{ tonnage: 1 }, { tonnage: 1 }, { tonnage: 1 }], profile: {} })
    ).json();
    assert.equal(body.report.score, 100, 'три тренировки — целевая частота PPL, число модели (150) не должно долететь');
  });

  test('score с разметкой в ответе модели не долетает до отчёта вообще', async () => {
    stubProviderReturns({ score: '100<img src=x onerror=alert(1)>', summary: 'ok', pros: [], cons: [] });
    const body = await (await postWeekly({ workouts: [], profile: {} })).json();
    assert.equal(body.report.score, 0, 'пустая история — локальный счёт 0, независимо от того, что вернула модель');
    assert.equal(typeof body.report.score, 'number');
  });

  test('summary режется до 500 символов, не-строка — пустая строка', async () => {
    stubProviderReturns({ score: 10, summary: 'x'.repeat(900), pros: [], cons: [] });
    const body = await (await postWeekly({ workouts: [], profile: {} })).json();
    assert.equal(body.report.summary.length, 500);
  });

  test('pros/cons: не-массив и не-строки внутри — отфильтрованы, не 500', async () => {
    stubProviderReturns({
      score: 10,
      summary: 'ok',
      pros: ['<script>alert(1)</script>', 123, null, 'fine'],
      cons: 'not-an-array',
    });
    const res = await postWeekly({ workouts: [], profile: {} });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.report.pros, ['<script>alert(1)</script>', 'fine']);
    assert.deepEqual(body.report.cons, []);
  });

  test('pros длиннее 10 элементов — обрезка, не безлимитный список в DOM', async () => {
    stubProviderReturns({
      score: 10,
      summary: 'ok',
      pros: Array.from({ length: 20 }, (_, i) => `p${i}`),
      cons: [],
    });
    const body = await (await postWeekly({ workouts: [], profile: {} })).json();
    assert.equal(body.report.pros.length, 10);
  });
});

/* Язык ответа = язык UI (решение Gio, CORE-6). Опорный факт: в промпте
   /weekly-report языка не было вовсе — живой вызов 25.09 отдал русскому UI
   английскую сводку; /biometrics-scan, наоборот, был прибит к русскому. */
describe('язык отчётов = язык UI, а не случайность модели (CORE-6)', () => {
  /** @type {string[]} */
  let systems = [];
  function captureSystem() {
    systems = [];
    AIOrchestrator.generateJSON = async ({ system }) => {
      systems.push(system);
      return JSON.stringify({ summary: 'ok', pros: [], cons: [], injuryRisk: 'Low' });
    };
  }
  // coachLimiter — 10/мин с IP, а файл выше уже тратит свою квоту. Свой адрес
  // на запрос (trust proxy = 1 читает X-Forwarded-For), лимит не ослабляем.
  let ip = 0;
  const postAs = (route) => (body) =>
    fetch(`${baseUrl}/api/coach/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${++ip}` },
      body: JSON.stringify(body),
    });
  const postW = postAs('weekly-report');
  const postBio = postAs('biometrics-scan');

  for (const [route, post] of [['/weekly-report', postW], ['/biometrics-scan', postBio]]) {
    test(`${route}: lang en → English, lang ru → Russian в промпте`, async () => {
      captureSystem();
      await post({ workouts: [], profile: {}, lang: 'en' });
      await post({ workouts: [], profile: {}, lang: 'ru' });
      assert.match(systems[0], /LANGUAGE:[^\n]*English/, 'английский UI не долетел до промпта');
      assert.doesNotMatch(systems[0], /Russian|по-русски/, 'английский UI, а промпт требует русский');
      assert.match(systems[1], /LANGUAGE:[^\n]*Russian/, 'русский UI не долетел до промпта');
    });

    test(`${route}: lang el → Greek в промпте (I18N-EL)`, async () => {
      captureSystem();
      await post({ workouts: [], profile: {}, lang: 'el' });
      assert.match(systems[0], /LANGUAGE:[^\n]*Greek/, 'греческий UI не долетел до промпта');
      assert.doesNotMatch(systems[0], /Russian/, 'греческий UI, а промпт требует русский');
    });

    test(`${route}: без lang — дефолт чата, русский`, async () => {
      captureSystem();
      await post({ workouts: [], profile: {} });
      assert.match(systems[0], /LANGUAGE:[^\n]*Russian/);
    });

    test(`${route}: чужой lang — 400, а не молчаливый дефолт`, async () => {
      captureSystem();
      const res = await post({ workouts: [], profile: {}, lang: 'de' });
      assert.equal(res.status, 400);
      assert.equal(systems.length, 0, 'невалидный запрос дошёл до модели');
    });
  }

  test('запасной отчёт на языке UI: русский по умолчанию', async () => {
    stubProviderFailure();
    const ru = await (await postW({ workouts: [{ tonnage: 1 }] })).json();
    assert.equal(ru.degraded, true);
    assert.match(ru.report.summary, /Коуч сейчас офлайн/);
    assert.deepEqual(ru.report.cons, ['Меньше трёх тренировок за неделю']);
    const empty = await (await postW({ workouts: [], lang: 'ru' })).json();
    assert.deepEqual(empty.report.cons, ['Ноль тренировок за неделю']);
  });

  test('клиент шлёт язык UI в оба маршрута', () => {
    const src = code('js/intel.store.js');
    assert.match(src, /import\s*\{[^}]*\bgetLang\b[^}]*\}\s*from\s*['"]\.\/locale\.store\.js['"]/);
    for (const route of ['/api/coach/weekly-report', '/api/coach/biometrics-scan']) {
      const call = src.split(`'${route}'`)[1]?.split("'ai'")[0] || '';
      assert.match(call, /\blang:\s*getLang\(\)/, `${route} уходит без языка UI`);
    }
  });
});
