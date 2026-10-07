/**
 * LOGGER-FOCUS — полевой разбор 2026-10-05.
 *
 * 1. Молния (Турбо) не нужна на карточке каждого упражнения — переехала в меню «три точки».
 * 2. Секции тренировки открываются по мере прохода: раскрыто одно текущее упражнение,
 *    остальные свёрнуты до шапки. Гард читает исходники (как a11y-f11): правка рендера
 *    без правки автоперехода зеленела бы, пока экран снова разворачивает всё сразу.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const render = read('js/workout.view/render.js');
const handlers = read('js/workout.view/handlers.js');

describe('LOGGER-FOCUS: молния в меню', () => {
  test('в шапке карточки нет кнопки Турбо', () => {
    assert.doesNotMatch(render, /data-action="wo:smartCoach"/);
    assert.doesNotMatch(render, /ex-action-btn coach/);
  });

  test('меню «три точки» зовёт smartCoach по первому недоделанному подходу', () => {
    const menu = handlers.slice(handlers.indexOf('export async function showExerciseMenu'));
    assert.match(menu, /label:\s*t\('train\.smart_coach'\)/);
    assert.match(menu, /smartCoach\(ei,\s*turboSi\)/);
    assert.match(menu, /findIndex\(\(s\)\s*=>\s*!s\.done\)/);
  });
});

describe('LOGGER-FOCUS: раскрыто одно упражнение', () => {
  test('renderActive раскрывает только упражнение в фокусе', () => {
    assert.match(render, /const focusEi = focusExerciseIndex\(\)/);
    assert.match(render, /renderExerciseCard\(ex, ei, workouts, ei === focusEi\)/);
  });

  test('карточка берёт раскрытость из аргумента, не из «есть недоделанные»', () => {
    assert.match(render, /sets-wrap-\$\{ei\}" style="display:\$\{open \? 'block' : 'none'\}"/);
  });

  test('фокус — первое упражнение с недоделанным подходом', () => {
    // FIELD-1: «недоделанное» — единый предикат isPending (пропущенное фокус
    // не получает); сам предикат обязан проверять незакрытые подходы.
    assert.match(render, /findIndex\(\(ex, i\) => i > after && isPending\(ex\)\)/);
    const store = read('js/workout.store.js');
    const fn = store.slice(store.indexOf('export function isPending'));
    assert.match(fn, /return !ex\?\.skipped && \(ex\?\.sets \|\| \[\]\)\.some\(\(s\) => !s\.done\);/);
  });

  test('toggleCard — аккордеон: открытие сворачивает остальные', () => {
    const fn = handlers.slice(handlers.indexOf('export function toggleCard'));
    assert.match(fn, /_setCardOpen\(i, false\)/);
  });

  test('закрыл упражнение — раскрывается следующее', () => {
    assert.match(handlers, /focusExerciseIndex\(ei\)/);
    assert.match(handlers, /_setCardOpen\(target, true\)/);
  });
});
