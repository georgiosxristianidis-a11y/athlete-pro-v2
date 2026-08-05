// @ts-check
// BW-TOGGLE — упражнение со своим весом получает isBW из библиотеки, а не
// наглухо прошитый false. До этой правки _addLiveExercise ставил false всегда,
// и добавленные вживую подтягивания показывались как «0» вместо «BW».
//
// Гард завершения сета (`canCompleteSet`) снят 2026-08-05 по решению Gio —
// ноль больше ничего не запрещает. Тесты связки с гардом уехали вместе с ним
// (файл test/set-completion-guard.test.js удалён), но инварианты сида,
// которые он охранял, живут здесь: isBW по-прежнему решает, как читается ноль.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBodyweightExercise, buildSession, PPL_GIO_PLAN } from '../js/workout.store.js';

/** Минимальный localStorage на Map — стор пишет туда при buildSession. */
function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(mockStorage);

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

// ── инварианты сида: ради этого предикат и существует ───────────────────────

const allSeedExercises = () => {
  const out = [];
  for (const week of Object.values(PPL_GIO_PLAN)) {
    for (const day of Object.values(week)) out.push(...day);
  }
  return out;
};

test('PPL_GIO_PLAN — каждое noDb (кор/чеклист) упражнение размечено isBW', () => {
  for (const ex of allSeedExercises()) {
    if (ex.noDb) {
      assert.equal(ex.isBW, true, `${ex.name} — noDb, но не isBW: ноль покажется как «0» вместо «BW»`);
    }
  }
});

test('buildSession — пресет-фолбэк доносит isBW до каждого упражнения', () => {
  const session = buildSession('push');
  const byName = new Map(session.map((e) => [e.name, e]));
  const dips = byName.get('Dips (Chest Focus)');
  assert.ok(dips, 'сид-упражнение потерялось из сессии');
  assert.equal(dips.isBW, true);
  const bench = byName.get('Bench Press');
  assert.ok(bench);
  assert.equal(bench.isBW, false);
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
