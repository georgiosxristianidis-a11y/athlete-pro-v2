// @ts-check
// BUG-DRUM-OFFGRID (поле 2026-09-16, Gio): «выставляешь 20 кг — записывается 19».
//
// Ввод веса в тренировке один — барабан, и он ходит по сетке `min + i*step`:
// 2 кг у гантельных (isUnilateral), 2.5 у остальных. Вес МИМО узлов сетки
// барабан показать не может: он садится на ближайший индекс и с этого момента
// врёт — в окне «20», в State 19. Вне-сеточные веса рождал плоский бамп +2.5
// (автопрогресс и Турбо) поверх гантельного шага 2, а прежний дельта-коммит
// барабана сдвиг не гасил, а уносил дальше и сдавал в историю, откуда
// автопрогресс тянул его в следующую сессию.
//
// Здесь пришит сеточный контракт стора. Контракт барабана (абсолютный коммит)
// живёт в test/drum-contract.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSession, weightStep, snapWeight, snapPlanWeights,
} from '../js/workout.store.js';

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

test('weightStep: гантельные ходят по 2 кг, остальное по 2.5', () => {
  assert.equal(weightStep({ isUnilateral: true }), 2);
  assert.equal(weightStep({ isUnilateral: false }), 2.5);
  assert.equal(weightStep({}), 2.5);
  assert.equal(weightStep(undefined), 2.5);
});

test('snapWeight: любое число садится на ближайший узел своей сетки', () => {
  assert.equal(snapWeight(16.5, 2), 16);   // автобамп +2.5 поверх гантельных 14
  assert.equal(snapWeight(13, 2), 14);     // 6.5 → 7 (round-half-up, как у барабана)
  assert.equal(snapWeight(19, 2.5), 20);   // полевой симптом: «20» в окне
  assert.equal(snapWeight(17, 2.5), 17.5);
  assert.equal(snapWeight(20, 2.5), 20);   // уже на сетке — не двигаем
  assert.equal(snapWeight(0, 2.5), 0);     // bodyweight остаётся нулём
  assert.equal(snapWeight(-5, 2.5), 0);
  assert.equal(snapWeight(NaN, 2), 0);
});

test('snapWeight не оставляет хвост float (0.1+0.2 в килограммах)', () => {
  for (let i = 1; i <= 80; i++) {
    const v = snapWeight(i * 2.5 + 0.4, 2.5);
    assert.equal(v, Math.round(v * 100) / 100, `${v} несёт хвост`);
    assert.equal(v % 2.5, 0, `${v} вне сетки 2.5`);
  }
});

test('snapPlanWeights двигает только незакрытые сеты', () => {
  const plan = [{
    name: 'Alternating Dumbbell Curls',
    isUnilateral: true,
    sets: [
      { weight: 16.5, reps: 10, done: true },   // факт тренировки — не трогать
      { weight: 16.5, reps: 10, done: false },
      { weight: 13, reps: 10, done: false },
    ],
  }];
  const moved = snapPlanWeights(plan);
  assert.equal(moved, 2);
  assert.deepEqual(plan[0].sets.map((s) => s.weight), [16.5, 16, 14]);
});

/** Одна сессия в истории: гантельный подъём на 14 кг, цель по повторам взята. */
const history = (name, weight, reps = 10) => [{
  type: 'push',
  timestamp: Date.now() - 86400000,
  exercises: [{
    name,
    sets: [
      { weight, reps, rpe: null, done: true },
      { weight, reps, rpe: null, done: true },
    ],
  }],
}];

test('автобамп гантельного упражнения идёт шагом 2, а не плоскими 2.5', () => {
  const plan = buildSession('push', { workouts: history('Alternating Dumbbell Curls', 14) });
  const curls = plan.find((e) => e.name === 'Alternating Dumbbell Curls');
  assert.ok(curls, 'упражнение есть в сиде PPL | GIO');
  // до фикса: 14 + 2.5 = 16.5 — узла 16.5 на барабане нет, он рисовал «16»
  assert.equal(curls.sets[0].weight, 16);
  assert.equal(curls.sets[0].weight % weightStep(curls), 0);
});

test('автобамп штанги остаётся шагом 2.5', () => {
  const plan = buildSession('push', { workouts: history('Bench Press', 80, 8) });
  const bench = plan.find((e) => e.name === 'Bench Press');
  assert.equal(bench.sets[0].weight, 82.5);
});

test('вне-сеточная история садится на сетку даже без бампа', () => {
  // Цель по повторам НЕ взята (8 < 10) → «повторить прошлый вес». Прошлый вес
  // 13 кг пришёл из старых данных и на сетке шага 2 не лежит.
  const plan = buildSession('push', { workouts: history('Incline DB Press', 13, 8) });
  const incline = plan.find((e) => e.name === 'Incline DB Press');
  assert.equal(incline.sets[0].weight, 14);
});

test('каждый сет каждой сессии рождается на сетке своего упражнения', () => {
  for (const type of ['push', 'pull', 'legs']) {
    for (const w of [13, 16.5, 19, 21.3]) {
      const workouts = [{
        type, timestamp: Date.now() - 86400000,
        exercises: [{ name: 'Bench Press', sets: [{ weight: w, reps: 99, rpe: null, done: true }] }],
      }];
      for (const ex of buildSession(type, { workouts })) {
        const step = weightStep(ex);
        for (const set of ex.sets) {
          assert.equal(set.weight % step, 0,
            `${type}/${ex.name}: ${set.weight} вне сетки ${step}`);
        }
      }
    }
  }
});
