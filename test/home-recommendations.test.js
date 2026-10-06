// @ts-check
/**
 * Рекомендации Home («Next Pull Session»: вес → вес).
 *
 * Секция читала localStorage 'ap-last-workout-type' и 'ap-recommendations-<type>'.
 * Коммит 169d3399 (2026-06-07) снёс и запись флага, и вызов generateRecommendations
 * при завершении тренировки — ключи больше никто не пишет, секция скрыта у всех.
 * Теперь её считает getNextSessionRecs: тип — getNextType (как у hero), вес —
 * nextWeightFor, тот же расчёт, что Train подставляет в buildSession.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getNextType, getNextSessionRecs } from '../js/dashboard.store.js';
import { buildSession, PPL_GIO_PLAN } from '../js/workout.store.js';

function mockStorage() {
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
}

beforeEach(mockStorage);

const DAY = 24 * 60 * 60 * 1000;
const sets = (weight, reps, n = 3) => Array.from({ length: n }, () => ({ weight, reps, done: true }));

/** Newest-first, как DB.Workouts.getAll(): вчера Push, три дня назад Pull. */
function history() {
  const now = Date.now();
  return [
    { type: 'push', timestamp: now - DAY, exercises: [{ name: 'Bench Press', sets: sets(80, 8) }] },
    {
      type: 'pull',
      timestamp: now - 3 * DAY,
      exercises: [
        // Старое имя — план знает его через alias.
        { name: 'Low Block Cable Row', sets: sets(50, 10) },
        // isUnilateral — шаг сетки 2, не 2.5.
        { name: 'Iso-Lateral Seated Row', sets: sets(20, 12) },
        // Недобор повторов (8 из 10) — вес держим, в рекомендации не попадает.
        { name: 'Lat Pulldown', sets: sets(60, 8) },
      ],
    },
  ];
}

test('история есть, флага ap-last-workout-type нет — рекомендации всё равно считаются', () => {
  const workouts = history();
  assert.equal(localStorage.getItem('ap-last-workout-type'), null);
  const nextType = getNextType(workouts);
  assert.equal(nextType, 'pull');

  const recs = getNextSessionRecs(workouts, nextType, PPL_GIO_PLAN.weekA);
  assert.deepEqual(recs, [
    { name: 'Cable Row', from: 50, to: 52.5 },
    { name: 'Iso-Lateral Seated Row', from: 20, to: 22 },
  ]);
});

test('вес в рекомендации = вес, который Train подставит в buildSession', () => {
  const workouts = history();
  const nextType = getNextType(workouts);
  // Без третьего аргумента — боевой путь через loadPlan(), как в dashboard.js.
  const recs = getNextSessionRecs(workouts, nextType);
  assert.ok(recs.length > 0, 'рекомендаций нет — сравнивать нечего');

  const session = buildSession(nextType, { workouts });
  for (const rec of recs) {
    const ex = session.find((e) => e.name === rec.name);
    assert.ok(ex, `${rec.name} нет в сессии Train`);
    assert.equal(ex.autoBumped, true, `${rec.name}: Train не поднимает вес`);
    assert.equal(ex.sets[0].weight, rec.to, `${rec.name}: Home обещает ${rec.to}, Train ставит ${ex.sets[0].weight}`);
  }
});

test('нет истории по дню следующей сессии — секции нечего показать', () => {
  const onlyPush = [history()[0]];
  assert.deepEqual(getNextSessionRecs(onlyPush, getNextType(onlyPush), PPL_GIO_PLAN.weekA), []);
  assert.deepEqual(getNextSessionRecs([], 'push', PPL_GIO_PLAN.weekA), []);
});
