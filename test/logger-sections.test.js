/**
 * LOG-SEC-1 — секционный режим сет-логгера.
 *
 * Логика секций (кто открыт, кто следом) — чистые функции, их проверяем
 * напрямую. Проводку (флаг, экшен, автопереход) гард читает из исходников, как
 * logger-focus: правка рендера без правки автоперехода зеленела бы, пока экран
 * ведёт себя по-старому. Поведение на экране — test/e2e/logger-sections.spec.js.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OTHER_BLOCK,
  sectionList,
  focusInSection,
  nextSection,
  initialSection,
} from '../js/shared/logger-sections.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** exercise: block, массив done-флагов подходов */
const ex = (block, ...done) => ({ block, sets: done.map((d) => ({ done: d })) });

describe('LOG-SEC-1: sectionList', () => {
  test('секции идут в порядке первого появления блока, упражнения — в порядке плана', () => {
    const plan = [ex('power', false), ex('shape', false), ex('power', false), ex('core', false)];
    const secs = sectionList(plan);
    assert.deepEqual(secs.map((s) => s.id), ['power', 'shape', 'core']);
    assert.deepEqual(secs[0].eis, [0, 2]);
  });

  test('упражнение без блока уходит в OTHER_BLOCK, а не теряется', () => {
    const secs = sectionList([ex('power', true), { sets: [{ done: false }] }]);
    assert.deepEqual(secs.map((s) => s.id), ['power', OTHER_BLOCK]);
  });

  test('итоги: doneEx считает упражнения, закрытые целиком; anyDone — хоть один подход', () => {
    const [sec] = sectionList([ex('power', true, true), ex('power', true, false), ex('power', false)]);
    assert.equal(sec.total, 3);
    assert.equal(sec.doneEx, 1);
    assert.equal(sec.anyDone, true);
    assert.equal(sec.allDone, false);
  });

  test('allDone — все упражнения секции закрыты; пустой план — пустой список', () => {
    assert.equal(sectionList([ex('power', true), ex('power', true, true)])[0].allDone, true);
    assert.deepEqual(sectionList([]), []);
  });
});

describe('LOG-SEC-1: focusInSection', () => {
  const plan = [ex('a', true), ex('a', false), ex('b', false), ex('a', false)];
  const [a] = sectionList(plan);

  test('первое недоделанное упражнение секции', () => {
    assert.equal(focusInSection(a, plan), 1);
  });

  test('after — строго после индекса, чужие секции не мешают', () => {
    assert.equal(focusInSection(a, plan, 1), 3);
  });

  test('после последнего — пропущенное выше по секции', () => {
    assert.equal(focusInSection(a, plan, 3), 1);
  });

  test('сделано всё — -1', () => {
    const done = [ex('a', true), ex('a', true)];
    assert.equal(focusInSection(sectionList(done)[0], done), -1);
  });
});

describe('LOG-SEC-1: nextSection / initialSection', () => {
  test('следующая по порядку с работой, закрытые пропускаются', () => {
    const secs = sectionList([ex('a', false), ex('b', true), ex('c', false)]);
    assert.equal(nextSection(secs, 'a')?.id, 'c');
  });

  test('дальше секций нет — первая пропущенная выше', () => {
    const secs = sectionList([ex('a', false), ex('b', true), ex('c', true)]);
    assert.equal(nextSection(secs, 'c')?.id, 'a');
  });

  test('сама уходящая секция не кандидат, всё закрыто — null', () => {
    const secs = sectionList([ex('a', true), ex('b', true)]);
    assert.equal(nextSection(secs, 'b'), null);
    const open = sectionList([ex('a', false)]);
    assert.equal(nextSection(open, 'a'), null);
  });

  test('initialSection — первая секция с недоделанным; всё закрыто — null', () => {
    assert.equal(initialSection(sectionList([ex('a', true), ex('b', false)]))?.id, 'b');
    assert.equal(initialSection(sectionList([ex('a', true)])), null);
  });
});

describe('LOG-SEC-1: проводка', () => {
  const render = read('js/workout.view/render.js');
  const handlers = read('js/workout.view/handlers.js');
  const sections = read('js/workout.view/sections.js');
  const flags = read('js/flags.js');

  test("флаг 'logger-sections' заведён в DEFAULTS и по умолчанию ON", () => {
    assert.match(flags, /'logger-sections':\s*true/);
  });

  test('режим включает флаг, читается он в sectionsEnabled', () => {
    assert.match(sections, /flag\('logger-sections'\)/);
  });

  test('renderActive уходит в секции только когда режим включён, иначе прежний список', () => {
    assert.match(render, /if \(sectionsEnabled\(\)\)\s*\{\s*return renderSections\(/);
    assert.match(render, /renderExerciseCard\(ex, ei, workouts, ei === focusEi\)/);
  });

  test('тап по строке секции и «Дальше» — один экшен wo:openSection', () => {
    assert.match(render, /on\('wo:openSection'/);
    assert.equal((render.match(/data-action="wo:openSection"/g) || []).length, 2);
  });

  test('автопереход toggleSet в секционном режиме зовёт advanceFromExercise, через те же 500 мс', () => {
    const fn = handlers.slice(handlers.indexOf('export async function toggleSet'));
    assert.match(fn, /if \(sectionsRendered\(\)\)\s*\{\s*advanceFromExercise\(ei\)/);
    assert.match(fn, /\}, 500\)/);
  });

  test('итоги в строках обновляются после каждого подхода', () => {
    const fn = handlers.slice(handlers.indexOf('export async function toggleSet'));
    assert.match(fn, /syncSections\(\)/);
  });

  test('упражнение, добавленное на лету, открывает свою секцию', () => {
    assert.match(handlers, /openSection\('custom'\)/);
  });
});
