/**
 * Guard: рецепт `.sd-overlay` (MO-2, css/base.css) и его раскатка (MO-2b).
 *
 * 1. `dismissOverlay` снимает узел только после конца анимаций выхода, не
 *    запускает выход дважды и не ждёт вечных анимаций поддерева.
 * 2. Мигрированные файлы не возвращаются к старой схеме `rAF → add('visible')`
 *    + `setTimeout(remove, 300)`. У общего `.modal-overlay` нет правила
 *    `.visible`: старая схема давала 300 мс замершего листа, который ловил тапы,
 *    и обрыв. Новый файл — строкой в MIGRATED тем же PR, что его переводит.
 * 3. Модификатор листа, перебивший `padding-bottom`, обязан учесть
 *    `--sheet-tail` (MO-1): базовый лист уходит на 32 px под край экрана, и без
 *    хвоста в отступе последняя строка упирается в кромку (`.ex-history-sheet`
 *    до 1.27.128 — зазор 0 px). `max-height` сюда не входит: без хвоста лист
 *    ниже на 32 px, но контент не прижат.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dismissOverlay } from '../js/shared/utils.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** Поверхности, переведённые на `.sd-overlay`. Растёт по одной за PR (MO-2b). */
const MIGRATED = ['js/analytics.view.js', 'js/ai-settings.view.js', 'js/privacy.view.js', 'js/body-stats.js', 'js/plate-calc.js'];

const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const stripJsComments = (src) =>
  stripCssComments(src).replace(/^\s*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));

function stubOverlay(finished = []) {
  const attrs = new Set();
  const el = {
    removed: 0,
    getAnimationsCalls: 0,
    hasAttribute: (n) => attrs.has(n),
    setAttribute: (n) => attrs.add(n),
    getAnimations: () => {
      el.getAnimationsCalls++;
      return finished.map((p) => ({ finished: p }));
    },
    remove: () => {
      el.removed++;
    },
  };
  return el;
}

const tick = () => new Promise((r) => setImmediate(r));

test('dismissOverlay: узел живёт до конца анимации выхода', async () => {
  let done;
  const el = stubOverlay([new Promise((r) => (done = r))]);
  dismissOverlay(el);
  assert.ok(el.hasAttribute('data-closing'), 'data-closing включает выход в base.css');
  await tick();
  assert.equal(el.removed, 0, 'снят раньше, чем доиграл выход');
  done();
  await tick();
  assert.equal(el.removed, 1);
});

test('dismissOverlay: повторный вызов не перезапускает выход', async () => {
  const el = stubOverlay([Promise.resolve()]);
  dismissOverlay(el);
  dismissOverlay(el);
  await tick();
  assert.equal(el.getAnimationsCalls, 1);
  assert.equal(el.removed, 1);
});

test('dismissOverlay: прерванная анимация и её отсутствие не оставляют узел висеть', async () => {
  const cancelled = stubOverlay([Promise.reject(new DOMException('cancel', 'AbortError'))]);
  const none = stubOverlay([]);
  dismissOverlay(cancelled);
  dismissOverlay(none);
  await tick();
  assert.equal(cancelled.removed, 1, 'cancel() отклоняет finished — узел всё равно уходит');
  assert.equal(none.removed, 1, 'reduced-motion / старый движок — уходит сразу');
});

test('dismissOverlay: вечная анимация в поддереве не держит узел', async () => {
  // Лист настроек ИИ: `.ai-indicator.missing` мигает `infinite` — его finished
  // не резолвится никогда. До 1.27.141 лист после «Готово» оставался в DOM.
  let exitDone;
  const el = stubOverlay([]);
  el.getAnimations = () => [
    { finished: new Promise(() => {}), effect: { getComputedTiming: () => ({ endTime: Infinity }) } },
    { finished: new Promise((r) => (exitDone = r)), effect: { getComputedTiming: () => ({ endTime: 140 }) } },
  ];
  dismissOverlay(el);
  await tick();
  assert.equal(el.removed, 0, 'конечный выход ещё идёт');
  exitDone();
  await tick();
  assert.equal(el.removed, 1, 'узел ждёт вечную анимацию и не уходит');
});

test('рецепт в base.css: вход через @starting-style, выход не ловит тапы', () => {
  const css = stripCssComments(read('css/base.css'));
  assert.match(css, /@starting-style\s*\{[^@]*\.modal-overlay\.sd-overlay\b/);
  const closing = css.match(/\.modal-overlay\.sd-overlay\[data-closing\]\s*\{([^}]*)\}/);
  assert.ok(closing, 'нет правила выхода .sd-overlay[data-closing]');
  assert.match(closing[1], /pointer-events:\s*none/, 'закрывающийся лист ловит повторный тап');
});

for (const rel of MIGRATED) {
  test(`${rel}: оверлеи на .sd-overlay, без rAF/visible и таймера снятия`, () => {
    const src = stripJsComments(read(rel));
    const classNames = [...src.matchAll(/\.className\s*=\s*['"`]([^'"`]*\bmodal-overlay\b[^'"`]*)['"`]/g)];
    assert.ok(classNames.length > 0, 'в файле не найдено ни одного .modal-overlay');
    for (const [, cls] of classNames) {
      assert.match(cls, /\bsd-overlay\b/, `оверлей "${cls}" не на рецепте MO-2`);
    }
    assert.doesNotMatch(src, /classList\.add\(\s*['"]visible['"]\s*\)/, 'мёртвый .visible вернулся');
    assert.doesNotMatch(src, /setTimeout\(\s*\(\)\s*=>\s*\w+\.remove\(\)/, 'снятие по таймеру вместо dismissOverlay');
  });
}

test('модификатор листа с padding-bottom учитывает --sheet-tail', () => {
  const jsFiles = readdirSync(path.join(REPO_ROOT, 'js'), { recursive: true })
    .filter((f) => String(f).endsWith('.js'))
    .map((f) => path.join('js', String(f)));
  const sheetClasses = new Set(['modal-sheet']);
  for (const rel of jsFiles) {
    for (const [, rest] of read(rel).matchAll(/class="modal-sheet\s+([^"$]+)"/g)) {
      for (const c of rest.split(/\s+/)) if (/-sheet$/.test(c)) sheetClasses.add(c);
    }
  }
  assert.ok(sheetClasses.size > 1, 'не нашёл ни одного модификатора .modal-sheet — сломан парсер');

  const offenders = [];
  const cssDir = path.join(REPO_ROOT, 'css');
  for (const file of readdirSync(cssDir).filter((f) => f.endsWith('.css'))) {
    const css = stripCssComments(readFileSync(path.join(cssDir, file), 'utf8'));
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selectors, body] = m;
      if (!/(^|;|\s)padding(-bottom)?\s*:/.test(body) || body.includes('--sheet-tail')) continue;
      const hit = selectors.split(',').some((sel) => {
        const last = sel.trim().split(/[\s>+~]+/).pop() ?? '';
        return [...sheetClasses].some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(last));
      });
      const line = css.slice(0, m.index + selectors.length).split('\n').length;
      if (hit) offenders.push(`${file}:${line} ${selectors.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'padding листа без --sheet-tail — отступ уходит под край экрана');
});
