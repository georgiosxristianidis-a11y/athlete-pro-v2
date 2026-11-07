// @ts-check
/**
 * DATA-4 — мышцы в поиске упражнений (вариант B, Gio 07.11) за флагом `muscles-ui`.
 * Гард: при OFF разметка первого пикера прежняя побитно; при ON подчипы и лейблы живут
 * только в ветке флага. Второй пикер (замена, SWAP-1) не тронут.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flag, LAB_FLAGS } from '../js/flags.js';
import { muscleChipsFor, matchMuscle, subChipsHtml, toneOf } from '../js/workout.view/picker-muscles.js';

const read = (/** @type {string} */ p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const LIB = [
  { name: 'Bench Press', category: 'push', muscleGroup: 'chest' },
  { name: 'Incline Press', category: 'push', muscleGroup: 'chest' },
  { name: 'Overhead Press', category: 'push', muscleGroup: 'shoulders' },
  { name: 'Pushdown', category: 'push', muscleGroup: 'triceps' },
  { name: 'Burpee', category: 'push', muscleGroup: 'full body' },
  { name: 'Row', category: 'pull', muscleGroup: 'back' },
];

describe('DATA-4: флаг muscles-ui', () => {
  test('дефолт OFF, тумблер в Лаборатории', () => {
    assert.equal(flag('muscles-ui'), false);
    assert.ok(LAB_FLAGS.includes('muscles-ui'));
  });
  test('словарь Лаборатории есть во всех трёх языках', () => {
    for (const f of ['js/locale.store.js', 'js/locale.el.js']) {
      const src = read(f);
      assert.ok(src.includes("'lab.muscles-ui'"), `${f}: lab.muscles-ui`);
      assert.ok(src.includes("'lab.muscles-ui_sub'"), `${f}: lab.muscles-ui_sub`);
    }
    assert.equal(read('js/locale.store.js').split("'lab.muscles-ui'").length - 1, 2, 'en + ru в locale.store.js');
  });
});

describe('DATA-4: чистые функции подчипов', () => {
  test('«Все» — подчипов нет; push — chest первым, без full body', () => {
    assert.deepEqual(muscleChipsFor('all', LIB), []);
    const keys = muscleChipsFor('push', LIB).map((c) => c.key);
    assert.deepEqual(keys, ['chest', 'shoulders', 'triceps']);
  });
  test('matchMuscle: null не отбирает, иначе строгое равенство группы', () => {
    assert.equal(matchMuscle(LIB[0], null), true);
    assert.equal(matchMuscle(LIB[0], 'chest'), true);
    assert.equal(matchMuscle(LIB[2], 'chest'), false);
  });
  test('toneOf: PPL по категории, остальное — core', () => {
    assert.deepEqual(['push', 'pull', 'legs', 'core', 'cardio'].map(toneOf), ['push', 'pull', 'legs', 'core', 'core']);
  });
  test('subChipsHtml: пусто без чипов, data-muscle и active на выбранном', () => {
    assert.equal(subChipsHtml([], 'push', null), '');
    const html = subChipsHtml(muscleChipsFor('push', LIB), 'push', 'chest');
    assert.match(html, /ex-tone-push/);
    assert.match(html, /class="ex-mchip active" data-muscle="chest"/);
  });
});

describe('DATA-4: гард OFF в modals.js', () => {
  const src = read('js/workout.view/modals.js');
  const first = src.slice(src.indexOf('export async function openExercisePickerModal'), src.indexOf('export async function openReplaceExModal'));
  test('подчипы в шаблоне только под flag(muscles-ui)', () => {
    assert.match(first, /\$\{flag\('muscles-ui'\) \? '\\n\s+<div id="add-ex-sub"><\/div>' : ''\}/);
  });
  test('легаси-мета остаётся в else-ветке muscleOn', () => {
    assert.match(first, /\$\{muscleOn \? itemMetaHtml\(ex\) : `<div style="font-size:var\(--fs-1\)[^`]*text-transform:capitalize">\$\{esc\(ex\.muscleGroup\)\}/);
  });
  test('отбор по мышце — только при muscleOn, без него _libMatch как был', () => {
    assert.match(first, /muscleOn \? \(ex\) => baseMatch\(ex\) && matchMuscle\(ex, activeMuscle\) : baseMatch/);
  });
  test('второй пикер (замена) не знает про мышцы', () => {
    const second = src.slice(src.indexOf('export async function openReplaceExModal'));
    assert.doesNotMatch(second.slice(0, second.indexOf('\nexport ') > 0 ? second.indexOf('\nexport ') : undefined), /muscleOn|picker-muscles|add-ex-sub/);
  });
});

describe('DATA-4: CSS лейблов — только токены', () => {
  const css = read('css/workout.css');
  const block = css.slice(css.indexOf('.ex-tone-push'));
  test('есть блок и @supports color-mix', () => {
    assert.ok(css.includes('.ex-mchip'));
    assert.match(css, /@supports \(background: color-mix/);
  });
  test('в блоке ни сырого hex, ни rgba, ни px в font-size', () => {
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
    assert.doesNotMatch(block, /font-size:\s*\d+px/);
    assert.doesNotMatch(block, /font-weight:\s*\d{3}/);
  });
});
