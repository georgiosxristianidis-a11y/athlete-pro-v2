// @ts-check
// COACH-ONE — одна цифра веса на карточке упражнения. Пилюля тренера раньше
// считала свой вес (первый подход прошлой сессии × 1.025), и при разминке
// 40 + рабочих 60×10 показывала 40 кг, пока барабан и Home стояли на 62.5.
// Теперь пилюля читает то же решение, что барабан: nextWeightFor.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Minimal Map-backed localStorage — стор пишет туда на загрузке модуля. */
const m = new Map();
globalThis.localStorage = {
  getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => {
    m.set(k, String(v));
  },
  removeItem: (k) => {
    m.delete(k);
  },
  clear: () => m.clear(),
};

const { coachPillWeight, nextWeightFor, buildSession } = await import('../js/workout.store.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 7, 12);
const set = (weight, reps, done = true) => ({ weight, reps, done });
const session = (daysAgo, name, sets) => ({
  timestamp: NOW - daysAgo * DAY,
  exercises: [{ name, sets }],
});

/** Сессионное упражнение, каким его отдаёт buildSession в State.plan. */
const sessionEx = (name, reps, extra = {}) => ({
  name,
  isUnilateral: false,
  sets: [set(0, reps, false), set(0, reps, false)],
  ...extra,
});

describe('COACH-ONE: пилюля = nextWeightFor', () => {
  test('разминка 40 + рабочие 60×10: пилюля равна весу барабана, а не 40', () => {
    const workouts = [session(3, 'Bench Press', [set(40, 10), set(60, 10), set(60, 10)])];
    const ex = sessionEx('Bench Press', 10);
    const drum = nextWeightFor({ name: 'Bench Press', reps: 10 }, workouts, NOW).weight;
    assert.equal(drum, 62.5);
    assert.equal(coachPillWeight(ex, workouts, NOW), drum);
  });

  test('пилюля совпадает с весом, который buildSession ставит в барабан', () => {
    const workouts = [session(3, 'Bench Press', [set(40, 10), set(60, 10), set(60, 10)])];
    const built = buildSession('push', { workouts, now: NOW })[0];
    const ex = sessionEx(built.name, built.sets[0].reps);
    assert.equal(coachPillWeight(ex, workouts, NOW), built.sets[0].weight);
  });

  test('гантели (шаг 2): пилюля на сетке барабана, не на сетке 2.5', () => {
    const workouts = [session(3, 'Dumbbell Curl', [set(14, 10), set(14, 10)])];
    const ex = sessionEx('Dumbbell Curl', 10, { isUnilateral: true });
    const w = coachPillWeight(ex, workouts, NOW);
    assert.equal(w, 16);
    assert.equal(w, nextWeightFor({ name: 'Dumbbell Curl', reps: 10, isUnilateral: true }, workouts, NOW).weight);
  });

  test('цель по повторам не взята: вес держится, пилюля показывает его же', () => {
    const workouts = [session(3, 'Bench Press', [set(60, 6), set(60, 6)])];
    assert.equal(coachPillWeight(sessionEx('Bench Press', 10), workouts, NOW), 60);
  });

  test('нет истории — нет пилюли', () => {
    assert.equal(coachPillWeight(sessionEx('Bench Press', 10), [], NOW), null);
  });

  test('только невыполненные подходы — нет пилюли', () => {
    const workouts = [session(3, 'Bench Press', [set(60, 10, false)])];
    assert.equal(coachPillWeight(sessionEx('Bench Press', 10), workouts, NOW), null);
  });
});

describe('COACH-ONE: решение buildSession едет в элемент плана', () => {
  const workouts = [session(3, 'Bench Press', [set(40, 8), set(60, 8), set(60, 8)])];

  test('элемент несёт coachWeight = вес, который buildSession поставил в барабан', () => {
    const built = buildSession('push', { workouts, now: NOW })[0];
    assert.equal(built.name, 'Bench Press');
    assert.equal(built.coachWeight, built.sets[0].weight);
    assert.equal(coachPillWeight(built, workouts, NOW), built.coachWeight);
  });

  test('история под старым именем (alias): пилюля не прячется, как и барабан', () => {
    const old = [session(3, 'Flat Barbell Bench Press', [set(60, 8), set(60, 8)])];
    const built = buildSession('push', { workouts: old, now: NOW })[0];
    assert.equal(built.sets[0].weight, 62.5);
    assert.equal(coachPillWeight(built, old, NOW), 62.5);
  });

  test('правка повторов первого подхода пилюлю не двигает', () => {
    const built = buildSession('push', { workouts, now: NOW })[0];
    const before = coachPillWeight(built, workouts, NOW);
    built.sets[0].reps = 3;
    assert.equal(coachPillWeight(built, workouts, NOW), before);
  });

  test('без поля (добавлено вживую, старый снимок) — пересчёт по имени', () => {
    const live = sessionEx('Bench Press', 8);
    assert.equal(coachPillWeight(live, workouts, NOW), 62.5);
  });

  test('нет истории — buildSession поля не пишет', () => {
    const built = buildSession('push', { workouts: [], now: NOW })[0];
    assert.ok(!('coachWeight' in built));
  });

  test('замена упражнения сбрасывает coachWeight в обоих местах modals.js', () => {
    const modals = read('js/workout.view/modals.js');
    assert.equal((modals.match(/delete State\.plan\[ei\]\.coachWeight/g) || []).length, 2);
  });
});

describe('COACH-ONE: проводка', () => {
  test('карточка берёт вес пилюли из coachPillWeight, старый расчёт снят', () => {
    const render = read('js/workout.view/render.js');
    assert.match(render, /coachPillWeight\(ex, workouts\)/);
    assert.ok(!render.includes('_computeCoachTarget'), '_computeCoachTarget должен быть снят');
    assert.ok(!render.includes('_getLastSessionWeight'), '_getLastSessionWeight должен быть снят');
  });

  test('пилюля рисуется из веса, а не из объекта { target, last }', () => {
    const render = read('js/workout.view/render.js');
    assert.ok(!/coach\.target/.test(render), 'coach.target — след старого объекта');
  });

  test('мёртвый setRPE снят из handlers и фасада', () => {
    assert.ok(!/\bsetRPE\b/.test(read('js/workout.view/handlers.js')));
    assert.ok(!/\bsetRPE\b/.test(read('js/workout.view.js')));
  });

  test('строки «last × 1.025» нет в типах', () => {
    assert.ok(!read('js/types.d.ts').includes('1.025'));
  });
});
