// @ts-check
/**
 * CORE-8 — ИИ выключен = локальный режим ядра, а не ошибка.
 *
 * До карточки каждая дверь Core (вопрос, АНАЛИЗ, СВОДКА, БИОМЕТРИЯ) при
 * airgap шла в `safeFetch`, получала `PrivacyBlockedError` и рисовала
 * карточку ошибки «ИИ выключен» — а airgap дефолт каждой новой установки.
 * Теперь экран читает тот же снимок движков (CORE-4) шаблонами
 * `js/shared/local-insights.js`, и к `/api/coach` не уходит ни одного запроса.
 *
 * Три слоя: чистые шаблоны; стор на настоящей базе (fake-indexeddb) и
 * настоящем privacy.store против заглушки fetch; разметка view — порядок
 * проверок в дверях (DOM-рендер — глазами в превью, см. CHANGELOG).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/**
 * Гард на регекспе зеленеет от слова в комментарии — режем их. Только те, что
 * начинают строку: `accept="image/*"` в шаблоне иначе открыл бы «блок-комментарий».
 */
const stripComments = (/** @type {string} */ s) =>
  s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');

const _ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
});
globalThis.window = /** @type {any} */ ({
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

/** @type {string[]} каждый URL, ушедший в fetch */
const calls = [];
globalThis.fetch = /** @type {any} */ (
  async (/** @type {string} */ url) => {
    calls.push(String(url));
    return new Response('{}', { status: 200 });
  }
);

const { buildLocalInsights, LOCAL_INSIGHTS_MAX } = await import('../js/shared/local-insights.js');
const { buildSnapshot } = await import('../js/shared/coach-snapshot.js');
const { initPrivacy, getPrivacyMode, setPrivacyMode, setAiEnabled } = await import(
  '../js/privacy.store.js'
);
const { isCoachLocal, localCoachInsights } = await import('../js/intel.store.js');
const { DB } = await import('../js/db.js');

/** Переводчик-зеркало: ключ и параметры видны в тексте как есть. */
const echo = (/** @type {string} */ key, /** @type {any} */ p = {}) => `${key} ${JSON.stringify(p)}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 25, 12);

/** Сессия с тоннажем — пустые записи снимок отсеивает. */
const session = (/** @type {number} */ daysAgo, kg = 100) => ({
  type: 'push',
  timestamp: NOW - daysAgo * DAY,
  tonnage: kg * 5 * 3,
  duration: 3_600_000,
  exercises: [
    { name: 'Bench Press', sets: [1, 2, 3].map(() => ({ weight: kg, reps: 5, done: true })) },
  ],
});

describe('CORE-8 — шаблоны: только снимок, только t()', () => {
  test('пустая история — одна карточка «запиши первую», без индекса', () => {
    const out = buildLocalInsights(buildSnapshot({ workouts: [], now: NOW }), echo);
    assert.deepEqual(out.map((i) => i.kind), ['start']);
    assert.match(out[0].text, /^core\.local\.start/);
  });

  test('ступени готовности — пороги 70/50, число из снимка', () => {
    const snap = (/** @type {number|null} */ index) => ({
      readiness: { index, confidence: 'high', parts: {} },
      cns: 0, fatigue: {}, e1rm: [], sessions: [{ hoursAgo: 5 }],
    });
    const first = (/** @type {number|null} */ i) => buildLocalInsights(/** @type {any} */ (snap(i)), echo)[0].text;
    assert.match(first(85), /readiness_high \{"index":85\}/);
    assert.match(first(70), /readiness_high/);
    assert.match(first(69), /readiness_mid \{"index":69\}/);
    assert.match(first(49), /readiness_low \{"index":49\}/);
    assert.match(first(null), /readiness_none/);
  });

  test('ЦНС, мышца, e1RM, пауза — каждое число пришло из снимка', () => {
    const out = buildLocalInsights(
      /** @type {any} */ ({
        readiness: { index: 60 },
        cns: 81,
        fatigue: { chest: 72, tricep: 40 },
        e1rm: [{ exercise: 'Squat', kg: 140, shift4w: 7.5 }],
        sessions: [{ hoursAgo: 120 }],
      }),
      echo
    );
    const kinds = out.map((i) => i.kind);
    assert.equal(out.length, LOCAL_INSIGHTS_MAX, 'больше трёх карточек — стена текста');
    assert.deepEqual(kinds, ['readiness', 'cns', 'fatigue']);
    assert.match(out[1].text, /"cns":81/);
    assert.match(out[2].text, /"muscle":"chest","pct":72/);
  });

  test('сдвиг null — «не с чем сравнить», строка молчит; отрицательный — без минуса в параметре', () => {
    const base = { readiness: { index: 60 }, cns: 0, fatigue: {}, sessions: [{ hoursAgo: 5 }] };
    const none = buildLocalInsights(/** @type {any} */ ({ ...base, e1rm: [{ exercise: 'Row', kg: 80, shift4w: null }] }), echo);
    assert.ok(!none.some((i) => i.kind === 'strength'));
    const down = buildLocalInsights(/** @type {any} */ ({ ...base, e1rm: [{ exercise: 'Row', kg: 80, shift4w: -5 }] }), echo);
    assert.match(down.find((i) => i.kind === 'strength')?.text || '', /e1rm_down \{"exercise":"Row","kg":5\}/);
  });

  test('ключи шаблонов заведены в обоих языках словаря — t() не отдаёт ключ сырьём', () => {
    const src = read('js/shared/local-insights.js');
    const keys = [...src.matchAll(/'(core\.local\.[a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(keys.length >= 8, 'парсер ключей сломался');
    const dict = read('js/locale.store.js');
    for (const k of keys) {
      const hits = dict.split(`'${k}':`).length - 1;
      assert.equal(hits, 2, `${k}: ожидалось en + ru, найдено ${hits}`);
    }
  });
});

describe('CORE-8 — стор: airgap ON, ни одного запроса к модели', () => {
  test('новая установка — airgap по умолчанию, ядро локальное', async () => {
    await initPrivacy();
    assert.equal(getPrivacyMode(), 'airgap', 'новая установка обязана стартовать в airgap');
    assert.equal(isCoachLocal(), true);
    calls.length = 0;
    const out = await localCoachInsights();
    assert.deepEqual(out.map((i) => i.kind), ['start']);
    assert.deepEqual(calls, [], 'локальный разбор ходил в сеть');
  });

  test('с историей — инсайты из снимка, fetch не зовётся вовсе', async () => {
    const now = Date.now();
    for (const d of [1, 3, 6, 9, 13, 16, 20, 24]) {
      await DB.Workouts.save({ ...session(0), timestamp: now - d * DAY });
    }
    calls.length = 0;
    const out = await localCoachInsights();
    assert.ok(out.length > 0 && out.length <= LOCAL_INSIGHTS_MAX);
    assert.ok(out.every((i) => i.text && !i.text.startsWith('core.local.')), 'текст не переведён');
    assert.deepEqual(calls, [], 'локальный разбор ходил в сеть');
  });

  test('тумблер ИИ в cloud — та же развилка, одним флагом', async () => {
    await setPrivacyMode('cloud');
    await setAiEnabled(false);
    assert.equal(isCoachLocal(), true);
    await setAiEnabled(true);
    assert.equal(isCoachLocal(), false);
    await setPrivacyMode('airgap');
    assert.equal(isCoachLocal(), true, 'airgap обязан гасить ИИ, даже если тумблер был включён');
  });
});

describe('CORE-8 — view: локальная ветка стоит ДО похода к модели', () => {
  const view = stripComments(read('js/intel.view.js'));
  const body = (/** @type {string} */ fn) => {
    const start = view.indexOf(`async function ${fn}(`);
    assert.ok(start !== -1, `${fn}() пропала из intel.view.js`);
    const next = view.indexOf('\n  async function ', start + 1);
    const next2 = view.indexOf('\n  function ', start + 1);
    const end = Math.min(...[next, next2].filter((i) => i !== -1));
    return view.slice(start, end);
  };

  for (const [fn, call] of [
    ['submit', 'streamCoachReply('],
    ['generateWeekly', 'fetchWeeklyReport('],
    ['checkBiometrics', 'fetchBiometricsScan('],
  ]) {
    test(`${fn}(): isCoachLocal() раньше ${call}`, () => {
      const src = body(fn);
      const gate = src.indexOf('isCoachLocal()');
      const net = src.indexOf(call);
      assert.ok(gate !== -1, `${fn}() не спрашивает режим — airgap снова даст карточку ошибки`);
      assert.ok(net !== -1, `${fn}() больше не зовёт ${call} — гард устарел, переписать`);
      assert.ok(gate < net, `${fn}(): ${call} стоит раньше проверки режима`);
    });
  }

  test('плашка «Локальный режим» одна — карточка не дублирует её, а стоит рядом', () => {
    assert.equal(view.split('intel-local-banner').length - 1, 1);
    assert.match(view, /id="intel-local-mount"/);
    assert.doesNotMatch(view, /getAiEnabled\(\)/, 'развилка режима — через isCoachLocal() стора');
  });

  test('текст шаблона в DOM — через esc()', () => {
    assert.match(view, /<li>\$\{esc\(i\.text\)\}<\/li>/);
  });
});
