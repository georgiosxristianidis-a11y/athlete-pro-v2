// @ts-check
/**
 * SWAP-1a — группы замены и логика замены в сторе (решения Gio 07.11). UI, флаг, локали — SWAP-1b (test/swap-1-ui.test.js).
 * Новый код пока нигде не вызывается из UI.
 * API — SWAP-1-checkpoint-2.md (заметки сессии).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = /** @type {any} */ ({
  addEventListener() {},
  removeEventListener() {},
  body: { style: {} },
  getElementById: () => null,
  querySelector: () => null,
});
Object.defineProperty(globalThis, 'window', {
  value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  writable: true,
  configurable: true,
});
globalThis.localStorage = /** @type {any} */ ({ getItem: () => null, setItem() {}, removeItem() {} });


const { swapAnalogs, hasAnalogs, swapTraits, SWAP_GROUPS } = await import('../js/shared/swap-groups.js');
const { getExercise } = await import('../js/shared/exercise-registry.js');
const { swapExercise, undoSwap, lastWorkingWeight } = await import('../js/workout.store.js');

describe('SWAP-1: группы замены (шире семейства, решение 1)', () => {
  test('жим грудью: четыре упражнения заменяют друг друга', () => {
    const chest = ['Bench Press', 'Dumbbell Bench Press', 'Incline DB Press', 'Machine Chest Press'];
    for (const n of chest) {
      assert.deepEqual([...swapAnalogs(n)].sort(), chest.filter((x) => x !== n).sort(), n);
      assert.equal(hasAnalogs(n), true);
    }
  });
  test('алиас реестра даёт ту же группу; одиночка и неизвестное имя — пусто (решение 4)', () => {
    assert.ok(swapAnalogs('Barbell Bench Press').includes('Incline DB Press'));
    assert.deepEqual(swapAnalogs('Pec Deck Fly'), []);
    assert.deepEqual(swapAnalogs('Моё упражнение'), []);
    assert.equal(hasAnalogs('Моё упражнение'), false);
  });
});

/** @param {string} name @param {Array<[number, boolean]>} sets @param {object} [extra] */
const mk = (name, sets, extra = {}) => ({
  name,
  isBW: false,
  isUnilateral: false,
  sets: sets.map(([weight, done]) => ({ weight, reps: 8, done })),
  ...extra,
});
const hist = (/** @type {string} */ name, /** @type {number} */ weight, /** @type {number} */ timestamp) => ({
  timestamp,
  exercises: [{ name, sets: [{ weight, reps: 8, done: true }] }],
});

describe('SWAP-1: вес и подходы при замене (решения 2-3)', () => {
  test('lastWorkingWeight: верх поднятого веса новейшей сессии, нет истории — null', () => {
    const w = [hist('Incline DB Press', 24, 1), hist('Incline DB Press', 28, 2)];
    assert.equal(lastWorkingWeight(w, ['Incline DB Press']), 28);
    assert.equal(lastWorkingWeight(w, ['Machine Chest Press']), null);
  });
  test('невыполненные получают вес НОВОГО из истории; штанга на гантели вес не переносит', () => {
    const plan = [mk('Bench Press', [[80, false], [80, false]])];
    const r = swapExercise(plan, 0, 'Incline DB Press', [hist('Incline DB Press', 28, 5)]);
    assert.equal(r?.ei, 0);
    assert.equal(plan[0].name, 'Incline DB Press');
    assert.deepEqual(plan[0].sets.map((s) => s.weight), [28, 28]);
    assert.equal(plan[0].isUnilateral, true);
  });
  test('нет истории у нового — пусто (0), а не 80 штанги', () => {
    const plan = [mk('Bench Press', [[80, false]])];
    swapExercise(plan, 0, 'Machine Chest Press', []);
    assert.equal(plan[0].sets[0].weight, 0);
  });
  test('выполненные остаются за исходным упражнением, меняются только невыполненные', () => {
    const plan = [mk('Bench Press', [[80, true], [80, false], [80, false]])];
    const r = swapExercise(plan, 0, 'Incline DB Press', [hist('Incline DB Press', 28, 5)]);
    assert.equal(r?.ei, 1);
    assert.equal(plan.length, 2);
    assert.equal(plan[0].name, 'Bench Press');
    assert.deepEqual(plan[0].sets.map((s) => [s.weight, s.done]), [[80, true]]);
    assert.equal(plan[1].name, 'Incline DB Press');
    assert.deepEqual(plan[1].sets.map((s) => s.weight), [28, 28]);
  });
  test('ручная правка барабана не трогается (вес ≠ coachWeight)', () => {
    const plan = [mk('Bench Press', [[80, false], [85, false]], { coachWeight: 80 })];
    swapExercise(plan, 0, 'Incline DB Press', [hist('Incline DB Press', 28, 5)]);
    assert.deepEqual(plan[0].sets.map((s) => s.weight), [28, 85]);
  });
  test('«вернуть» возвращает имя и вес; при расщеплении склеивает карточки', () => {
    const plan = [mk('Bench Press', [[80, false], [80, false]], { coachWeight: 80 })];
    const r = swapExercise(plan, 0, 'Incline DB Press', [hist('Incline DB Press', 28, 5)]);
    assert.equal(undoSwap(plan, r?.ei ?? 0), 0);
    assert.equal(plan[0].name, 'Bench Press');
    assert.deepEqual(plan[0].sets.map((s) => s.weight), [80, 80]);
    assert.equal(plan[0].isUnilateral, false);
    assert.equal(plan[0].coachWeight, 80);

    const split = [mk('Bench Press', [[80, true], [80, false]])];
    const r2 = swapExercise(split, 0, 'Incline DB Press', []);
    undoSwap(split, r2?.ei ?? 0);
    assert.equal(split.length, 1);
    assert.deepEqual(split[0].sets.map((s) => [s.weight, s.done]), [[80, true], [80, false]]);
  });
  test('замена на то же имя или вне группы — null, план не тронут', () => {
    const plan = [mk('Bench Press', [[80, false]])];
    assert.equal(swapExercise(plan, 0, 'Bench Press', []), null);
    assert.equal(swapExercise(plan, 0, 'Pec Deck Fly', []), null);
    assert.equal(plan[0].sets[0].weight, 80);
  });
});


describe('SWAP-1a: целостность групп и свойства снаряда', () => {
  test('каждый id группы есть в реестре и несёт каноническое имя; групп без пары нет', () => {
    for (const g of SWAP_GROUPS) {
      assert.ok(g.length >= 2, g.join());
      for (const id of g) assert.ok(getExercise(id)?.names[0], id);
    }
    const all = SWAP_GROUPS.flat();
    assert.equal(new Set(all).size, all.length, 'вариант не состоит в двух группах');
  });
  test('swapTraits: штанга/гантели/свой вес; гантели = на одну руку', () => {
    assert.deepEqual(swapTraits('Bench Press'), { kind: 'barbell', isBW: false, isUnilateral: false });
    assert.deepEqual(swapTraits('Incline DB Press'), { kind: 'dumbbell', isBW: false, isUnilateral: true });
    assert.deepEqual(swapTraits('Pull-Up'), { kind: 'bodyweight', isBW: true, isUnilateral: false });
    assert.equal(swapTraits('Моё упражнение'), null);
  });
  test('замена на подтягивания ставит isBW, «вернуть» его снимает', () => {
    const plan = [mk('Lat Pulldown', [[50, false]])];
    swapExercise(plan, 0, 'Pull-Up', []);
    assert.equal(plan[0].isBW, true);
    undoSwap(plan, 0);
    assert.equal(plan[0].isBW, false);
    assert.equal(plan[0].sets[0].weight, 50);
  });
  test('алиасы прежнего упражнения не остаются на карточке-замене и возвращаются', () => {
    const plan = [mk('Incline DB Press', [[24, false]], { alias: ['Incline Dumbbell Press'] })];
    swapExercise(plan, 0, 'Bench Press', []);
    assert.equal(plan[0].alias, undefined);
    undoSwap(plan, 0);
    assert.deepEqual(plan[0].alias, ['Incline Dumbbell Press']);
  });
  test('нельзя вернуть, когда в замене есть выполненный подход; след в ответе: имя, вес, «было»', () => {
    const plan = [mk('Bench Press', [[80, false], [80, false]])];
    const r = swapExercise(plan, 0, 'Dumbbell Bench Press', [hist('Dumbbell Bench Press', 30, 3)]);
    assert.equal(r?.name, 'Dumbbell Bench Press');
    assert.equal(r?.weight, 30);
    assert.equal(r?.trace.was, 80);
    assert.equal(r?.trace.from.name, 'Bench Press');
    plan[0].sets[0].done = true;
    assert.equal(undoSwap(plan, 0), -1);
    assert.equal(plan[0].name, 'Dumbbell Bench Press');
  });
  test('нет истории — weight: null («введи вес»)', () => {
    const plan = [mk('Bench Press', [[80, false]])];
    assert.equal(swapExercise(plan, 0, 'Machine Chest Press', [])?.weight, null);
  });
});
