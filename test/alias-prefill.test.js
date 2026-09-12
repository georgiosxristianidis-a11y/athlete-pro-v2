// @ts-check
// ALIAS-PREFILL — the 2026-07-08 default-plan switch (DEFAULT_PLAN → PPL | GIO)
// renamed the lifts; exact-name history lookup then orphaned every stored
// weight and all sessions restarted at the seed's 0 kg. Seed exercises carry
// alias:[old names] and buildSession must follow history across the rename.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, latestWorkoutForNames, PPL_GIO_PLAN } from '../js/workout.store.js';

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

/** One legacy-named session: old DEFAULT_PLAN vocabulary, real weights. */
const legacyHistory = [
  {
    type: 'push',
    timestamp: Date.now() - 86400000,
    exercises: [
      {
        name: 'Bench Press',
        sets: [
          { weight: 80, reps: 8, done: true },
          { weight: 80, reps: 8, done: true },
          { weight: 80, reps: 8, done: true },
        ],
      },
      { name: 'Cable Fly', sets: [{ weight: 20, reps: 12, done: true }] },
    ],
  },
];

test('alias prefill — legacy-named history matches the restored seed names', () => {
  const session = buildSession('push', { workouts: legacyHistory });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.ok(bench, 'seed exercise missing');
  assert.ok(
    bench.sets[0].weight >= 80,
    `expected ≥80 from 'Bench Press' history, got ${bench.sets[0].weight}`
  );
  const fly = session.find((e) => e.name === 'Butterfly Machine');
  assert.ok(
    fly.sets[0].weight >= 20,
    `expected ≥20 from 'Cable Fly' history, got ${fly.sets[0].weight}`
  );
});

test('alias prefill — history logged under interim 1.21.0 names follows the rename back', () => {
  const history = [
    {
      type: 'push',
      timestamp: Date.now(),
      exercises: [
        { name: 'Flat Barbell Bench Press', sets: [{ weight: 100, reps: 8, done: true }] },
      ],
    },
  ];
  const session = buildSession('push', { workouts: history });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.ok(bench, 'seed exercise missing');
  assert.ok(bench.sets[0].weight >= 100, `expected ≥100 via alias, got ${bench.sets[0].weight}`);
});

test('prefill — newest session wins when getAll order is newest-first', () => {
  // DB.Workouts.getAll() documents newest-first. The old reverse().find()
  // then walked oldest-first and every new Push day loaded day-one weights.
  const newestFirst = [
    {
      type: 'push',
      timestamp: 2_000,
      exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 8, done: true }] }],
    },
    {
      type: 'push',
      timestamp: 1_000,
      exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8, done: true }] }],
    },
  ];
  const session = buildSession('push', { workouts: newestFirst });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.ok(
    bench.sets[0].weight >= 100,
    `expected latest ≥100kg, got ${bench.sets[0].weight} (day-one 60kg if reverse().find came back)`
  );
});

test('prefill — newest session wins even if the array is oldest-first', () => {
  const oldestFirst = [
    {
      type: 'push',
      timestamp: 1_000,
      exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8, done: true }] }],
    },
    {
      type: 'push',
      timestamp: 2_000,
      exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 8, done: true }] }],
    },
  ];
  const session = buildSession('push', { workouts: oldestFirst });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.ok(bench.sets[0].weight >= 100, `expected latest ≥100kg, got ${bench.sets[0].weight}`);
});

test('latestWorkoutForNames — timestamp, not array order', () => {
  const workouts = [
    { timestamp: 5, exercises: [{ name: 'Cable Fly' }] },
    { timestamp: 9, exercises: [{ name: 'Bench Press' }] },
    { timestamp: 7, exercises: [{ name: 'Bench Press' }] },
  ];
  const last = latestWorkoutForNames(workouts, ['Bench Press', 'Flat Barbell Bench Press']);
  assert.equal(last.timestamp, 9);
  assert.equal(latestWorkoutForNames(workouts, ['Overhead Press']), null);
});

test('alias prefill — no history match keeps the seed 0 (guard handles it)', () => {
  const session = buildSession('pull', { workouts: legacyHistory });
  const pulldown = session.find((e) => e.name === 'Lat Pulldown');
  assert.equal(pulldown.sets[0].weight, 0);
});

test('seed invariant — every alias list is non-empty strings', () => {
  for (const week of Object.values(PPL_GIO_PLAN)) {
    for (const day of Object.values(week)) {
      for (const ex of day) {
        if (!ex.alias) continue;
        assert.ok(Array.isArray(ex.alias) && ex.alias.length > 0, ex.name);
        for (const a of ex.alias) assert.equal(typeof a, 'string', ex.name);
      }
    }
  }
});
