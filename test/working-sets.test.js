// WSET-1: в аналитику идут только рабочие подходы силовых упражнений.
// Подводящие (авто: ведущие подходы легче 60% топ-веса; вручную: set.warmup)
// и пресс/поясница вне счёта. До правила значок «1 тонна» открывался с
// первой сессии: тоннаж нёс разминку и любое добавленное вручную на пресс.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  warmupFlags,
  workingTonnage,
  sessionWorkingTonnage,
  isExcludedExercise,
  plannedWarmupFlags,
} from '../js/shared/working-sets.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, done: true, ...extra });

test('ведущие лёгкие подходы — подводящие, рабочие и откат после топа — нет', () => {
  const sets = [set(40, 10), set(60, 5), set(100, 8), set(100, 8), set(50, 12)];
  assert.deepEqual(warmupFlags(sets), [true, false, false, false, false]);
});

test('подпись по плану: «W» до того, как рабочие подходы закрыты', () => {
  const sets = [set(40, 10), set(100, 8, { done: false }), set(100, 8, { done: false })];
  assert.deepEqual(warmupFlags(sets), [false, false, false]);
  assert.deepEqual(plannedWarmupFlags(sets), [true, false, false]);
  assert.deepEqual(plannedWarmupFlags([set(40, 10, { warmup: false }), set(100, 8)]), [false, false]);
});

test('ручная метка бьёт авто в обе стороны', () => {
  const sets = [set(40, 10, { warmup: false }), set(80, 5, { warmup: true }), set(100, 8)];
  assert.deepEqual(warmupFlags(sets), [false, true, false]);
});

test('тоннаж упражнения без подводящих, одностороннее ×2', () => {
  const ex = { name: 'Bench Press', sets: [set(40, 10), set(100, 8), set(100, 8)] };
  assert.equal(workingTonnage(ex), 1600);
  assert.equal(workingTonnage({ ...ex, isUnilateral: true }), 3200);
});

test('неподнятые подходы не в счёте', () => {
  const ex = { name: 'Leg Press', sets: [set(200, 10), set(200, 10, { done: false }), set(200, 0)] };
  assert.equal(workingTonnage(ex), 2000);
});

test('пресс и поясница вне аналитики — по блоку и по имени', () => {
  for (const ex of [
    { name: 'Hyperextensions', block: 'core' },
    { name: 'Cable Crunch' },
    { name: 'Back Extension (Hyperextension)' },
    { name: 'Гиперэкстензия' },
    { name: 'Скручивания на блоке' },
    { name: 'Plank', block: 'align' },
  ]) {
    assert.equal(isExcludedExercise(ex), true, ex.name);
  }
  assert.equal(isExcludedExercise({ name: 'Leg Press', block: 'heavy' }), false);
  assert.equal(workingTonnage({ name: 'Weighted Crunch', sets: [set(40, 15)] }), 0);
});

test('сессия: сумма рабочих; запись без exercises держит сохранённый тоннаж', () => {
  const w = {
    tonnage: 9999,
    exercises: [
      { name: 'Bench Press', isUnilateral: false, sets: [set(40, 10), set(100, 8)] },
      { name: 'Hyperextensions', isUnilateral: false, sets: [set(20, 15)] },
    ],
  };
  assert.equal(sessionWorkingTonnage(w), 800);
  assert.equal(sessionWorkingTonnage({ tonnage: 5000 }), 5000);
});

test('новая запись: гантели ×2 по сохранённому isUnilateral', () => {
  const w = {
    tonnage: 0,
    exercises: [
      { name: 'Bench Press', isUnilateral: false, sets: [set(40, 10), set(100, 8)] },
      { name: 'Hammer Curl', isUnilateral: true, sets: [set(16, 10), set(16, 10)] },
    ],
  };
  assert.equal(sessionWorkingTonnage(w), 800 + 640);
});

test('старая запись без isUnilateral: гантели не срезаются вдвое', () => {
  // Сохранено при записи: жим 400+800, молотки (16·10·2)·2 = 640 → 1840.
  const w = {
    tonnage: 1840,
    exercises: [
      { name: 'Bench Press', sets: [set(40, 10), set(100, 8)] },
      { name: 'Hammer Curl', sets: [set(16, 10), set(16, 10)] },
    ],
  };
  // Доля рабочих ×1: (800 + 320) / (1200 + 320); ×2 у молотков сохранён в числе.
  assert.equal(sessionWorkingTonnage(w), Math.round(1840 * (1120 / 1520)));
  // Без подводящих и пресса — сохранённое число как есть.
  assert.equal(
    sessionWorkingTonnage({ tonnage: 640, exercises: [{ name: 'Hammer Curl', sets: [set(16, 10), set(16, 10)] }] }),
    640
  );
  assert.equal(sessionWorkingTonnage({ tonnage: 0, exercises: [{ name: 'Plank', sets: [set(0, 0)] }] }), 0);
});
