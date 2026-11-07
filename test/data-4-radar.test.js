// @ts-check
/**
 * DATA-4 — радар силы A (выбор Gio 07.11) за флагом `muscles-ui`.
 * Гард: OFF — легаси-разметка радара побитно (подписи `radar-lbl`, ни одной оси-кнопки);
 * ON — шесть тапаемых осей с клавиатурой и карточка под радаром; карточка оси — чистая
 * функция четырёх случаев данных; CSS нового блока только токены.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Язык в Node по умолчанию en (setLang пишет в IDB) — строки карточки сверяются по en.
// events.js вешает слушатели на document при импорте — стаб как в data-logic-baseline.
globalThis.document = /** @type {any} */ ({
  addEventListener() {}, removeEventListener() {}, body: { style: {} },
  getElementById: () => null, querySelector: () => null,
});
Object.defineProperty(globalThis, 'window', {
  value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  writable: true, configurable: true,
});
/** @type {Map<string, string>} */
const store = new Map();
globalThis.localStorage = /** @type {any} */ ({ getItem: (/** @type {string} */ k) => store.get(k) ?? null });

const { renderHexagonRadar } = await import('../js/profile.view/hexagon-radar.js');
const { axisCardHtml, hintHtml, nextSelection, isActivateKey, topRecordFor } =
  await import('../js/profile.view/radar-axis-card.js');
const { buildRecords } = await import('../js/shared/exercise-records.js');

const read = (/** @type {string} */ p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.now();
const DAY = 86400000;

/** @param {string} name @param {number} weight @param {number} reps @param {number} daysAgo */
const wo = (name, weight, reps, daysAgo) => ({
  timestamp: NOW - daysAgo * DAY, tonnage: weight * reps,
  exercises: [{ name, sets: [{ weight, reps, done: true }] }],
});
const WORKOUTS = [wo('Bench Press', 100, 5, 3), wo('Bench Press', 90, 8, 10), wo('Squat', 120, 3, 5)];

/** @param {any[]} workouts @param {any} oneRMs */
const ctxOf = (workouts, oneRMs) => ({
  oneRMs, bw: 80, sex: /** @type {'m'} */ ('m'), age: 30,
  records: buildRecords(workouts), monthVol: 9000, sessions30d: 7,
});
const BENCH = { key: 'bench', label: 'Bench' };

describe('DATA-4 радар: флаг OFF — легаси побитно', () => {
  test('подписи radar-lbl, нет осей-кнопок и карточки', () => {
    store.clear();
    const html = renderHexagonRadar({ bench: 110 }, 80, 'm', 30, WORKOUTS, 'ru');
    assert.equal(html.split('class="radar-lbl"').length - 1, 6);
    assert.ok(!html.includes('data-action="radar-axis"'));
    assert.ok(!html.includes('pp-radar-card'));
    assert.ok(!html.includes('pp-axbtn'));
  });
});

describe('DATA-4 радар: флаг ON — шесть тапаемых осей', () => {
  store.set('ap-flag-muscles-ui', '1');
  const html = renderHexagonRadar({ bench: 110 }, 80, 'm', 30, WORKOUTS, 'ru');
  store.clear();

  test('ровно шесть осей, порядок как на радаре, все кнопки с клавиатурой и названием', () => {
    const axes = [...html.matchAll(/<g class="pp-axbtn"[^>]*>/g)].map((m) => m[0]);
    assert.equal(axes.length, 6);
    assert.deepEqual(axes.map((a) => /data-axis="(\w+)"/.exec(a)?.[1]),
      ['bench', 'ohp', 'deadlift', 'squat', 'volume', 'consist']);
    for (const a of axes) {
      assert.ok(a.includes('data-action="radar-axis"'), a);
      assert.ok(a.includes('data-keydown="radar-axis-key"'), a);
      assert.ok(a.includes('role="button"') && a.includes('tabindex="0"'), a);
      assert.ok(/aria-label="[^"]+"/.test(a) && a.includes('aria-pressed="false"'), a);
    }
  });
  test('у каждой оси вершина r=3 и два прозрачных hit-круга r=19 и r=12', () => {
    assert.equal(html.split('class="pp-vtx" r="3"').length - 1, 6);
    assert.equal(html.split('class="pp-hit" r="19"').length - 1, 6);
    assert.equal(html.split('class="pp-hit" r="12"').length - 1, 6);
  });
  test('нет легаси-подписей, есть карточка с подсказкой и live-регионом', () => {
    assert.ok(!html.includes('class="radar-lbl"'));
    assert.ok(html.includes('id="pp-radar-card"') && html.includes('aria-live="polite"'));
    assert.ok(html.includes(hintHtml()));
  });
  test('полигон данных не потерян (анимация появления живёт)', () => {
    assert.ok(html.includes('<animate attributeName="opacity"'));
  });
});

describe('DATA-4 карточка оси: четыре случая данных лифта', () => {
  test('рекорд и 1ПМ — вес × повторы, 1ПМ, уровень, семейство и мышцы, «График»', () => {
    const h = axisCardHtml(BENCH, ctxOf(WORKOUTS, { bench: 117 }));
    assert.ok(h.includes('100 × 5'), 'мой максимум — реально поднятый подход');
    assert.ok(h.includes('117'), '1ПМ из oneRMs, то же число что у радара');
    assert.ok(!h.includes('pp-rc-muscles'), 'семейство и мышцы — только в ru (реестр русский); в en строки нет');
    assert.ok(/Untrained|Novice|Intermediate|Advanced|Elite/.test(h), 'уровень');
    assert.ok(h.includes('data-action="radar-open-stats"'));
  });
  test('рекорд есть, 1ПМ нет (history-records OFF) — вес × повторы без уровня', () => {
    const h = axisCardHtml(BENCH, ctxOf(WORKOUTS, {}));
    assert.ok(h.includes('100 × 5'));
    assert.ok(!/Untrained|Novice|Intermediate|Advanced|Elite/.test(h));
    assert.ok(h.includes('data-action="radar-open-stats"'));
  });
  test('рекорда нет, 1ПМ есть — «N кг · 1ПМ» и уровень', () => {
    const h = axisCardHtml(BENCH, ctxOf([], { bench: 117 }));
    assert.ok(h.includes('117'));
    assert.ok(/1RM/.test(h));
    assert.ok(/Untrained|Novice|Intermediate|Advanced|Elite/.test(h));
  });
  test('ни рекорда, ни 1ПМ — «нет данных», не тупик: без пустых цифр и без «Графика»', () => {
    const h = axisCardHtml(BENCH, ctxOf([], {}));
    assert.ok(/No data/.test(h));
    assert.ok(!h.includes('NaN') && !h.includes('undefined') && !h.includes(' 0 × '));
    assert.ok(!h.includes('radar-open-stats'));
  });
  test('максимум оси — по весу, при равенстве по повторам, только по её lift', () => {
    const ws = [wo('Bench Press', 100, 5, 3), wo('Dumbbell Bench Press', 40, 12, 2), wo('Squat', 150, 1, 1)];
    const rec = topRecordFor(buildRecords(ws), 'bench');
    assert.equal(rec?.myMax.weight, 100);
    const tie = topRecordFor(buildRecords([wo('Bench Press', 100, 5, 3), wo('Barbell Bench Press', 100, 7, 2)]), 'bench');
    assert.equal(tie?.myMax.reps, 7);
    assert.equal(topRecordFor(buildRecords([]), 'bench'), null);
  });
  test('имя из истории экранируется', () => {
    const evil = '<img src=x onerror=1>';
    const h = axisCardHtml({ key: 'bench', label: evil }, ctxOf(WORKOUTS, { bench: 110 }));
    assert.ok(!h.includes('<img'), 'сырой тег не прошёл');
    const recs = buildRecords([wo(evil, 100, 5, 1)]);
    assert.equal(topRecordFor(recs, 'bench'), null, 'вне реестра без lift — в рекорды оси не попадает');
  });
});

describe('DATA-4 карточка оси: Объём и Регулярность', () => {
  test('информационные строки без «Графика»', () => {
    const vol = axisCardHtml({ key: 'volume', label: 'Объём' }, ctxOf(WORKOUTS, {}));
    const con = axisCardHtml({ key: 'consist', label: 'Регул.' }, ctxOf(WORKOUTS, {}));
    assert.ok(vol.includes('9000') && /30 days|30-day/.test(vol), vol);
    assert.ok(con.includes('7') && con.includes('20'), con);
    assert.ok(!vol.includes('radar-open-stats') && !con.includes('radar-open-stats'));
  });
});

describe('DATA-4 выбор оси и клавиатура', () => {
  test('повторный тап по выбранной оси снимает выбор, другая ось переключает', () => {
    assert.equal(nextSelection(null, 'bench'), 'bench');
    assert.equal(nextSelection('bench', 'bench'), null);
    assert.equal(nextSelection('bench', 'ohp'), 'ohp');
  });
  test('Enter и Space активируют, остальные клавиши — нет', () => {
    assert.ok(isActivateKey({ key: 'Enter' }));
    assert.ok(isActivateKey({ key: ' ' }));
    assert.ok(!isActivateKey({ key: 'Tab' }));
    assert.ok(!isActivateKey({ key: 'a' }));
  });
  test('обработчики повешены в hexagon-radar.js, карточка не тянет events.js', () => {
    const radar = read('js/profile.view/hexagon-radar.js');
    for (const n of ["on('radar-axis'", "onKeydown('radar-axis-key'", "on('radar-open-stats'"]) {
      assert.ok(radar.includes(n), n);
    }
    assert.ok(!/from '\.\.\/events\.js'/.test(read('js/profile.view/radar-axis-card.js')));
  });
});

describe('DATA-4 CSS радара: только токены', () => {
  const css = read('css/profile.css');
  const rules = [...css.matchAll(/(^|\n)([^{}\n]*\.pp-(?:axbtn|vtx|hit|ax-lbl|radar-card|radar-go)[^{}]*)\{([^}]*)\}/g)];
  test('блок есть', () => assert.ok(rules.length >= 5, `правил: ${rules.length}`));
  test('нет сырых hex, px в font-size и цифровых font-weight', () => {
    for (const r of rules) {
      const body = r[3];
      assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), r[2]);
      assert.ok(!/font-size:\s*\d/.test(body), r[2]);
      assert.ok(!/font-weight:\s*\d/.test(body), r[2]);
      assert.ok(!/rgba?\(/.test(body), r[2]);
    }
  });
});
