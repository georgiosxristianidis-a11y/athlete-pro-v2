// @ts-check
// UX-1c — вес протягивается вниз по незакрытым нетронутым подходам (аудит 14.11, №3).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fillWeightDown } = await import('../js/workout.view/weight-fill.js');

const s = (weight, done = false, wSet = false) => ({ weight, reps: 8, done, ...(wSet ? { wSet } : {}) });

test('пустая база: 60 в первом — второй и третий получают 60', () => {
  const sets = [s(60), s(0), s(0)];
  assert.deepEqual(fillWeightDown(sets, 0), [1, 2]);
  assert.deepEqual(sets.map((x) => x.weight), [60, 60, 60]);
  assert.equal(sets[0].wSet, true, 'исходный подход помечен тронутым');
  assert.equal(sets[1].wSet, undefined, 'протянутый — не тронутый: следующая правка выше его поведёт');
});

test('вверх не тянет, закрытый подход останавливает протяжку', () => {
  const sets = [s(40), s(60), s(60, true), s(60)];
  assert.deepEqual(fillWeightDown(sets, 1), []);
  sets[1].weight = 62.5;
  assert.deepEqual(fillWeightDown(sets, 1), []);
  assert.deepEqual(sets.map((x) => x.weight), [40, 62.5, 60, 60]);
});

test('тронутый рукой подход и всё ниже него не переписываются', () => {
  const sets = [s(60), s(0), s(0), s(0)];
  fillWeightDown(sets, 0);
  sets[2].weight = 70;
  fillWeightDown(sets, 2);
  sets[0].weight = 57.5;
  assert.deepEqual(fillWeightDown(sets, 0), [1]);
  assert.deepEqual(sets.map((x) => x.weight), [57.5, 57.5, 70, 70]);
});

test('пограничные входы: нет подхода — ничего', () => {
  assert.deepEqual(fillWeightDown([], 0), []);
  assert.deepEqual(fillWeightDown(/** @type {any} */ (undefined), 0), []);
});
