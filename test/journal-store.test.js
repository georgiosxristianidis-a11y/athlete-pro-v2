/**
 * Guard for the workout journal store (card LOG-1).
 *
 * The journal is the only screen that answers "what did I do back then":
 * everything a user can reach there goes through filtering, paging and
 * grouping in js/journal.store.js. The view is DOM, so the logic is tested
 * here — filter + search must not disagree with the counters shown on the
 * segments, and paging must not silently hide rows.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../js/journal.store.js');

/** Workout fixture — only the fields the journal actually reads. */
const w = (id, type, ts, exercises = [], extra = {}) => ({
  id,
  type,
  timestamp: ts,
  duration: 45 * 60000,
  tonnage: 1000,
  exercises,
  ...extra,
});

const ex = (name, sets) => ({ name, sets });
const set = (weight, reps, done = true) => ({ weight, reps, done });

const D = (y, m, d) => new Date(y, m, d, 12).getTime();

const SAMPLE = [
  w(3, 'legs', D(2026, 6, 20), [ex('Leg Press', [set(200, 8), set(200, 8)])]),
  w(2, 'pull', D(2026, 6, 5), [ex('Barbell Row', [set(80, 10)])], { prs: [{ name: 'Barbell Row' }] }),
  w(1, 'push', D(2026, 5, 28), [
    ex('Bench Press', [set(100, 5), set(100, 5), set(100, 4, false)]),
    ex('Overhead Press', [set(50, 8)]),
  ]),
];

beforeEach(() => {
  S.JournalState.all = SAMPLE.slice();
  S.JournalState.type = 'all';
  S.JournalState.query = '';
  S.JournalState.visible = S.PAGE_SIZE;
});

describe('filtering', () => {
  test('type filter keeps only that PPL day', () => {
    const out = S.filterWorkouts(SAMPLE, { type: 'push' });
    assert.deepEqual(out.map((x) => x.id), [1]);
  });

  test('all is not a filter', () => {
    assert.equal(S.filterWorkouts(SAMPLE, { type: 'all' }).length, 3);
  });

  test('search matches an exercise name, case- and space-insensitively', () => {
    assert.deepEqual(S.filterWorkouts(SAMPLE, { query: '  BENCH  ' }).map((x) => x.id), [1]);
  });

  test('search matches a substring in the middle of a name', () => {
    assert.deepEqual(S.filterWorkouts(SAMPLE, { query: 'press' }).map((x) => x.id), [3, 1]);
  });

  test('type and search combine (AND, not OR)', () => {
    assert.deepEqual(S.filterWorkouts(SAMPLE, { type: 'legs', query: 'press' }).map((x) => x.id), [3]);
    assert.equal(S.filterWorkouts(SAMPLE, { type: 'pull', query: 'press' }).length, 0);
  });

  test('unknown exercise finds nothing', () => {
    assert.equal(S.filterWorkouts(SAMPLE, { query: 'zercher' }).length, 0);
  });

  test('newest-first order from the DB survives filtering', () => {
    assert.deepEqual(S.filterWorkouts(SAMPLE, {}).map((x) => x.id), [3, 2, 1]);
  });

  test('a workout with no exercises is not matched by a search', () => {
    const bare = [w(9, 'push', D(2026, 6, 1))];
    assert.equal(S.filterWorkouts(bare, { query: 'bench' }).length, 0);
    assert.equal(S.filterWorkouts(bare, {}).length, 1);
  });
});

describe('segment counters', () => {
  test('counters cover every type, not just the active one', () => {
    assert.deepEqual(S.typeCounts(SAMPLE), { all: 3, push: 1, pull: 1, legs: 1 });
  });

  test('counters respect the search box', () => {
    assert.deepEqual(S.typeCounts(SAMPLE, 'press'), { all: 2, push: 1, pull: 0, legs: 1 });
  });
});

describe('set counting', () => {
  test('skipped sets do not count as done', () => {
    assert.equal(S.doneSetCount(SAMPLE[2]), 3); // 2 bench + 1 OHP, третий бенч пропущен
  });

  test('legacy rows without a done flag count as done', () => {
    const legacy = w(9, 'push', D(2026, 6, 1), [ex('Dip', [{ weight: 0, reps: 10 }, { weight: 0, reps: 8 }])]);
    assert.equal(S.doneSetCount(legacy), 2);
  });

  test('summarize reports what the row shows', () => {
    const s = S.summarize(SAMPLE[2]);
    assert.equal(s.id, 1);
    assert.equal(s.exerciseCount, 2);
    assert.equal(s.setCount, 3);
    assert.equal(s.prCount, 0);
    assert.equal(S.summarize(SAMPLE[1]).prCount, 1);
  });
});

describe('month grouping', () => {
  test('consecutive rows of one month land in one group', () => {
    const groups = S.groupByMonth(SAMPLE);
    assert.deepEqual(groups.map((g) => g.key), ['2026-07', '2026-06']);
    assert.deepEqual(groups[0].items.map((x) => x.id), [3, 2]);
    assert.deepEqual(groups[1].items.map((x) => x.id), [1]);
  });

  test('group anchor is the first day of that month', () => {
    const [july] = S.groupByMonth(SAMPLE);
    const d = new Date(july.ts);
    assert.equal(d.getDate(), 1);
    assert.equal(d.getMonth(), 6);
  });

  test('empty input gives no groups', () => {
    assert.deepEqual(S.groupByMonth([]), []);
  });
});

describe('paging', () => {
  const many = Array.from({ length: 55 }, (_, i) =>
    w(i + 1, 'push', D(2026, 6, 1) + i * 86400000, [ex('Bench Press', [set(100, 5)])]));

  beforeEach(() => {
    S.JournalState.all = many;
    S.resetPaging();
  });

  test('first render shows exactly one page', () => {
    assert.equal(S.visibleSlice().page.length, S.PAGE_SIZE);
    assert.equal(S.visibleSlice().filtered.length, 55);
    assert.equal(S.hasMore(), true);
  });

  test('loadMore adds a page and stops at the end', () => {
    assert.equal(S.loadMore(), true);
    assert.equal(S.visibleSlice().page.length, 2 * S.PAGE_SIZE);
    assert.equal(S.loadMore(), true);
    assert.equal(S.visibleSlice().page.length, 55, 'последняя страница обрезана по длине списка');
    assert.equal(S.hasMore(), false);
    assert.equal(S.loadMore(), false, 'дальше конца не листаем');
  });

  test('a filter that shrinks the list below one page leaves nothing to load', () => {
    S.JournalState.query = 'bench';
    S.JournalState.type = 'legs';
    S.resetPaging();
    assert.equal(S.visibleSlice().page.length, 0);
    assert.equal(S.hasMore(), false);
  });

  test('resetPaging returns to the first page', () => {
    S.loadMore();
    S.loadMore();
    S.resetPaging();
    assert.equal(S.JournalState.visible, S.PAGE_SIZE);
  });
});

describe('lookup', () => {
  test('findWorkout accepts the id as a string (it arrives from a data attribute)', () => {
    assert.equal(S.findWorkout('2')?.id, 2);
    assert.equal(S.findWorkout(2)?.id, 2);
  });

  test('unknown id gives null, not undefined', () => {
    assert.equal(S.findWorkout(999), null);
  });
});
