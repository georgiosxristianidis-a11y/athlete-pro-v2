// @ts-check
/**
 * DATA-3 — карточки Stats по семействам (js/shared/family-curves.js, options.families).
 * Фикстура обезличенная, с перекосом экспорта Gio: у тренажёров из импорта 2023-25 по 30+ сессий,
 * у жима ногами и штангового жима — единицы, и они свежие.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateProgressionCurves, computeProgressionCacheKey } from '../js/analytics.progression-curves.js';
import { selectFamilyCurves, familyLabel, activityOf } from '../js/shared/family-curves.js';
import { renderStrengthCurves } from '../js/analytics.strength-curves.js';
import { flag } from '../js/flags.js';

const set = (/** @type {number} */ weight, /** @type {number} */ reps) => ({ weight, reps, done: true });
const session = (/** @type {Date} */ d, /** @type {string} */ type, /** @type {any[]} */ exercises) =>
  ({ type, timestamp: d.getTime(), duration: 3600, exercises });

/** @returns {any[]} */
function skewedHistory() {
  const out = [];
  const machines = [
    ['Machine Chest Press', 'push'], ['Pec Deck Fly', 'push'], ['Lat Pulldown', 'pull'],
    ['Seated Cable Row', 'pull'], ['Leg Extension', 'legs'], ['Lying Leg Curl', 'legs'], ['Hack Squat (Machine)', 'legs'],
  ];
  // 2023-06 .. 2025-05: по 32 сессии на тренажёр
  for (let i = 0; i < 32; i++) {
    const d = new Date(2023, 5 + (i % 24), 3 + (i % 20), 12);
    for (const [name, type] of machines) out.push(session(d, type, [{ name, sets: [set(40 + i, 10)] }]));
  }
  // свежее: единицы сессий
  out.push(session(new Date(2025, 9, 6, 12), 'legs', [{ name: 'Leg Press', sets: [set(140, 10), set(160, 8)] }]));
  out.push(session(new Date(2025, 9, 20, 12), 'legs', [{ name: 'Leg Press', sets: [set(180, 8)] }]));
  out.push(session(new Date(2025, 9, 8, 12), 'push', [{ name: 'Barbell Bench Press', sets: [set(80, 5)] }]));
  out.push(session(new Date(2025, 9, 22, 12), 'push', [
    { name: 'Bench Press', sets: [set(90, 3), set(70, 10)] },
    { name: 'Dumbbell Bench Press', sets: [set(30, 8)] },
  ]));
  return out;
}

describe('карточки по семействам', () => {
  test('красный контроль: прежний топ-6 по числу сессий НЕ показывает жим ногами и штангу', () => {
    const names = calculateProgressionCurves(skewedHistory(), { minMonths: 1 }).map((c) => c.name);
    assert.ok(!names.includes('Leg Press'));
    assert.ok(!names.includes('Bench Press'));
  });

  test('семейства: жим ногами и штанговый жим в выдаче', () => {
    const curves = calculateProgressionCurves(skewedHistory(), { minMonths: 1, families: true });
    const names = curves.map((c) => c.name);
    assert.ok(names.includes('Leg Press'), names.join());
    assert.ok(names.includes('Bench Press'), names.join());
    assert.ok(curves.length <= 6);
  });

  test('одна карточка на семейство: варианты жима лёжа не дублируются, рисует свежий штанговый', () => {
    const curves = calculateProgressionCurves(skewedHistory(), { minMonths: 1, families: true, limit: 20 });
    const bench = curves.filter((c) => c.family === 'family:bench');
    assert.equal(bench.length, 1);
    assert.equal(bench[0].name, 'Bench Press');
    assert.equal(bench[0].label, 'жим лёжа · штанга');
  });

  test('«Мой максимум» — реально поднятый вес лучшего подхода, e1RM отдельно', () => {
    const curves = calculateProgressionCurves(skewedHistory(), { minMonths: 1, families: true });
    const bench = curves.find((c) => c.name === 'Bench Press');
    assert.deepEqual(bench?.myMax, { weight: 90, reps: 3 });
    assert.equal(bench?.e1rm, 99);
    const press = curves.find((c) => c.name === 'Leg Press');
    assert.deepEqual(press?.myMax, { weight: 180, reps: 8 });
  });

  test('слоты делятся по типам: свежие push не вытесняют legs', () => {
    const fresh = [];
    for (const [i, name] of ['Bench Press', 'Machine Chest Press', 'Pec Deck Fly', 'Dips', 'Overhead Press'].entries()) {
      fresh.push(session(new Date(2025, 9, 1 + i, 12), 'push', [{ name, sets: [set(50, 5)] }]));
    }
    fresh.push(session(new Date(2025, 9, 9, 12), 'legs', [{ name: 'Leg Press', sets: [set(100, 5)] }]));
    const names = calculateProgressionCurves(fresh, { minMonths: 1, families: true, limit: 3 }).map((c) => c.name);
    assert.ok(names.includes('Leg Press'), names.join());
  });

  test('имя вне реестра — своя карточка без подписи; свежесть считается от последней тренировки истории', () => {
    const w = [session(new Date(2020, 0, 5, 12), 'push', [{ name: 'Странный станок', sets: [set(20, 10)] }])];
    const [c] = calculateProgressionCurves(w, { minMonths: 1, families: true });
    assert.equal(c.label, '');
    assert.equal(activityOf(w).byFamily.size, 1);
    assert.equal([...activityOf(w).byFamily.values()][0].recent, 1);
    assert.equal(familyLabel('Leg Press').label, 'жим ногами 45°');
  });

  test('пустая и битая история не падает', () => {
    assert.deepEqual(selectFamilyCurves([], [], 6), []);
    assert.deepEqual(calculateProgressionCurves([null, {}], { families: true }), []);
  });

  test('ключ кэша различает режимы', () => {
    const w = skewedHistory();
    assert.notEqual(computeProgressionCacheKey(w, {}), computeProgressionCacheKey(w, { families: true }));
    assert.equal(computeProgressionCacheKey(w, {}), computeProgressionCacheKey(w, { families: false }));
  });

  test('карточка: максимум «вес × повторы» первой цифрой, 1ПМ и вариант мелко; без флага разметка прежняя', () => {
    const mount = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    renderStrengthCurves(calculateProgressionCurves(skewedHistory(), { minMonths: 1, families: true }), /** @type {any} */ (mount));
    assert.match(mount.innerHTML, /sc-cur">90<span class="sc-unit">kg × 3</);
    assert.match(mount.innerHTML, /1ПМ|1RM|1ΜΕ/);
    assert.match(mount.innerHTML, /жим лёжа · штанга/);
    const old = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    renderStrengthCurves(calculateProgressionCurves(skewedHistory(), { minMonths: 1 }), /** @type {any} */ (old));
    assert.doesNotMatch(old.innerHTML, /kg ×|≈/);
  });

  test('флаг stats-families по умолчанию OFF', () => {
    assert.equal(flag('stats-families'), false);
  });
});
