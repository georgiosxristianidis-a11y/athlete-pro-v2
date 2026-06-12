import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

let mod;
before(async () => {
  mod = await import('../js/progressive-overload.js');
});

describe('classifyExercise', () => {
  test('Bench Press → upper', () => {
    assert.equal(mod.classifyExercise('Bench Press'), 'upper');
  });

  test('Incline DB Press → upper', () => {
    assert.equal(mod.classifyExercise('Incline DB Press'), 'upper');
  });

  test('Squat → lower', () => {
    assert.equal(mod.classifyExercise('Squat'), 'lower');
  });

  test('Deadlift → lower', () => {
    assert.equal(mod.classifyExercise('Deadlift'), 'lower');
  });

  test('Romanian Deadlift → lower', () => {
    assert.equal(mod.classifyExercise('Romanian Deadlift'), 'lower');
  });

  test('Hammer Curl → upper', () => {
    assert.equal(mod.classifyExercise('Hammer Curl'), 'upper');
  });

  test('Plank → accessory (unknown)', () => {
    assert.equal(mod.classifyExercise('Plank'), 'accessory');
  });

  test('case-insensitive', () => {
    assert.equal(mod.classifyExercise('BENCH PRESS'), 'upper');
    assert.equal(mod.classifyExercise('squat'), 'lower');
  });
});

describe('calculateProgression', () => {
  test('all sets completed → recommends increment for upper body', () => {
    const result = mod.calculateProgression('Bench Press', 80, 4, 4, {});
    assert.equal(result.type, 'recommended');
    assert.equal(result.delta, 2.5);
    assert.equal(result.recommended, 82.5);
  });

  test('lower body gets 5 kg increment', () => {
    const result = mod.calculateProgression('Squat', 100, 3, 3, {});
    assert.equal(result.recommended, 105);
    assert.equal(result.delta, 5);
  });

  test('incomplete sets → maintain weight (delta 0)', () => {
    const result = mod.calculateProgression('Bench Press', 80, 2, 4, {});
    assert.equal(result.delta, 0);
    assert.equal(result.recommended, 80);
  });

  test('current > lastSessionWeight → PR type', () => {
    const result = mod.calculateProgression('Bench Press', 85, 4, 4, { lastSessionWeight: 80 });
    assert.equal(result.type, 'pr');
  });

  test('plateau history → deload recommended', () => {
    const history = [{ weight: 80 }, { weight: 80 }, { weight: 80 }];
    const result = mod.calculateProgression('Bench Press', 80, 4, 4, { history });
    assert.equal(result.type, 'recommended');
    assert.ok(result.recommended < 80, 'deload should reduce weight');
  });

  test('result always has recommended, delta, reason, type', () => {
    const result = mod.calculateProgression('Bench Press', 80, 4, 4);
    assert.ok(typeof result.recommended === 'number');
    assert.ok(typeof result.delta === 'number');
    assert.ok(typeof result.reason === 'string');
    assert.ok(['pr', 'recommended', 'normal'].includes(result.type));
  });
});

describe('detectPlateau', () => {
  const makeHistory = (weights) =>
    weights.map((w, i) => ({
      timestamp: Date.now() - (weights.length - i) * 24 * 3600000,
      exercises: [{ name: 'Bench Press', sets: [{ weight: w, reps: 8, done: true }] }],
    }));

  test('3 sessions at same weight → plateau detected', () => {
    const history = makeHistory([80, 80, 80]);
    const result = mod.detectPlateau('Bench Press', history);
    assert.equal(result.isPlateau, true);
    assert.ok(result.suggestion.length > 0);
  });

  test('fewer than 3 sessions → no plateau', () => {
    const history = makeHistory([80, 80]);
    const result = mod.detectPlateau('Bench Press', history);
    assert.equal(result.isPlateau, false);
  });

  test('increasing weight → no plateau', () => {
    const history = makeHistory([75, 77.5, 80]);
    const result = mod.detectPlateau('Bench Press', history);
    assert.equal(result.isPlateau, false);
  });

  test('exercise not in history → no plateau', () => {
    const history = makeHistory([80, 80, 80]);
    const result = mod.detectPlateau('Deadlift', history);
    assert.equal(result.isPlateau, false);
    assert.equal(result.sessions, 0);
  });

  test('result always has isPlateau boolean and suggestion string', () => {
    const result = mod.detectPlateau('Bench Press', []);
    assert.equal(typeof result.isPlateau, 'boolean');
    assert.equal(typeof result.suggestion, 'string');
  });
});

describe('generateWeeklySummary', () => {
  const makeWorkout = (type, daysAgo, exercises = []) => ({
    type,
    timestamp: Date.now() - daysAgo * 24 * 3600000,
    exercises,
  });

  test('empty history → no workouts message', async () => {
    const result = await mod.generateWeeklySummary([]);
    assert.ok(typeof result.summary === 'string');
    assert.ok(Array.isArray(result.plateauAlerts));
    assert.ok(Array.isArray(result.prs));
  });

  test('2 workouts this week reflected in summary count', async () => {
    const history = [makeWorkout('push', 1), makeWorkout('pull', 2)];
    const result = await mod.generateWeeklySummary(history);
    assert.ok(result.summary.includes('2 workouts'));
  });

  test('workouts older than 7 days not counted', async () => {
    const history = [
      makeWorkout('push', 1),
      makeWorkout('pull', 10), // older than 7 days
    ];
    const result = await mod.generateWeeklySummary(history);
    assert.ok(result.summary.includes('1 workouts'));
  });

  test('plateau detected and reported in plateauAlerts', async () => {
    const history = [
      makeWorkout('push', 1, [
        { name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] },
      ]),
      makeWorkout('push', 8, [
        { name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] },
      ]),
      makeWorkout('push', 15, [
        { name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] },
      ]),
    ];
    const result = await mod.generateWeeklySummary(history);
    assert.equal(result.plateauAlerts.length, 1);
    assert.equal(result.plateauAlerts[0].exercise, 'Bench Press');
  });
});

describe('getTypeClass / getTypeIcon', () => {
  test('pr type → progression-pr class', () => {
    assert.equal(mod.getTypeClass('pr'), 'progression-pr');
  });

  test('recommended type → progression-recommended class', () => {
    assert.equal(mod.getTypeClass('recommended'), 'progression-recommended');
  });

  test('normal type → progression-normal class', () => {
    assert.equal(mod.getTypeClass('normal'), 'progression-normal');
  });

  test('getTypeIcon returns a non-empty string for all types', () => {
    for (const t of ['pr', 'recommended', 'normal']) {
      assert.ok(mod.getTypeIcon(t).length > 0);
    }
  });
});
