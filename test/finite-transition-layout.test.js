// MOTION-FIX TEST-GUARD: закон кадра на КОНЕЧНЫХ переходах.
//
// Два соседних гарда отвечают каждый на свой вопрос и оба мимо:
//   * `css-infinite-composite` (PERF-2) по собственной шапке берёт только
//     `@keyframes` под `animation: … infinite` — конечные переходы не в счёт;
//   * `perf-inline-transition` (PERF-INLINE) ловит ровно `transition: all`,
//     а `transition: width …` для него честный явный список.
// В итоге закон «не анимировать left/width» не сторожил никто: аудит 1.27.82
// нашёл три живых адреса глазами (docs/handoff/HANDOFF_launch_track.md, MOTION-FIX).
//
// Часть 2 — dual-driver: CSS `transition` по свойству, которое на том же
// селекторе гонит `Spring.animate` из js/. Пружина пишет стиль каждый кадр,
// transition стартует заново на каждую запись — анимация «залипает» и жуёт
// кадры. Закрывалось трижды точечно (1.27.89 шторка метрик, 1.27.90 confirm,
// `orm-bar-motion` для баров 1RM) — здесь общий реестр вместо четвёртого теста.

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Свойства, чей переход считает лейаут на каждом кадре. */
const LAYOUT_PROPS = new Set([
  'width', 'min-width', 'max-width',
  'height', 'min-height', 'max-height',
  'top', 'right', 'bottom', 'left', 'inset',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'flex-basis', 'gap', 'row-gap', 'column-gap',
  'font-size', 'line-height',
]);

/**
 * ЗАМОРОЖЕННАЯ ИНВЕНТАРИЗАЦИЯ на момент MOTION-FIX (1.27.122): `файл::свойство` → счёт
 * деклараций. Не индульгенция — долг под ревизию отдельными карточками. Новый адрес
 * (и четвёртая декларация на старом) роняет тест и заставляет автора ответить,
 * почему переход считает лейаут.
 *
 * Карточка называла три адреса — их нашли глазами. Гард видит семь: полный обход
 * дал ещё `.cp-progress-fill` и морф острова, который в карточке стоит под «не трогать».
 */
const LAYOUT_TRANSITIONS = {
  'athlete-room.css::width': 1,      // .ar-sc-fill — шкала прогресса, экран не висит открытым
  'base.css::width': 1,              // .cp-progress-fill — прогресс, тот же класс задачи
  'dynamic-island.css::width': 1,    // морф острова: ширина/высота — суть эффекта,
  'dynamic-island.css::height': 1,   //   `--ease-island` настроен по полю, MOTION-FIX запрещает трогать
  'dynamic-island.css::top': 1,      // точка-индикатор внутри острова, едет вместе с ним
  'intel.css::max-width': 1,         // .intel-logs — разворот лога, один элемент
  'intel.css::padding': 1,           // .intel-logs — там же, одной декларацией
};

/**
 * То же для инлайнового CSS: `index.html` + строки в `js/**`. Один шаблон бара
 * в Intel, размноженный по трём метрикам. Вне зоны PERF-2 и PERF-INLINE.
 */
const INLINE_LAYOUT_TRANSITIONS = {
  'js/intel.view.js::width': 3,      // бары метрик, шаблон одной строкой
};

/** Spring гонит стиль сам — CSS-переход по тому же свойству это второй драйвер. */
const SPRING_DRIVEN = [
  { selector: '.orm-bar-fill', prop: 'transform' }, // dashboard.js + analytics.view.js
];

/**
 * Замороженный счёт вызовов `Spring.animate`. Новый вызов = новая поверхность,
 * которую нужно либо внести в SPRING_DRIVEN, либо объяснить (как `#live-tonnage`:
 * пружина пишет textContent, а не стиль, — драйвер там один).
 */
const SPRING_CALLSITES = {
  'js/analytics.view.js': 1,
  'js/dashboard.js': 1,
  'js/workout.view/handlers.js': 1,
};

/** Вырезает блочные комментарии, сохраняя переводы строк. */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Делит по разделителю верхнего уровня — запятые внутри `(...)` не считаются. */
function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

const rel = (file) => relative(ROOT, file).replace(/\\/g, '/');

/** Все `transition[-property]` текста с layout-свойством в списке. */
function layoutTransitions(text) {
  const hits = [];
  const re = /(?<![-\w])transition(?:-property)?\s*:\s*([^;{}]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split('\n').length;
    for (const group of splitTopLevel(m[1], ',')) {
      const prop = group.trim().split(/\s+/)[0]?.toLowerCase();
      if (prop && LAYOUT_PROPS.has(prop)) {
        hits.push({ prop, line, snippet: m[0].trim().replace(/\s+/g, ' ').slice(0, 80) });
      }
    }
  }
  return hits;
}

/** `файл::свойство` → счёт деклараций + адреса для сообщения. */
function tally(sources) {
  const counts = {};
  const where = {};
  for (const { name, text } of sources) {
    for (const hit of layoutTransitions(stripBlockComments(text))) {
      const key = `${name}::${hit.prop}`;
      counts[key] = (counts[key] || 0) + 1;
      (where[key] ||= []).push(`${name}:${hit.line}  ${hit.snippet}`);
    }
  }
  return { counts, where };
}

const CEILING_HINT =
  'Переводи на transform/opacity (масштаб вместо width, сдвиг вместо left). ' +
  'Правка потолка — только с обоснованием в карточке.';

test('конечные transition по layout-свойствам не выходят за потолок (css/**)', () => {
  const { counts, where } = tally(
    walk(join(ROOT, 'css'), '.css').map((file) => ({
      name: rel(file).replace(/^css\//, ''),
      text: readFileSync(file, 'utf8'),
    })),
  );

  assert.deepEqual(
    counts,
    LAYOUT_TRANSITIONS,
    'Инвентаризация конечных transition по layout-свойствам разошлась с потолком — ' +
      `каждый такой кадр считает лейаут главным потоком (MOTION-FIX):\n${Object.entries(where)
        .filter(([k, v]) => v.length !== LAYOUT_TRANSITIONS[k])
        .map(([k, v]) => `  ${k}\n${v.map((s) => `    ${s}`).join('\n')}`)
        .join('\n')}\n${CEILING_HINT}`,
  );
});

test('конечные transition по layout-свойствам не выходят за потолок (инлайн: index.html, js/**)', () => {
  const sources = [];
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    sources.push({ name: 'index.html', text: style[1] });
  }
  for (const file of walk(join(ROOT, 'js'), '.js')) {
    sources.push({ name: rel(file), text: readFileSync(file, 'utf8') });
  }

  const { counts, where } = tally(sources);
  assert.deepEqual(
    counts,
    INLINE_LAYOUT_TRANSITIONS,
    'Инлайновый CSS с конечным transition по layout-свойству — сюда не смотрит ни PERF-2, ' +
      `ни PERF-INLINE (MOTION-FIX):\n${Object.entries(where)
        .filter(([k, v]) => v.length !== INLINE_LAYOUT_TRANSITIONS[k])
        .map(([k, v]) => `  ${k}\n${v.map((s) => `    ${s}`).join('\n')}`)
        .join('\n')}\n${CEILING_HINT}`,
  );
});

test('dual-driver: у Spring-ведомых селекторов нет CSS transition по тому же свойству', () => {
  const cssFiles = walk(join(ROOT, 'css'), '.css').map((f) => ({
    name: rel(f),
    css: stripBlockComments(readFileSync(f, 'utf8')),
  }));

  for (const { selector, prop } of SPRING_DRIVEN) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bodies = [];
    for (const { name, css } of cssFiles) {
      const re = new RegExp(`${escaped}\\b[^{]*\\{([^}]*)\\}`, 'g');
      let m;
      while ((m = re.exec(css))) {
        bodies.push({ name, body: m[1], line: css.slice(0, m.index).split('\n').length });
      }
    }
    assert.ok(bodies.length > 0, `${selector} пропал из css/ — реестр SPRING_DRIVEN протух`);

    const fights = bodies.filter(({ body }) =>
      new RegExp(`transition(?:-property)?\\s*:[^;]*\\b(?:${prop}|all)\\b`).test(body),
    );
    assert.deepEqual(
      fights.map((f) => `${f.name}:${f.line}`),
      [],
      `CSS transition по ${prop} на ${selector} — второй драйвер поверх Spring.animate, ` +
        'переход перезапускается на каждый кадр пружины (MOTION-FIX)',
    );
  }
});

test('реестр Spring-ведомых поверхностей покрывает все вызовы Spring.animate', () => {
  const actual = {};
  for (const file of walk(join(ROOT, 'js'), '.js')) {
    const count = (readFileSync(file, 'utf8').match(/Spring\.animate\s*\(/g) || []).length;
    if (count) actual[rel(file)] = count;
  }
  assert.deepEqual(
    actual,
    SPRING_CALLSITES,
    'Набор вызовов Spring.animate изменился. Новая пружина, которая пишет style, обязана ' +
      'попасть в SPRING_DRIVEN — иначе CSS transition по тому же свойству никто не поймает. ' +
      'Пружина, которая пишет текст или атрибут, просто обновляет счёт здесь.',
  );
});
