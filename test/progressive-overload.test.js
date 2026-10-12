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

  // FIELD-5: the weeks counter ran from the EARLIEST rise in the whole history
  // (sessions.find over an ascending array), so it grew with the length of the
  // history instead of with the stall.
  const dayAt = (daysAgo, weight) => ({
    timestamp: Date.now() - daysAgo * 24 * 3600000,
    exercises: [{ name: 'Bench Press', sets: [{ weight, reps: 8, done: true }] }],
  });

  test('FIELD-5: weeks count from the LAST rise, not the first one in history', () => {
    const history = [
      dayAt(420, 70),
      dayAt(350, 72.5), // first rise ever, 50 weeks ago
      dayAt(210, 75), // 30 weeks ago
      dayAt(70, 77.5), // last rise, 10 weeks ago
      dayAt(42, 77.5),
      dayAt(21, 77.5),
      dayAt(3, 77.5),
    ];
    const result = mod.detectPlateau('Bench Press', history);
    assert.equal(result.isPlateau, true);
    assert.equal(result.lastProgress, 10);
  });

  test('FIELD-5: input order does not change the answer', () => {
    const history = [dayAt(70, 77.5), dayAt(3, 77.5), dayAt(350, 72.5), dayAt(21, 77.5), dayAt(42, 77.5), dayAt(210, 75)];
    assert.equal(mod.detectPlateau('Bench Press', history).lastProgress, 10);
  });

  test('FIELD-5: a weight that never rose counts from the first logged session, not 999', () => {
    const history = [dayAt(56, 80), dayAt(35, 80), dayAt(14, 80)];
    const result = mod.detectPlateau('Bench Press', history);
    assert.equal(result.isPlateau, true);
    assert.equal(result.lastProgress, 8);
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

  // A session prefills every set with the auto-progressed weight as done:false
  // (workout.store buildSession) and saves sets as-is. PR and plateau read only
  // lifted sets: done !== false and reps > 0, a set without `done` is lifted.
  const bench = (daysAgo, sets) => makeWorkout('push', daysAgo, [{ name: 'Bench Press', sets }]);

  test('a done:false set with a heavier weight is not a PR', async () => {
    const history = [
      bench(1, [
        { weight: 102.5, reps: 8, done: false },
        { weight: 95, reps: 8, done: true },
      ]),
      bench(10, [{ weight: 100, reps: 8, done: true }]),
    ];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs, []);
  });

  test('an unfinished heavier suggestion in the past does not block a real PR', async () => {
    const history = [
      bench(1, [{ weight: 100, reps: 8, done: true }]),
      bench(10, [
        { weight: 120, reps: 8, done: false },
        { weight: 90, reps: 8, done: true },
      ]),
    ];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs.map((p) => [p.exercise, p.weight]), [['Bench Press', 100]]);
  });

  test('a done set with 0 reps is not a PR', async () => {
    const history = [
      bench(1, [
        { weight: 110, reps: 0, done: true },
        { weight: 95, reps: 8, done: true },
      ]),
      bench(10, [{ weight: 100, reps: 8, done: true }]),
    ];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs, []);
  });

  test('a set without the done field counts as lifted', async () => {
    const history = [bench(1, [{ weight: 100, reps: 8 }]), bench(10, [{ weight: 90, reps: 8, done: true }])];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs.map((p) => p.weight), [100]);
  });

  test('a session with nothing lifted does not break a plateau', async () => {
    const history = [
      bench(1, [{ weight: 82.5, reps: 8, done: false }]),
      bench(3, [{ weight: 80, reps: 8, done: true }]),
      bench(8, [{ weight: 80, reps: 8, done: true }]),
      bench(15, [{ weight: 80, reps: 8, done: true }]),
    ];
    const result = await mod.generateWeeklySummary(history);
    assert.equal(result.plateauAlerts.length, 1);
  });

  // PR = this week's best lifted weight STRICTLY above the best lifted before
  // the window (timestamp < since). The old bar was all-time history with this
  // week inside it, so `>=` crowned a tie with the old best every single week.
  test('a tie with the best before the window is not a PR', async () => {
    const history = [bench(1, [{ weight: 80, reps: 8, done: true }]), bench(10, [{ weight: 80, reps: 8, done: true }])];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs, []);
  });

  test('beating the best before the window is a PR', async () => {
    const history = [bench(1, [{ weight: 82.5, reps: 8, done: true }]), bench(10, [{ weight: 80, reps: 8, done: true }])];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs.map((p) => [p.exercise, p.weight]), [['Bench Press', 82.5]]);
  });

  test('a plateau 80/80/80 is a plateau and not a PR in the same summary', async () => {
    const history = [1, 8, 15].map((d) => bench(d, [{ weight: 80, reps: 8, done: true }]));
    const result = await mod.generateWeeklySummary(history);
    assert.equal(result.plateauAlerts.length, 1);
    assert.deepEqual(result.prs, []);
    assert.doesNotMatch(result.summary, /PRs/);
  });

  // First lifetime session: nothing lifted before the window, nothing to beat —
  // a baseline, not a record. Otherwise a new user's first week turns every
  // logged exercise into a gold "PR" chip on the dashboard.
  test('the first lifetime session of an exercise is not a PR', async () => {
    const result = await mod.generateWeeklySummary([bench(1, [{ weight: 80, reps: 8, done: true }])]);
    assert.deepEqual(result.prs, []);
  });

  test('history before the window with nothing lifted does not make a baseline', async () => {
    const history = [bench(1, [{ weight: 80, reps: 8, done: true }]), bench(10, [{ weight: 100, reps: 8, done: false }])];
    const result = await mod.generateWeeklySummary(history);
    assert.deepEqual(result.prs, []);
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
