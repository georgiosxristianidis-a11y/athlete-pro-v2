// @ts-check
/**
 * CORE-5 — один клиент коуча на все двери.
 *
 * До карточки рядом с `streamCoachReply` (экран Core) жил второй клиент,
 * `fetchCoach` в `claude.store.js`, со своим разбором SSE и своей историей
 * без потолка. Чат тренировки слал вопрос дважды (в истории и последним
 * сообщением), рисовал только последний чанк, а после ~19 обменов тело
 * переваливало за `COACH_MAX_MESSAGES` и сервер отвечал 400. «Спросить
 * коуча» из недельной сводки звал его без контекста и всегда падал тостом.
 *
 * Поведенческая часть гоняет настоящий клиент против заглушки fetch и
 * проверяет каждое тело настоящей схемой сервера `coachSchema`.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Вне airgap запись в базу дёргает очередь синка — она живёт в localStorage.
const _ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
});
// `window` без `document` — только шина событий сторов.
globalThis.window = /** @type {any} */ ({
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

const { setPrivacyMode, setAiEnabled } = await import('../js/privacy.store.js');
const { streamCoachReply, COACH_MEMORY_EXCHANGES, COACH_MAX_CONTENT_LEN } = await import(
  '../js/intel.store.js'
);
const { coachSchema } = await import('../routes/coach.js');

/** @type {any[]} тела запросов к /api/coach по порядку */
const bodies = [];
/** @type {(n: number) => string} */
let reply = (n) => `answer ${n}`;
let status = 200;

globalThis.fetch = /** @type {any} */ (
  async (/** @type {string} */ url, /** @type {any} */ opts) => {
    // Счётчик установок и прочий фон — мимо: считаем только коуча.
    if (url !== '/api/coach') return new Response('{}', { status: 200 });
    const body = JSON.parse(String(opts.body));
    bodies.push(body);
    if (status !== 200) {
      return new Response(JSON.stringify({ error: 'boom' }), { status });
    }
    const text = reply(bodies.length);
    const frames = text ? `data: ${JSON.stringify({ text })}\n\n` : '';
    return new Response(`${frames}data: [DONE]\n\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
);

const last = () => bodies[bodies.length - 1];
const ask = (/** @type {string} */ text, door) => streamCoachReply({ text, door });

before(async () => {
  await setPrivacyMode('cloud');
  await setAiEnabled(true);
});

describe('CORE-5 — память диалога: 3 обмена, потолок держится', () => {
  test('четвёртый обмен вытесняет первый', async () => {
    for (let i = 1; i <= 5; i++) await ask(`q${i}`);
    const content = (/** @type {any} */ b) => b.messages.map((m) => m.content);
    assert.deepEqual(content(bodies[3]), ['q1', 'answer 1', 'q2', 'answer 2', 'q3', 'answer 3', 'q4']);
    assert.deepEqual(content(bodies[4]), ['q2', 'answer 2', 'q3', 'answer 3', 'q4', 'answer 4', 'q5']);
    assert.equal(bodies[4].messages[0].role, 'user', 'история обязана начинаться с вопроса');
  });

  test('двадцать пять обменов подряд — каждое тело проходит схему сервера', async () => {
    const from = bodies.length;
    for (let i = 0; i < 25; i++) await ask(`long run ${i}`);
    for (const body of bodies.slice(from)) {
      const parsed = coachSchema.safeParse(body);
      assert.ok(parsed.success, JSON.stringify(parsed.error?.issues?.[0]));
      assert.ok(body.messages.length <= COACH_MEMORY_EXCHANGES * 2 + 1, `история растёт: ${body.messages.length}`);
    }
  });

  test('вопрос уходит один раз — последним сообщением', async () => {
    await ask('unique question');
    const hits = last().messages.filter((/** @type {any} */ m) => m.content === 'unique question');
    assert.equal(hits.length, 1, 'вопрос задублирован в истории');
    assert.equal(last().messages.at(-1).content, 'unique question');
  });

  test('ответ длиннее потолка схемы не роняет следующий вопрос', async () => {
    reply = () => 'x'.repeat(COACH_MAX_CONTENT_LEN + 500);
    await ask('give me a long one');
    reply = (n) => `answer ${n}`;
    await ask('and now?');
    const parsed = coachSchema.safeParse(last());
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues?.[0]));
  });

  test('ошибка и пустой ответ в память не ложатся', async () => {
    status = 500;
    await assert.rejects(() => ask('failed question'));
    status = 200;
    reply = () => '';
    assert.equal(await ask('empty question'), '');
    reply = (n) => `answer ${n}`;
    await ask('after');
    const content = last().messages.map((/** @type {any} */ m) => m.content);
    assert.equal(content.includes('failed question'), false);
    assert.equal(content.includes('empty question'), false);
    assert.ok(coachSchema.safeParse(last()).success);
  });

  test('дверь уходит в снимке: чат тренировки — workout, Core по умолчанию — intel', async () => {
    await ask('mid-set?', 'workout');
    assert.equal(last().snapshot.door, 'workout');
    await ask('and here?');
    assert.equal(last().snapshot.door, 'intel');
  });

  test('потолки клиента совпадают со схемой сервера', () => {
    const src = read('routes/coach.js');
    assert.equal(Number(src.match(/const COACH_MAX_CONTENT_LEN = (\d+)/)?.[1]), COACH_MAX_CONTENT_LEN);
    const maxMessages = Number(src.match(/const COACH_MAX_MESSAGES = (\d+)/)?.[1]);
    assert.ok(COACH_MEMORY_EXCHANGES * 2 + 1 <= maxMessages, 'память не влезает в схему сервера');
  });
});

/* ── Статика: второй клиент не должен вырасти снова ── */

/** @param {string} src */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** @param {string} dir @returns {string[]} пути от корня репо */
function walkJs(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return walkJs(rel);
    return e.name.endsWith('.js') ? [rel] : [];
  });
}

const JS = walkJs('js').map((f) => ({ f, src: read(f), code: stripComments(read(f)) }));

describe('CORE-5 — один клиент на все двери', () => {
  test('sanity: обход js/ видит и корень, и подпапки', () => {
    const files = JS.map((x) => x.f);
    assert.ok(files.includes('js/intel.store.js') && files.includes('js/shared/sse.js'));
  });

  test('fetchCoach нет нигде в js/ — даже в комментариях', () => {
    const hits = JS.filter((x) => x.src.includes('fetchCoach')).map((x) => x.f);
    assert.deepEqual(hits, []);
  });

  test('POST /api/coach шлёт только intel.store.js', () => {
    const hits = JS.filter((x) => /['"`]\/api\/coach['"`]/.test(x.code)).map((x) => x.f);
    assert.deepEqual(hits, ['js/intel.store.js']);
  });

  test('кадры SSE разбирает только shared/sse.js', () => {
    const hits = JS.filter((x) => /['"`]data: ['"`]/.test(x.code)).map((x) => x.f);
    assert.deepEqual(hits, ['js/shared/sse.js']);
  });

  test('чат тренировки идёт через общий клиент и рисует полный текст', () => {
    const src = stripComments(read('js/workout-ai.view.js'));
    assert.match(src, /import \{ streamCoachReply \} from '\.\/intel\.store\.js'/);
    assert.match(src, /door: 'workout'/);
    assert.match(src, /onText: \(_chunk, full\) => \{\s*aiDiv\.innerHTML = _markdownToHtml\(full\)/);
  });

  test('«Спросить коуча» из сводки открывает Core с вопросом', () => {
    const dash = stripComments(read('js/dashboard.js'));
    const fn = dash.slice(dash.indexOf('async function askAIAboutSummary'));
    assert.match(fn.slice(0, 900), /Claude\.open\(message\)/);
    const view = stripComments(read('js/claude.view.js'));
    assert.match(view, /IntelView\.ask\(question\)/);
    const core = stripComments(read('js/intel.view.js'));
    const load = core.slice(core.indexOf('async function load()'), core.indexOf('function renderLogs'));
    assert.match(load, /_asked !== null/, 'load() обязан отправить вопрос, пришедший с другой двери');
  });
});
