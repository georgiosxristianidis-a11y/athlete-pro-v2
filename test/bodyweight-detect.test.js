// @ts-check
// BW-TOGGLE — упражнение со своим весом получает isBW из библиотеки, а не
// наглухо прошитый false. До этой правки _addLiveExercise ставил false всегда,
// и добавленные вживую подтягивания не закрывались без веса: их резал гард
// canCompleteSet (см. test/set-completion-guard.test.js). Здесь проверяется
// предикат-угадыватель и то, что его результат действительно снимает гард.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBodyweightExercise, canCompleteSet } from '../js/workout.store.js';

const LIB = [
  { name: 'Pull-up', nameRu: 'Подтягивания', equipment: 'bodyweight' },
  { name: 'Barbell Bench Press', nameRu: 'Жим штанги лёжа', equipment: 'barbell' },
  { name: 'Cable Fly', nameRu: '', equipment: 'cable' },
];

// ── предикат ────────────────────────────────────────────────────────────────

test('isBodyweightExercise — находит по английскому имени', () => {
  assert.equal(isBodyweightExercise('Pull-up', LIB), true);
});

test('isBodyweightExercise — находит по русскому имени (пикер отдаёт то, что видел пользователь)', () => {
  assert.equal(isBodyweightExercise('Подтягивания', LIB), true);
});

test('isBodyweightExercise — регистр и пробелы по краям не мешают', () => {
  assert.equal(isBodyweightExercise('  pull-UP  ', LIB), true);
});

test('isBodyweightExercise — снарядное упражнение не считается BW', () => {
  assert.equal(isBodyweightExercise('Barbell Bench Press', LIB), false);
});

test('isBodyweightExercise — незнакомое (кастомное) имя даёт false, а не бросает', () => {
  assert.equal(isBodyweightExercise('Моё упражнение', LIB), false);
});

test('isBodyweightExercise — пустое имя и битая библиотека дают false', () => {
  assert.equal(isBodyweightExercise('', LIB), false);
  assert.equal(isBodyweightExercise('Pull-up', /** @type {any} */ (null)), false);
  assert.equal(isBodyweightExercise(/** @type {any} */ (null), LIB), false);
  assert.equal(isBodyweightExercise('Pull-up', /** @type {any} */ ([null, undefined])), false);
});

test('isBodyweightExercise — пустой nameRu не матчится пустым запросом', () => {
  // 'Cable Fly' имеет nameRu: '' — запрос '' не должен на него попасть
  assert.equal(isBodyweightExercise('   ', LIB), false);
});

// ── связка с гардом: ради этого предикат и существует ───────────────────────

test('угаданный isBW снимает гард завершения сета на 0 кг', () => {
  const name = 'Pull-up';
  const ex = { isBW: isBodyweightExercise(name, LIB) };
  assert.equal(ex.isBW, true);
  assert.equal(canCompleteSet(ex, { done: false, weight: 0 }), true);
});

test('для снарядного упражнения гард остаётся на месте', () => {
  const ex = { isBW: isBodyweightExercise('Barbell Bench Press', LIB) };
  assert.equal(canCompleteSet(ex, { done: false, weight: 0 }), false);
  assert.equal(canCompleteSet(ex, { done: false, weight: 40 }), true);
});

// ── реальная библиотека: разметка должна быть на месте ──────────────────────

test('exercises-library.json — bodyweight размечен и предикат его видит', () => {
  const lib = JSON.parse(readFileSync(new URL('../exercises-library.json', import.meta.url), 'utf8'));
  const list = lib.exercises;
  assert.ok(Array.isArray(list) && list.length > 0, 'библиотека пуста');

  const bw = list.filter(e => e.equipment === 'bodyweight');
  assert.ok(bw.length > 0, 'ни одного bodyweight — правка потеряла бы смысл');

  // каждое размеченное упражнение действительно опознаётся по своему имени
  for (const e of bw) {
    assert.equal(isBodyweightExercise(e.name, list), true, e.name);
  }
  // и ни одно штанговое не опознаётся как BW
  for (const e of list.filter(x => x.equipment === 'barbell')) {
    assert.equal(isBodyweightExercise(e.name, list), false, e.name);
  }
});
