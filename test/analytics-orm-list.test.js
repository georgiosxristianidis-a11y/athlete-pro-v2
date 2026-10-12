// ANL-2: список 1RM в аналитике свёрнут по умолчанию, заголовок секции — кнопка-тоггл
// с числом записей. Заодно хвост NAME-1: «Cable Row» и «Seated Cable Row» — одна строка.
// Логика в js/shared/orm-list.js (чистая, без DOM); view только вешает действие и
// запускает Spring при раскрытии, а не при загрузке.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORM_BODY_ID,
  mergeORMRows,
  ormSectionHtml,
  setORMExpanded,
} from '../js/shared/orm-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const ORMS = [
  { id: 'Bench Press', value: 100, timestamp: 1 },
  { id: 'Cable Row', value: 70, timestamp: 2 },
  { id: 'Seated Cable Row', value: 60, timestamp: 3 },
  { id: 'Squat', value: 140, timestamp: 4 },
];

/** Узел с ровно той поверхностью DOM, которую трогает setORMExpanded. */
function fakeEl() {
  const classes = new Set();
  const attrs = new Map();
  return {
    classList: {
      contains: (c) => classes.has(c),
      toggle(c, force) {
        const on = force ?? !classes.has(c);
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
    toggleAttribute(k, force) {
      const on = force ?? !attrs.has(k);
      if (on) attrs.set(k, '');
      else attrs.delete(k);
      return on;
    },
  };
}

/** Тело функции верхнего уровня: от `function name(` до первой `}` в нулевой колонке. */
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `не найдена функция ${name}`);
  const end = src.slice(start).search(/\r?\n\}\r?\n/);
  assert.ok(end > 0, `не закрыта функция ${name}`);
  return src.slice(start, start + end);
}

/** Классы тега как массив: `\bexpanded\b` цепляет и `aria-expanded`. */
const classesOf = (tag) => (tag.match(/\sclass="([^"]*)"/)?.[1] ?? '').split(/\s+/);

describe('mergeORMRows — склейка NAME-1', () => {
  test('Cable Row и Seated Cable Row — одна строка с максимумом', () => {
    const rows = mergeORMRows(ORMS);
    const names = rows.map((r) => r.id);
    assert.ok(names.includes('Seated Cable Row'));
    assert.ok(!names.includes('Cable Row'), 'отдельной строки Cable Row быть не должно');
    assert.equal(rows.find((r) => r.id === 'Seated Cable Row').value, 70);
  });

  test('максимум не зависит от порядка записей', () => {
    const swapped = [ORMS[2], ORMS[1]];
    assert.equal(mergeORMRows(swapped)[0].value, 70);
    assert.equal(mergeORMRows(swapped)[0].id, 'Seated Cable Row');
  });

  test('регистр и алиас плана тоже сводятся к одной строке', () => {
    const rows = mergeORMRows([
      { id: 'cable row', value: 50 },
      { id: ' Low Block Cable Row ', value: 65 },
      { id: 'Seated Cable Row', value: 55 },
    ]);
    assert.deepEqual(rows, [{ id: 'Seated Cable Row', value: 65 }]);
  });

  test('чужие упражнения не трогаются, порядок — по убыванию значения', () => {
    const rows = mergeORMRows(ORMS);
    assert.deepEqual(
      rows.map((r) => [r.id, r.value]),
      [
        ['Squat', 140],
        ['Bench Press', 100],
        ['Seated Cable Row', 70],
      ]
    );
  });

  test('вход не мутируется', () => {
    const copy = JSON.parse(JSON.stringify(ORMS));
    mergeORMRows(ORMS);
    assert.deepEqual(ORMS, copy);
  });

  test('мусор не падает: пустой вход, нет значения, нет имени', () => {
    assert.deepEqual(mergeORMRows([]), []);
    assert.deepEqual(mergeORMRows(undefined), []);
    const rows = mergeORMRows([
      { id: 'Squat', value: 100 },
      { id: 'Deadlift', value: NaN },
      { id: '', value: 80 },
      { value: 80 },
    ]);
    assert.deepEqual(rows, [{ id: 'Squat', value: 100 }]);
  });
});

describe('ormSectionHtml — дефолт «свёрнут»', () => {
  const rows = mergeORMRows(ORMS);
  const html = ormSectionHtml(rows, { title: 'Records (1RM)' });
  const toggleTag = html.match(/<button[^>]*data-action="analytics:toggleORM"[^>]*>/)?.[0] ?? '';
  const bodyTag = html.match(new RegExp(`<div[^>]*id="${ORM_BODY_ID}"[^>]*>`))?.[0] ?? '';

  test('заголовок — настоящая кнопка: Enter и Space работают без доп. кода', () => {
    assert.ok(toggleTag, 'тоггл-кнопки нет');
    assert.match(toggleTag, /^<button\b/);
    assert.match(toggleTag, /type="button"/);
    assert.match(toggleTag, /class="[^"]*\blist-toggle\b/);
  });

  test('aria-expanded="false" и aria-controls указывает на тело', () => {
    assert.match(toggleTag, /aria-expanded="false"/);
    assert.match(toggleTag, new RegExp(`aria-controls="${ORM_BODY_ID}"`));
    assert.ok(bodyTag, 'тела списка нет');
  });

  test('тело свёрнуто: нет .expanded, inert выкидывает строки из Tab-порядка', () => {
    assert.ok(classesOf(bodyTag).includes('list-collapse'));
    assert.ok(!classesOf(bodyTag).includes('expanded'), 'тело раскрыто по умолчанию');
    assert.match(bodyTag, /\sinert[\s>]/);
    assert.ok(!classesOf(toggleTag).includes('expanded'), 'тоггл раскрыт по умолчанию');
  });

  test('в свёрнутом виде видно число записей — после склейки, не сырое', () => {
    assert.equal(rows.length, 3);
    assert.match(html, /<span class="list-toggle-count">3<\/span>/);
    assert.match(html, /Records \(1RM\)/);
  });

  test('строки на месте и ведут на историю упражнения', () => {
    assert.equal((html.match(/class="orm-row"/g) ?? []).length, 3);
    assert.match(html, /data-action="analytics:openExercise" data-exercise="Seated Cable Row"/);
    assert.match(html, /id="an-orm-bar-0"/);
    assert.match(html, /id="an-orm-bar-2"/);
  });

  test('имена экранируются', () => {
    const evil = ormSectionHtml([{ id: '<img src=x onerror=1>', value: 10 }], { title: 'T' });
    assert.doesNotMatch(evil, /<img/);
    assert.match(evil, /&lt;img/);
  });

  test('пустой список — пустая строка, секции нет', () => {
    assert.equal(ormSectionHtml([], { title: 'T' }), '');
  });
});

describe('setORMExpanded — состояние тоггла', () => {
  test('раскрытие: aria-expanded, классы, inert снят', () => {
    const btn = fakeEl();
    const body = fakeEl();
    body.toggleAttribute('inert', true);
    setORMExpanded(btn, body, true);
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.ok(btn.classList.contains('expanded'));
    assert.ok(body.classList.contains('expanded'));
    assert.equal(body.hasAttribute('inert'), false);
  });

  test('сворачивание возвращает всё обратно', () => {
    const btn = fakeEl();
    const body = fakeEl();
    setORMExpanded(btn, body, true);
    setORMExpanded(btn, body, false);
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(btn.classList.contains('expanded'), false);
    assert.equal(body.classList.contains('expanded'), false);
    assert.equal(body.hasAttribute('inert'), true);
  });
});

describe('analytics.view.js — проводка', () => {
  const src = read('js/analytics.view.js');

  test('действие тоггла зарегистрировано', () => {
    assert.match(src, /on\('analytics:toggleORM'/);
  });

  test('шаблон экрана больше не держит статический заголовок и список 1RM', () => {
    assert.match(src, /id="orm-section"/);
    assert.doesNotMatch(src, /<div id="orm-list"><\/div>/);
  });

  test('рендер списка не запускает Spring и не ждёт таймером: пружина — на раскрытии', () => {
    const render = fnBody(src, '_renderORMList');
    assert.doesNotMatch(render, /Spring\.animate/);
    assert.doesNotMatch(render, /setTimeout/);
    assert.match(fnBody(src, '_toggleORM'), /_animateORMBars\(/);
  });

  test('состояние не запоминается', () => {
    const wired = fnBody(src, '_toggleORM') + fnBody(src, '_renderORMList');
    assert.doesNotMatch(wired, /localStorage|sessionStorage/);
  });
});
