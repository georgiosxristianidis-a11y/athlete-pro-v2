import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchExerciseHistory } from '../js/analytics.store.js';

describe('fetchExerciseHistory (AN-2)', () => {
  test('returns safe defaults for null / empty inputs', () => {
    const res = fetchExerciseHistory(null, '');
    assert.equal(res.name, '');
    assert.equal(res.sessionsCount, 0);
    assert.equal(res.totalSets, 0);
    assert.equal(res.totalVolume, 0);
    assert.equal(res.bestWeight, 0);
    assert.equal(res.delta, 0);
    assert.deepEqual(res.sessions, []);
    assert.deepEqual(res.pts, []);
  });

  test('returns safe defaults when exercise is not found in history', () => {
    const workouts = [
      {
        id: 1,
        type: 'push',
        timestamp: 1000,
        exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }],
      },
    ];
    const res = fetchExerciseHistory(workouts, 'Bench Press');
    assert.equal(res.name, 'Bench Press');
    assert.equal(res.sessionsCount, 0);
    assert.equal(res.totalSets, 0);
    assert.deepEqual(res.sessions, []);
  });

  test('extracts chronological history and calculates 1RM, volume, and delta', () => {
    const workouts = [
      {
        id: 2,
        type: 'push',
        timestamp: 2000,
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 80, reps: 10 },
              { weight: 90, reps: 6 },
            ],
          },
        ],
      },
      {
        id: 1,
        type: 'push',
        timestamp: 1000,
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 70, reps: 10 },
              { weight: 75, reps: 8 },
            ],
          },
        ],
      },
      {
        id: 3,
        type: 'push',
        timestamp: 3000,
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 100, reps: 5 },
              { weight: 100, reps: 3 },
            ],
          },
        ],
      },
    ];

    const res = fetchExerciseHistory(workouts, 'Bench Press');
    assert.equal(res.name, 'Bench Press');
    assert.equal(res.type, 'push');
    assert.equal(res.sessionsCount, 3);
    assert.equal(res.totalSets, 6);
    assert.equal(res.firstWeight, 75);
    assert.equal(res.currentWeight, 100);
    assert.equal(res.bestWeight, 100);
    assert.equal(res.delta, 25);
    assert.equal(res.totalVolume, 700 + 600 + 800 + 540 + 500 + 300);
    assert.equal(res.best1RM, 117);

    assert.equal(res.sessions[0].timestamp, 1000);
    assert.equal(res.sessions[1].timestamp, 2000);
    assert.equal(res.sessions[2].timestamp, 3000);

    assert.equal(res.pts.length, 3);
    assert.equal(res.pts[0].v, 75);
    assert.equal(res.pts[2].v, 100);
  });

  test('skips done === false sets from calculations', () => {
    const workouts = [
      {
        id: 1,
        type: 'pull',
        timestamp: 1000,
        exercises: [
          {
            name: 'Deadlift',
            sets: [
              { weight: 140, reps: 5, done: true },
              { weight: 180, reps: 1, done: false },
            ],
          },
        ],
      },
    ];

    const res = fetchExerciseHistory(workouts, 'Deadlift');
    assert.equal(res.bestWeight, 140);
    assert.equal(res.totalSets, 1);
    assert.equal(res.totalVolume, 140 * 5);
  });

  test('matches exercises case-insensitively and via aliases', () => {
    const workouts = [
      {
        id: 1,
        type: 'pull',
        timestamp: 1000,
        exercises: [
          {
            name: 'Barbell Row',
            alias: ['Pendlay Row', 'BB Row'],
            sets: [{ weight: 80, reps: 8 }],
          },
        ],
      },
    ];

    const res1 = fetchExerciseHistory(workouts, 'barbell row');
    assert.equal(res1.sessionsCount, 1);
    assert.equal(res1.bestWeight, 80);

    const res2 = fetchExerciseHistory(workouts, 'Pendlay Row');
    assert.equal(res2.sessionsCount, 1);
    assert.equal(res2.bestWeight, 80);
  });

  test('handles zero-weight bodyweight exercises cleanly', () => {
    const workouts = [
      {
        id: 1,
        type: 'pull',
        timestamp: 1000,
        exercises: [
          {
            name: 'Pull-ups',
            sets: [
              { weight: 0, reps: 12 },
              { weight: 0, reps: 10 },
            ],
          },
        ],
      },
    ];

    const res = fetchExerciseHistory(workouts, 'Pull-ups');
    assert.equal(res.sessionsCount, 1);
    assert.equal(res.totalSets, 2);
    assert.equal(res.totalVolume, 0);
    assert.equal(res.bestWeight, 0);
    assert.equal(res.delta, 0);
    assert.deepEqual(res.pts, []);
  });
});
