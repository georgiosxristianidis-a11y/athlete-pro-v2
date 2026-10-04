// @ts-check
/**
 * CORE-9: контракт ответа модели держат гарды, а не ревью.
 *
 * Контракт ядра после CORE-6/CORE-7 звучит так: снимок движков → текст. Числа на
 * экране считают локальные движки, модель их объясняет прозой, язык ответа = язык
 * UI. Код за этот контракт отвечает в четырёх местах, и каждое сторожится здесь:
 * промпт чата, маршрут `/api/coach`, отчёты (`/weekly-report`, `/biometrics-scan`)
 * и клиент. Слушается ли сама модель — вопрос живого прогона: этим занимается
 * `scripts/coach-eval.mjs`, ручной и вне CI. Последний блок файла держит его сухим
 * по умолчанию и не пускает в автоматику.
 *
 * Сети здесь нет нигде: оркестратор подменён, eval зовётся с заблокированными
 * `fetch` и `listen`. Живой ключ в `.env` на результат не влияет (урок
 * `reference-test-green-in-ci-red-with-live-api-key`).
 *
 * Регекс-проверки исходника режут комментарии (урок
 * `reference-guard-regex-must-strip-comments`). Блочный комментарий срезается,
 * только если перед `/*` стоит пробел или знак: `accept="image/*"` в строке
 * `intel.view.js` иначе открыл бы комментарий и съел сотню строк кода.
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server.js';
import { AIOrchestrator } from '../lib/aiOrchestrator.js';
import { coachSchema, _buildSystemPrompt } from '../routes/coach.js';
import { buildSnapshot } from '../js/shared/coach-snapshot.js';
import { readiness } from '../js/intel.engine.js';
import {
  main as evalMain, CASES, requestFor, checkLanguage, checkFormat, checkNumbers,
} from '../scripts/coach-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** @param {string} src */
const stripJs = (src) =>
  src
    .replace(/(^|[\s(=,;])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[\s;,(){}])\/\/.*$/gm, '$1');
/** @param {string} src */
const stripHash = (src) => src.replace(/(^|\s)#.*$/gm, '$1');
/** Код файла без комментариев. @param {string} rel */
const code = (rel) => stripJs(read(rel));

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
const H = 3600000;

/** Четыре недели PPL, три сессии в неделю: у движка есть и ACWR, и тренд. */
const HISTORY = Array.from({ length: 12 }, (_, i) => {
  const hoursAgo = 20 + Math.floor(i / 3) * 168 + (i % 3) * 48;
  const weight = 100 - Math.floor(i / 3) * 2.5;
  return {
    timestamp: NOW - hoursAgo * H,
    type: ['push', 'legs', 'pull'][i % 3],
    tonnage: weight * 5 * 3,
    duration: 45 * 60000,
    exercises: [{ name: 'Bench Press', sets: [1, 2, 3].map(() => ({ weight, reps: 5, done: true })) }],
  };
});

/** @param {'ru'|'en'} lang */
const snap = (lang) =>
  buildSnapshot({ workouts: HISTORY, fatigue: { chest: 0.5 }, profile: { goal: 'strength' }, lang, door: 'intel', now: NOW });

/** Строка правила LANGUAGE из промпта. @param {string} prompt */
const languageRule = (prompt) => prompt.split('\n').find((l) => /^\d+\. LANGUAGE:/.test(l)) || '';

describe('промпт чата: снимок → текст (CORE-6)', () => {
  test('язык ответа берётся из снимка (язык UI), а не из вопроса', () => {
    const en = _buildSystemPrompt(snap('en'), 50);
    const ru = _buildSystemPrompt(snap('ru'), 50);
    assert.match(languageRule(en), /Respond in English\b/, 'английский UI не долетел до правила языка');
    assert.doesNotMatch(en, /Russian/, 'английский UI, а промпт где-то требует русский');
    assert.match(languageRule(ru), /Respond in Russian\b/, 'русский UI не долетел до правила языка');
    assert.doesNotMatch(languageRule(ru), /English/);
    assert.match(languageRule(en), /not the language the user typed in/, 'правило обязано перебивать язык вопроса');
    // Клиент старее CORE-4 шлёт запрос без снимка: прежний дефолт чата — русский.
    assert.match(languageRule(_buildSystemPrompt(undefined, 50)), /Respond in Russian\b/);
  });

  test('модель получает числа движка готовыми и не просит их считать или слать JSON', () => {
    const r = readiness(HISTORY, { now: NOW });
    assert.equal(typeof r.index, 'number', 'фикстура обязана давать индекс, иначе проверка числа пустая');
    for (const prompt of [_buildSystemPrompt(snap('ru'), 50), _buildSystemPrompt(undefined, 50)]) {
      for (const [bait, why] of /** @type {Array<[RegExp, string]>} */ ([
        [/_widget/, 'контракт _widget снят в CORE-6'],
        [/#gym/, 'макрос #gym снят в CORE-6'],
        [/WORKOUT_CARD/, 'промпт зовёт карточку тренировки JSON-ом'],
        [/Return ONLY (raw )?JSON/i, 'чат отвечает текстом, JSON — только у отчётов'],
        [/```json/i, 'промпт показывает модели JSON-блок'],
      ])) {
        assert.doesNotMatch(prompt, bait, why);
      }
      const format = prompt.slice(prompt.indexOf('[OUTPUT FORMAT]'));
      assert.match(format, /FORBIDDEN:[\s\S]*raw JSON/, 'формат перестал запрещать JSON');
      assert.match(format, /never emit a JSON widget/);
    }
    const p = _buildSystemPrompt(snap('ru'), 50);
    assert.match(p, /Never invent or recalculate a number yourself/, 'промпт снова разрешает модели считать самой');
    assert.ok(p.includes(`"index":${r.index}`), 'в промпт ушла не та готовность, что посчитал движок');
    assert.ok(p.includes(`"cns":${r.cns}`), 'в промпт ушла не та ЦНС, что посчитал движок');
  });
});

describe('маршруты: числа считает сервер, модель отвечает прозой', () => {
  /** @type {import('node:http').Server} */
  let server;
  let baseUrl = '';
  const realStream = AIOrchestrator.streamResponse;
  const realJSON = AIOrchestrator.generateJSON;

  before(async () => {
    server = await startServer(0);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  after(() => new Promise((resolve) => server.close(() => resolve(undefined))));
  afterEach(() => {
    AIOrchestrator.streamResponse = realStream;
    AIOrchestrator.generateJSON = realJSON;
  });

  // coachLimiter — 10/мин на IP: свой адрес на запрос (trust proxy = 1), лимит не ослабляем.
  let ip = 0;
  /** @param {string} route @param {object} body */
  const post = (route, body) =>
    fetch(`${baseUrl}/api/coach${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.19.0.${++ip}` },
      body: JSON.stringify(body),
    });

  test('/api/coach: язык снимка решает язык промпта на живом маршруте', async () => {
    /** @type {string[]} */
    const systems = [];
    AIOrchestrator.streamResponse = /** @type {any} */ (async ({ system, onChunk }) => {
      systems.push(system);
      onChunk('ok');
    });
    const en = await post('', { messages: [{ role: 'user', content: 'Как дела?' }], snapshot: snap('en') });
    assert.match(await en.text(), /data: \{"text":"ok"\}/, 'стаб модели не вызван — проверка ничего не мерит');
    await (await post('', { messages: [{ role: 'user', content: 'How are you?' }], snapshot: snap('ru') })).text();
    assert.equal(systems.length, 2);
    assert.match(languageRule(systems[0]), /Respond in English\b/, 'маршрут потерял снимок по дороге в промпт');
    assert.match(languageRule(systems[1]), /Respond in Russian\b/);
    assert.ok(systems[0].includes('"door":"intel"'), 'снимок не доехал до промпта');
  });

  test('промпты отчётов просят у модели только текстовые поля', async () => {
    /** @type {string[]} */
    const systems = [];
    AIOrchestrator.generateJSON = /** @type {any} */ (async ({ system }) => {
      systems.push(system);
      return JSON.stringify({ summary: 'ok', pros: [], cons: [], injuryRisk: 'Low' });
    });
    await post('/weekly-report', { workouts: [], profile: {}, lang: 'en' });
    await post('/biometrics-scan', { workouts: [], profile: {}, lang: 'en' });
    const keys = (/** @type {string} */ s) => [...s.matchAll(/"(\w+)"\s*:/g)].map((m) => m[1]).sort();
    assert.deepEqual(keys(systems[0]), ['cons', 'pros', 'summary'], '/weekly-report снова просит у модели число');
    assert.deepEqual(keys(systems[1]), ['injuryRisk', 'summary'], '/biometrics-scan снова просит у модели число');
  });

  test('числовые поля из ответа модели не доезжают до клиента', async () => {
    AIOrchestrator.generateJSON = /** @type {any} */ (async () =>
      JSON.stringify({
        summary: 's', pros: ['p'], cons: ['c'], injuryRisk: 'High',
        score: 99, cnsFatigue: 97, muscleDamage: { chest: 88 }, readiness: { index: 12 },
      }));
    const weekly = await (await post('/weekly-report', { workouts: [], profile: {} })).json();
    assert.deepEqual(Object.keys(weekly.report).sort(), ['cons', 'pros', 'score', 'summary']);
    assert.equal(weekly.report.score, 0, 'пустая неделя — локальный 0, не 99 модели');
    const bio = await (await post('/biometrics-scan', { workouts: [], profile: {} })).json();
    assert.deepEqual(Object.keys(bio.report).sort(), ['injuryRisk', 'summary'],
      'cnsFatigue/muscleDamage/readiness модели снова уходят клиенту');
  });
});

describe('клиент: числа на экране — только из локальных движков', () => {
  test('язык UI уходит в снимок из getLang()', () => {
    const src = code('js/coach-snapshot.store.js');
    assert.match(src, /import\s*\{[^}]*\bgetLang\b[^}]*\}\s*from\s*['"]\.\/locale\.store\.js['"]/);
    assert.match(src, /buildSnapshot\(\{[^}]*\blang:\s*getLang\(\)/, 'снимок собирается без языка UI');
  });

  test('биометрический отчёт берёт от модели только summary, и тот через esc()', () => {
    const view = code('js/intel.view.js');
    const start = view.indexOf('function _buildBiometricReport');
    const end = view.indexOf('function _renderLocalInsights');
    assert.ok(start !== -1 && end > start, 'якорь _buildBiometricReport пропал');
    const fn = view.slice(start, end);
    const body = fn.slice(fn.indexOf('{'));
    const uses = body.match(/\btext\b/g) || [];
    const safe = body.match(/esc\(text\?\.summary\b/g) || [];
    assert.ok(safe.length > 0, 'summary модели пропал из отчёта или идёт мимо esc()');
    assert.equal(uses.length, safe.length, 'отчёт читает из ответа модели что-то кроме summary');
    assert.match(body, /const cns = [^;]*readinessData\?\.cns/, 'ЦНС обязана идти из fetchReadiness()');

    const store = code('js/intel.store.js');
    const scan = store.slice(
      store.indexOf('export async function fetchBiometricsScan'),
      store.indexOf('export async function savePlannedWorkout')
    );
    const ret = scan.match(/return\s*\{([^}]*)\}\s*;?\s*\}\s*$/);
    assert.ok(ret, 'fetchBiometricsScan больше не возвращает объект-литерал');
    assert.doesNotMatch(ret[1], /\.\.\./, 'стор отдаёт экрану ответ модели целиком');
    assert.deepEqual([...ret[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]), ['summary', 'injuryRisk']);
  });

  test('view не разбирает JSON: ответ модели попадает на экран только через formatAirMarkdown', () => {
    assert.doesNotMatch(code('js/intel.view.js'), /JSON\.parse\(/,
      'JSON.parse во view — вход для чисел из ответа модели мимо движков (контракт CORE-6)');
  });
});

describe('scripts/coach-eval.mjs: ручной, сухой по умолчанию, вне автоматики', () => {
  /**
   * Зовёт main() eval с заблокированной сетью: любой fetch или listen — ошибка.
   * @param {string[]} argv @param {Record<string, string>} env
   */
  async function offline(argv, env) {
    /** @type {string[]} */
    const lines = [];
    let fetches = 0;
    let listens = 0;
    const realFetch = globalThis.fetch;
    const realListen = http.Server.prototype.listen;
    globalThis.fetch = async () => {
      fetches++;
      throw new Error('eval полез в сеть');
    };
    http.Server.prototype.listen = /** @type {any} */ (function () {
      listens++;
      throw new Error('eval поднял сервер');
    });
    try {
      const exit = await evalMain({ argv, env, print: (s) => lines.push(s) });
      return { exit, out: lines.join('\n'), fetches, listens };
    } catch (err) {
      return { exit: -1, out: String(err), fetches, listens };
    } finally {
      globalThis.fetch = realFetch;
      http.Server.prototype.listen = realListen;
    }
  }

  test('без --live — сухой прогон даже с ключом в env: ни сети, ни сервера', async () => {
    const env = { GOOGLE_GENERATIVE_AI_API_KEY: 'dry-run-must-not-use-it', ANTHROPIC_API_KEY: 'dry-run-must-not-use-it' };
    const r = await offline([], env);
    assert.equal(r.fetches + r.listens, 0, `сухой прогон ушёл в сеть: ${r.out}`);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /сухой прогон/);
    for (const c of CASES) assert.ok(r.out.includes(c.id), `кейс ${c.id} не напечатан`);
    assert.match(r.out, /критерий:/, 'сухой прогон обязан печатать критерии');
  });

  test('--live без ключа в env — код 2 до подъёма сервера', async () => {
    const r = await offline(['--live'], {});
    assert.equal(r.fetches + r.listens, 0, `--live без ключа ушёл в сеть: ${r.out}`);
    assert.equal(r.exit, 2, r.out);
    assert.match(r.out, /GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  test('eval не прописан ни в npm-скриптах, ни в CI, ни в хуках, ни в других скриптах', () => {
    const SELF = new Set(['scripts/coach-eval.mjs', 'test/coach-contract.test.js']);
    /** @param {string} rel @returns {string[]} */
    const walk = (rel) => {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) return [];
      if (fs.statSync(abs).isFile()) return [rel];
      return fs.readdirSync(abs).flatMap((name) =>
        name === 'node_modules' || name === 'report' ? [] : walk(`${rel}/${name}`));
    };
    const files = ['package.json', 'vercel.json', 'playwright.config.js', '.github', '.githooks', 'scripts', 'test']
      .flatMap(walk)
      .filter((f) => !SELF.has(f) && !/\.(md|png|jpe?g|webm|zip)$/i.test(f));
    assert.ok(files.includes('package.json') && files.some((f) => f.startsWith('.github/workflows/')),
      'обход не видит package.json или CI — гард пустой');
    const hits = files.filter((f) => {
      const src = read(f);
      const clean = /\.[cm]?js$/.test(f) ? stripJs(src) : f.endsWith('.json') ? src : stripHash(src);
      return /coach-eval/.test(clean);
    });
    assert.deepEqual(hits, [], 'живой eval стоит денег и квоты: звать только руками, `node scripts/coach-eval.mjs`');
  });

  test('кейсы eval проходят схему маршрута, судьи ловят каждый класс нарушения', () => {
    const now = Date.now();
    for (const c of CASES.filter((x) => x.route === 'chat')) {
      assert.ok(coachSchema.safeParse(requestFor(c, now, 'gemini').body).success,
        `${c.id}: тело не проходит coachSchema — живой прогон получит 400 вместо ответа модели`);
    }
    const level = (/** @type {Array<{level: string}>} */ v) => v.map((x) => x.level);
    assert.deepEqual(level(checkLanguage('en', 'Привет, нужен план?')), ['FAIL']);
    assert.deepEqual(level(checkLanguage('ru', 'Восстановление в норме, Bench Press можно грузить.')), ['PASS']);
    for (const bad of ['{"readiness": 99}', '| a | b |\n|---|---|', '```\nx\n```', '[WORKOUT_CARD]{}[/WORKOUT_CARD]']) {
      assert.ok(level(checkFormat(bad)).includes('FAIL'), `формат пропустил ${bad}`);
    }
    assert.deepEqual(level(checkFormat('## Итог\n- раз\n**жирный**')), ['PASS']);

    const full = requestFor(CASES[0], now, 'gemini').snapshot;
    const empty = requestFor(/** @type {any} */ (CASES.find((c) => c.noData && !c.noSnapshot)), now, 'gemini').snapshot;
    assert.equal(typeof full.readiness.index, 'number');
    assert.deepEqual(level(checkNumbers(full, `Readiness ${full.readiness.index}/100, CNS ${full.cns}%.`)), ['PASS']);
    assert.ok(level(checkNumbers(full, `Readiness ${full.readiness.index - 30}%.`)).includes('FAIL'));
    assert.ok(level(checkNumbers(empty, 'Готовность 70 из 100.')).includes('FAIL'), 'выдуманная готовность без данных');
    assert.ok(level(checkNumbers(undefined, 'CNS fatigue is 40%.')).includes('FAIL'), 'выдуманная ЦНС без снимка');
  });
});
