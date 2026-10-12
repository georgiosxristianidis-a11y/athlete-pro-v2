// NAME-1: «Cable Row» и «Seated Cable Row» — одно движение. История 2023 (импорт,
// имя из библиотеки) и сессии из приложения (имя из плана) должны лечь на одну
// кривую. Данные не мигрируем — склейка только на чтении.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalName, canonicalKey } from '../js/shared/exercise-identity.js';
import { fetchExerciseHistory } from '../js/analytics.store.js';
import { calculateProgressionCurves } from '../js/analytics.progression-curves.js';

const DAY = 86_400_000;
const T2023 = Date.UTC(2023, 5, 10, 12);
const T2026 = Date.UTC(2026, 9, 5, 12);

const session = (id, timestamp, name, weight) => ({
  id,
  type: 'pull',
  timestamp,
  exercises: [{ name, sets: [{ weight, reps: 10, done: true }] }],
});

const WORKOUTS = [
  session(1, T2023, 'Seated Cable Row', 40),
  session(2, T2023 + 30 * DAY, 'Seated Cable Row', 45),
  session(3, T2026, 'Cable Row', 60),
  session(4, T2026 + 2 * DAY, 'Barbell Row', 80),
];

describe('canonicalName / canonicalKey', () => {
  test('все имена движения сводятся к библиотечному', () => {
    for (const n of ['Cable Row', 'cable row', ' Low Block Cable Row ', 'Seated Cable Row']) {
      assert.equal(canonicalName(n), 'Seated Cable Row', n);
      assert.equal(canonicalKey(n), 'seated cable row', n);
    }
  });

  test('чужое имя возвращается как есть, только обрезанное', () => {
    assert.equal(canonicalName('  Barbell Row '), 'Barbell Row');
    assert.equal(canonicalName('Iso-Lateral Seated Row'), 'Iso-Lateral Seated Row');
  });

  test('мусор не падает', () => {
    assert.equal(canonicalName(undefined), '');
    assert.equal(canonicalName(null), '');
    assert.equal(canonicalKey(''), '');
  });
});

describe('fetchExerciseHistory — склейка имён', () => {
  test('под любым из двух имён видна вся история, по порядку', () => {
    for (const asked of ['Seated Cable Row', 'Cable Row']) {
      const h = fetchExerciseHistory(WORKOUTS, asked);
      assert.equal(h.sessionsCount, 3, asked);
      assert.deepEqual(h.pts.map((p) => p.v), [40, 45, 60], asked);
      assert.equal(h.firstWeight, 40);
      assert.equal(h.currentWeight, 60);
      assert.equal(h.delta, 20);
      assert.equal(h.name, 'Seated Cable Row');
    }
  });

  test('соседняя тяга не примешивается', () => {
    const h = fetchExerciseHistory(WORKOUTS, 'Barbell Row');
    assert.equal(h.sessionsCount, 1);
    assert.equal(h.name, 'Barbell Row');
  });
});

describe('calculateProgressionCurves — склейка имён', () => {
  test('две записи одного движения — одна кривая', () => {
    const curves = calculateProgressionCurves(WORKOUTS, { minMonths: 1, limit: 10 });
    const names = curves.map((c) => c.name);
    assert.ok(names.includes('Seated Cable Row'));
    assert.ok(!names.includes('Cable Row'), 'отдельной кривой Cable Row быть не должно');

    const row = curves.find((c) => c.name === 'Seated Cable Row');
    assert.equal(row.n, 3);
    assert.equal(row.bestWeight, 60);
    assert.equal(row.currentWeight, 60);
    assert.ok(row.pts[0].t < Date.UTC(2024, 0, 1), 'точка 2023 на месте');
  });
});
