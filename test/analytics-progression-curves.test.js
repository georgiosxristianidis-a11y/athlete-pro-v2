// @ts-check
/* ════════════════════════════════════════════════════════
   test/analytics-progression-curves.test.js
   Stress tests and edge-case verification for Progression Curves
   calculation engine and IndexedDB caching layer.
   Complies with docs/specs/task_contract.md.
   ════════════════════════════════════════════════════════ */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Minimal localStorage stub for node test runner
const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
  setItem: (k, v) => localStorageStore.set(k, String(v)),
  removeItem: (k) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear(),
};

const { DB } = await import('../js/db.js');
const {
  calculateProgressionCurves,
  computeProgressionCacheKey,
} = await import('../js/analytics.progression-curves.js');
const {
  ProgressionCache,
  getProgressionCurvesCache,
  setProgressionCurvesCache,
  clearProgressionCurvesCache,
  PROGRESSION_CACHE_VERSION,
} = await import('../js/db/progression-cache.js');
const { getCachedOrComputeProgressionCurves } = await import('../js/analytics.store.js');

beforeEach(async () => {
  localStorageStore.clear();
  await DB.clearAll();
});

/* ══════════════════════════════════════════════
   SUITE 1: Defensive & Boundary Inputs
   ══════════════════════════════════════════════ */
describe('calculateProgressionCurves — defensive & boundary handling', () => {
  test('returns empty array on null, undefined, empty array or non-array inputs', () => {
    assert.deepEqual(calculateProgressionCurves(null), []);
    assert.deepEqual(calculateProgressionCurves(undefined), []);
    assert.deepEqual(calculateProgressionCurves([]), []);
    // @ts-ignore
    assert.deepEqual(calculateProgressionCurves('invalid'), []);
    // @ts-ignore
    assert.deepEqual(calculateProgressionCurves(12345), []);
    // @ts-ignore
    assert.deepEqual(calculateProgressionCurves({}), []);
  });

  test('skips null, undefined or empty workout items in array', () => {
    const workouts = [
      null,
      undefined,
      {},
      { id: 1 },
      { id: 2, timestamp: Date.now() }, // no exercises
      { id: 3, timestamp: Date.now(), exercises: [] },
    ];
    // @ts-ignore
    assert.deepEqual(calculateProgressionCurves(workouts), []);
  });

  test('ignores soft-deleted workouts (_deleted: true)', () => {
    const ts = new Date(2026, 0, 10).getTime();
    const workouts = [
      {
        id: 'w1',
        timestamp: ts,
        type: 'push',
        _deleted: true,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }],
      },
    ];
    assert.deepEqual(calculateProgressionCurves(workouts), []);
  });

  test('ignores workouts with invalid, non-finite, zero or negative timestamps', () => {
    const workouts = [
      {
        id: 'w-nan',
        timestamp: NaN,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }],
      },
      {
        id: 'w-zero',
        timestamp: 0,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }],
      },
      {
        id: 'w-neg',
        timestamp: -1000,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }],
      },
      {
        id: 'w-undef',
        timestamp: undefined,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }],
      },
    ];
    // @ts-ignore
    assert.deepEqual(calculateProgressionCurves(workouts), []);
  });

  test('filters out sets with done === false', () => {
    const ts = new Date(2026, 2, 10).getTime();
    const workouts = [
      {
        id: 'w1',
        timestamp: ts,
        type: 'push',
        exercises: [
          {
            name: 'Incline Dumbbell Press',
            sets: [
              { weight: 40, reps: 8, done: false }, // skipped
              { weight: 30, reps: 10, done: true }, // valid
            ],
          },
        ],
      },
    ];
    const curves = calculateProgressionCurves(workouts);
    assert.equal(curves.length, 1);
    assert.equal(curves[0].pts[0].v, 30);
    assert.equal(curves[0].bestWeight, 30);
  });

  test('filters out corrupted weights: negative, zero, NaN, strings, null', () => {
    const ts = new Date(2026, 2, 10).getTime();
    const workouts = [
      {
        id: 'w1',
        timestamp: ts,
        type: 'push',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              { weight: -50, reps: 5 },
              { weight: 0, reps: 10 },
              { weight: NaN, reps: 5 },
              // @ts-ignore
              { weight: 'invalid', reps: 5 },
              // @ts-ignore
              { weight: null, reps: 5 },
            ],
          },
        ],
      },
    ];
    assert.deepEqual(calculateProgressionCurves(workouts), []);
  });

  test('filters out invalid reps: zero, negative, NaN', () => {
    const ts = new Date(2026, 2, 10).getTime();
    const workouts = [
      {
        id: 'w1',
        timestamp: ts,
        type: 'pull',
        exercises: [
          {
            name: 'Deadlift',
            sets: [
              { weight: 140, reps: 0 },
              { weight: 140, reps: -2 },
              { weight: 140, reps: NaN },
            ],
          },
        ],
      },
    ];
    assert.deepEqual(calculateProgressionCurves(workouts), []);
  });

  test('trims exercise names and normalizes empty or whitespace-only names', () => {
    const ts = new Date(2026, 2, 10).getTime();
    const workouts = [
      {
        id: 'w1',
        timestamp: ts,
        type: 'legs',
        exercises: [
          { name: '   ', sets: [{ weight: 100, reps: 5 }] },
          { name: '  Barbell Squat  ', sets: [{ weight: 120, reps: 5 }] },
        ],
      },
    ];
    const curves = calculateProgressionCurves(workouts);
    assert.equal(curves.length, 1);
    assert.equal(curves[0].name, 'Barbell Squat');
  });
});

/* ══════════════════════════════════════════════
   SUITE 2: Progression Dynamics & Aggregations
   ══════════════════════════════════════════════ */
describe('calculateProgressionCurves — progression metrics & monthly aggregation', () => {
  test('correctly aggregates multiple workouts within the same month', () => {
    // January 2026: 2 sessions of Bench Press
    const ts1 = new Date(2026, 0, 5).getTime();
    const ts2 = new Date(2026, 0, 20).getTime();
    const workouts = [
      {
        id: 'w1',
        timestamp: ts1,
        type: 'push',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 80, reps: 8 },
              { weight: 85, reps: 5 },
            ],
          },
        ],
      },
      {
        id: 'w2',
        timestamp: ts2,
        type: 'push',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 90, reps: 5 }, // higher peak weight
            ],
          },
        ],
      },
    ];

    const curves = calculateProgressionCurves(workouts);
    assert.equal(curves.length, 1);
    const curve = curves[0];
    assert.equal(curve.name, 'Bench Press');
    assert.equal(curve.n, 2, 'Total sessions must equal 2');
    assert.equal(curve.pts.length, 1, 'Should aggregate into single monthly point');
    assert.equal(curve.pts[0].v, 90, 'Peak working weight for January is 90kg');

    // Expected volume: (80*8 + 85*5) + (90*5) = 640 + 425 + 450 = 1515
    assert.equal(curve.pts[0].volume, 1515);

    // Mid-month timestamp check (15 Jan 2026, 12:00:00 UTC)
    const expectedMidMonth = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(curve.pts[0].t, expectedMidMonth);
  });

  test('computes chronological multi-month progression, delta, bestWeight and est1RM', () => {
    // 3 consecutive months: Jan (80kg), Feb (85kg), Mar (90kg)
    const workouts = [
      {
        id: 'm1',
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Overhead Press', sets: [{ weight: 80, reps: 5 }] }],
      },
      {
        id: 'm2',
        timestamp: new Date(2026, 1, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Overhead Press', sets: [{ weight: 85, reps: 5 }] }],
      },
      {
        id: 'm3',
        timestamp: new Date(2026, 2, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Overhead Press', sets: [{ weight: 90, reps: 5 }] }],
      },
    ];

    const curves = calculateProgressionCurves(workouts);
    assert.equal(curves.length, 1);
    const curve = curves[0];

    assert.equal(curve.pts.length, 3);
    assert.equal(curve.pts[0].v, 80);
    assert.equal(curve.pts[1].v, 85);
    assert.equal(curve.pts[2].v, 90);

    assert.equal(curve.pts[0].v, 80);
    assert.equal(curve.currentWeight, 90);
    assert.equal(curve.bestWeight, 90);
    assert.equal(curve.delta, 10, 'Delta must be 90 - 80 = +10kg');

    // est1RM check (Epley: w * (1 + r/30) = 90 * (1 + 5/30) = 105)
    for (const pt of curve.pts) {
      assert.ok(typeof pt.est1RM === 'number' && pt.est1RM > pt.v);
    }
  });

  test('calculates negative delta when performance regresses', () => {
    const workouts = [
      {
        id: 'm1',
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'legs',
        exercises: [{ name: 'Squat', sets: [{ weight: 140, reps: 5 }] }],
      },
      {
        id: 'm2',
        timestamp: new Date(2026, 1, 10).getTime(),
        type: 'legs',
        exercises: [{ name: 'Squat', sets: [{ weight: 120, reps: 5 }] }],
      },
    ];

    const curves = calculateProgressionCurves(workouts);
    assert.equal(curves.length, 1);
    assert.equal(curves[0].delta, -20);
    assert.equal(curves[0].bestWeight, 140);
    assert.equal(curves[0].currentWeight, 120);
  });

  test('determines dominant PPL type correctly', () => {
    // 3 push sessions, 1 pull session for the same exercise
    const workouts = [
      {
        timestamp: new Date(2026, 0, 1).getTime(),
        type: 'push',
        exercises: [{ name: 'Dips', sets: [{ weight: 20, reps: 8 }] }],
      },
      {
        timestamp: new Date(2026, 1, 1).getTime(),
        type: 'push',
        exercises: [{ name: 'Dips', sets: [{ weight: 25, reps: 8 }] }],
      },
      {
        timestamp: new Date(2026, 2, 1).getTime(),
        type: 'push',
        exercises: [{ name: 'Dips', sets: [{ weight: 30, reps: 6 }] }],
      },
      {
        timestamp: new Date(2026, 3, 1).getTime(),
        type: 'pull',
        exercises: [{ name: 'Dips', sets: [{ weight: 30, reps: 6 }] }],
      },
    ];

    const curves = calculateProgressionCurves(workouts);
    assert.equal(curves.length, 1);
    assert.equal(curves[0].type, 'push');
  });

  test('respects minMonths filter option', () => {
    const workouts = [
      // Lift A has only 1 month
      {
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Single Month Lift', sets: [{ weight: 50, reps: 10 }] }],
      },
      // Lift B has 2 months
      {
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'pull',
        exercises: [{ name: 'Two Month Lift', sets: [{ weight: 50, reps: 10 }] }],
      },
      {
        timestamp: new Date(2026, 1, 10).getTime(),
        type: 'pull',
        exercises: [{ name: 'Two Month Lift', sets: [{ weight: 55, reps: 10 }] }],
      },
    ];

    const curvesMin1 = calculateProgressionCurves(workouts, { minMonths: 1 });
    assert.equal(curvesMin1.length, 2);

    const curvesMin2 = calculateProgressionCurves(workouts, { minMonths: 2 });
    assert.equal(curvesMin2.length, 1);
    assert.equal(curvesMin2[0].name, 'Two Month Lift');
  });

  test('respects limit option and sorts by session count descending', () => {
    const workouts = [];
    // Generate 8 exercises with varying session counts
    for (let i = 1; i <= 8; i++) {
      for (let s = 0; s < i; s++) {
        workouts.push({
          timestamp: new Date(2026, 0, 1 + s).getTime(),
          type: 'push',
          exercises: [{ name: `Exercise ${i}`, sets: [{ weight: 50 + i, reps: 5 }] }],
        });
      }
    }

    const curves = calculateProgressionCurves(workouts, { limit: 4 });
    assert.equal(curves.length, 4);
    assert.equal(curves[0].name, 'Exercise 8');
    assert.equal(curves[0].n, 8);
    assert.equal(curves[1].name, 'Exercise 7');
    assert.equal(curves[1].n, 7);
    assert.equal(curves[2].name, 'Exercise 6');
    assert.equal(curves[2].n, 6);
    assert.equal(curves[3].name, 'Exercise 5');
    assert.equal(curves[3].n, 5);
  });
});

/* ══════════════════════════════════════════════
   SUITE 3: Cache Signature (computeProgressionCacheKey)
   ══════════════════════════════════════════════ */
describe('computeProgressionCacheKey — signature generation', () => {
  test('returns 0:0:1:6 for empty, null, or undefined workouts with default options', () => {
    assert.equal(computeProgressionCacheKey(null), '0:0:1:6');
    assert.equal(computeProgressionCacheKey(undefined), '0:0:1:6');
    assert.equal(computeProgressionCacheKey([]), '0:0:1:6');
  });

  test('computes count:maxTimestamp:minMonths:limit correctly', () => {
    const workouts = [
      { id: 1, timestamp: 1000 },
      { id: 2, timestamp: 5000 },
      { id: 3, timestamp: 3000 },
    ];
    assert.equal(computeProgressionCacheKey(workouts), '3:5000:1:6');
    assert.equal(computeProgressionCacheKey(workouts, { minMonths: 3, limit: 10 }), '3:5000:3:10');
  });

  test('excludes soft-deleted workouts from signature count and maxTimestamp', () => {
    const workouts = [
      { id: 1, timestamp: 1000 },
      { id: 2, timestamp: 9999, _deleted: true },
      { id: 3, timestamp: 3000 },
    ];
    assert.equal(computeProgressionCacheKey(workouts), '2:3000:1:6');
  });
});

/* ══════════════════════════════════════════════
   SUITE 4: IndexedDB Caching & Invalidation
   ══════════════════════════════════════════════ */
describe('ProgressionCache & getCachedOrComputeProgressionCurves', () => {
  test('ProgressionCache handles basic store, retrieval and schema validation', async () => {
    const testRecord = {
      id: 'test-key',
      version: PROGRESSION_CACHE_VERSION,
      timestamp: 123456789,
      workoutCount: 5,
      curves: [
        {
          name: 'Bench Press',
          pts: [{ t: 1000, v: 100 }],
          type: 'push',
          n: 5,
          delta: 10,
          bestWeight: 100,
          currentWeight: 100,
        },
      ],
    };

    assert.equal(typeof ProgressionCache.getProgressionCurvesCache, 'function');
    assert.equal(typeof ProgressionCache.setProgressionCurvesCache, 'function');
    assert.equal(typeof ProgressionCache.clearProgressionCurvesCache, 'function');
    await setProgressionCurvesCache(testRecord);
    const retrieved = await getProgressionCurvesCache('test-key');
    assert.ok(retrieved);
    assert.equal(retrieved.id, 'test-key');
    assert.equal(retrieved.version, PROGRESSION_CACHE_VERSION);
    assert.equal(retrieved.workoutCount, 5);
    assert.equal(retrieved.curves.length, 1);
    assert.equal(retrieved.curves[0].name, 'Bench Press');
  });

  test('rejects cache records with outdated schema version', async () => {
    const outdatedRecord = {
      id: 'outdated-key',
      version: 999, // Future/incompatible version
      timestamp: 123456789,
      workoutCount: 5,
      curves: [],
    };

    await setProgressionCurvesCache(outdatedRecord);
    const retrieved = await getProgressionCurvesCache('outdated-key');
    assert.equal(retrieved, null, 'Cache must reject incompatible schema versions');
  });

  test('rejects corrupted cache payloads', async () => {
    // Store corrupted record directly in Settings
    await DB.Settings.set('ap-progression-cache:corrupt', {
      id: 'corrupt',
      version: PROGRESSION_CACHE_VERSION,
      timestamp: 'not-a-number', // corrupted
      workoutCount: 1,
      curves: 'not-an-array',
    });

    const retrieved = await getProgressionCurvesCache('corrupt');
    assert.equal(retrieved, null);
  });

  test('clearProgressionCurvesCache removes all cached progression records', async () => {
    await setProgressionCurvesCache({
      id: 'k1',
      version: PROGRESSION_CACHE_VERSION,
      timestamp: 100,
      workoutCount: 1,
      curves: [],
    });
    await setProgressionCurvesCache({
      id: 'k2',
      version: PROGRESSION_CACHE_VERSION,
      timestamp: 200,
      workoutCount: 2,
      curves: [],
    });

    assert.ok(await getProgressionCurvesCache('k1'));
    assert.ok(await getProgressionCurvesCache('k2'));

    await clearProgressionCurvesCache();

    assert.equal(await getProgressionCurvesCache('k1'), null);
    assert.equal(await getProgressionCurvesCache('k2'), null);
  });

  test('getCachedOrComputeProgressionCurves serves from cache and invalidates on workout change', async () => {
    const workoutsA = [
      {
        id: 'w1',
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'pull',
        exercises: [{ name: 'Pull-up', sets: [{ weight: 20, reps: 5 }] }],
      },
    ];

    // First call: cache miss, computes and writes to IDB
    const res1 = await getCachedOrComputeProgressionCurves(workoutsA);
    assert.equal(res1.length, 1);
    assert.equal(res1[0].name, 'Pull-up');

    const keyA = `curves:${computeProgressionCacheKey(workoutsA)}`;
    const cachedA = await getProgressionCurvesCache(keyA);
    assert.ok(cachedA, 'Cache record must exist in IDB');
    assert.equal(cachedA.workoutCount, 1);

    // Second call: cache hit
    const res2 = await getCachedOrComputeProgressionCurves(workoutsA);
    assert.deepEqual(res2, res1);

    // Add a new workout: cache miss / invalidation
    const workoutsB = [
      ...workoutsA,
      {
        id: 'w2',
        timestamp: new Date(2026, 1, 10).getTime(),
        type: 'pull',
        exercises: [{ name: 'Pull-up', sets: [{ weight: 25, reps: 5 }] }],
      },
    ];

    const res3 = await getCachedOrComputeProgressionCurves(workoutsB);
    assert.equal(res3.length, 1);
    assert.equal(res3[0].pts.length, 2, 'Must have recomputed with 2 points');
    assert.equal(res3[0].currentWeight, 25);
  });

  test('forceRefresh bypasses existing valid cache', async () => {
    const workouts = [
      {
        id: 'w1',
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5 }] }],
      },
    ];

    // Initial computation & caching
    await getCachedOrComputeProgressionCurves(workouts);

    // Manually poison cache to detect if forceRefresh bypasses it
    const key = `curves:${computeProgressionCacheKey(workouts)}`;
    await setProgressionCurvesCache({
      id: key,
      version: PROGRESSION_CACHE_VERSION,
      timestamp: Date.now(),
      workoutCount: 1,
      curves: [
        {
          name: 'Poisoned Lift',
          pts: [],
          type: 'push',
          n: 1,
          delta: 0,
          bestWeight: 999,
          currentWeight: 999,
        },
      ],
    });

    // Without forceRefresh, it returns poisoned cache
    const cachedHit = await getCachedOrComputeProgressionCurves(workouts);
    assert.equal(cachedHit[0].name, 'Poisoned Lift');

    // With forceRefresh: true, it recomputes freshly from actual workouts
    const fresh = await getCachedOrComputeProgressionCurves(workouts, { forceRefresh: true });
    assert.equal(fresh[0].name, 'Bench Press');
  });

  test('handles concurrent simultaneous invocations without race condition failure', async () => {
    const workouts = [
      {
        id: 'w1',
        timestamp: new Date(2026, 0, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Dip', sets: [{ weight: 20, reps: 8 }] }],
      },
      {
        id: 'w2',
        timestamp: new Date(2026, 1, 10).getTime(),
        type: 'push',
        exercises: [{ name: 'Dip', sets: [{ weight: 25, reps: 8 }] }],
      },
    ];

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      getCachedOrComputeProgressionCurves(workouts),
      getCachedOrComputeProgressionCurves(workouts),
      getCachedOrComputeProgressionCurves(workouts),
      getCachedOrComputeProgressionCurves(workouts),
      getCachedOrComputeProgressionCurves(workouts),
    ]);

    for (const r of results) {
      assert.equal(r.length, 1);
      assert.equal(r[0].name, 'Dip');
      assert.equal(r[0].pts.length, 2);
    }
  });
});

/* ══════════════════════════════════════════════
   SUITE 5: Stress Test (1000 Workouts)
   ══════════════════════════════════════════════ */
describe('calculateProgressionCurves — stress test at scale', () => {
  test('processes 1000 workouts across 3 years within performant budget (< 250ms)', async () => {
    const exercisePool = [
      { name: 'Barbell Squat', type: 'legs', baseWeight: 100 },
      { name: 'Bench Press', type: 'push', baseWeight: 80 },
      { name: 'Deadlift', type: 'pull', baseWeight: 120 },
      { name: 'Overhead Press', type: 'push', baseWeight: 50 },
      { name: 'Barbell Row', type: 'pull', baseWeight: 70 },
      { name: 'Romanian Deadlift', type: 'legs', baseWeight: 90 },
      { name: 'Incline DB Press', type: 'push', baseWeight: 30 },
      { name: 'Lat Pulldown', type: 'pull', baseWeight: 60 },
    ];

    const startDate = new Date(2023, 0, 1).getTime();
    const workouts = [];

    // 1000 workouts distributed across ~1100 days (~3 years)
    for (let i = 0; i < 1000; i++) {
      const ts = startDate + i * 28 * 3600 * 1000; // ~every 28 hours
      const exIndex = i % exercisePool.length;
      const exMeta = exercisePool[exIndex];

      // Weight gradually increases over the 3-year progression
      const weightBonus = Math.floor(i / 50) * 2.5;
      const weight = exMeta.baseWeight + weightBonus;

      workouts.push({
        id: `stress-w-${i}`,
        timestamp: ts,
        type: exMeta.type,
        exercises: [
          {
            name: exMeta.name,
            sets: [
              { weight: weight * 0.9, reps: 10, done: true },
              { weight, reps: 6, done: true },
              { weight: weight * 1.05, reps: 3, done: true },
              { weight: -1, reps: 5, done: false }, // occasional junk set
            ],
          },
        ],
      });
    }

    assert.equal(workouts.length, 1000);

    // Benchmark calculation time
    const t0 = performance.now();
    const curves = calculateProgressionCurves(workouts, { limit: 6 });
    const durationMs = performance.now() - t0;

    assert.ok(
      durationMs < 250,
      `Calculation for 1000 workouts took ${durationMs.toFixed(1)}ms (must be < 250ms)`,
    );

    // Verify output structure
    assert.equal(curves.length, 6, 'Respects default limit of 6');
    for (const c of curves) {
      assert.ok(c.n > 100, `High session count expected for ${c.name}, got ${c.n}`);
      assert.ok(c.pts.length >= 24, `Should span at least 24 monthly points, got ${c.pts.length}`);
      assert.ok(c.delta > 0, `Progression delta should be positive, got ${c.delta}`);
      assert.ok(c.bestWeight > 0);
      assert.ok(c.currentWeight >= c.pts[0].v);

      // Verify points are strictly chronological
      for (let p = 1; p < c.pts.length; p++) {
        assert.ok(
          c.pts[p].t > c.pts[p - 1].t,
          'Monthly points must be strictly chronologically increasing',
        );
      }
    }

    // Benchmark cached read
    const tCache0 = performance.now();
    const cachedCurves = await getCachedOrComputeProgressionCurves(workouts);
    const initialCacheDuration = performance.now() - tCache0;
    assert.ok(initialCacheDuration >= 0);

    // Second read should be fast cache hit
    const tHit0 = performance.now();
    const hitCurves = await getCachedOrComputeProgressionCurves(workouts);
    const hitDuration = performance.now() - tHit0;

    assert.ok(
      hitDuration < 50,
      `Cached read took ${hitDuration.toFixed(1)}ms (must be < 50ms)`,
    );
    assert.equal(hitCurves.length, cachedCurves.length);
  });
});
