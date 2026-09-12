import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  calendarDayMarkers,
  resolveCalendarTypeTap,
  applyCalendarTypeTap,
} from '../js/analytics.store.js';
import { DB } from '../js/db.js';

beforeEach(async () => {
  await DB.clearAll();
});

afterEach(async () => {
  await DB.clearAll();
});

describe('resolveCalendarTypeTap', () => {
  test('empty day → create a logged stub', () => {
    assert.equal(resolveCalendarTypeTap(null, 'push'), 'create');
    assert.equal(resolveCalendarTypeTap(undefined, 'pull'), 'create');
  });

  test('tombstone is treated as empty', () => {
    assert.equal(resolveCalendarTypeTap({ type: 'push', _deleted: true }, 'push'), 'create');
  });

  test('tapping the already-active type is a no-op', () => {
    assert.equal(
      resolveCalendarTypeTap(
        {
          type: 'push',
          exercises: [{ name: 'Bench', sets: [{ weight: 80, reps: 5, done: true }] }],
        },
        'push'
      ),
      'noop'
    );
  });

  test('different type retags in place — never replace', () => {
    assert.equal(
      resolveCalendarTypeTap(
        {
          type: 'push',
          exercises: [{ name: 'Bench', sets: [{ weight: 80, reps: 5, done: true }] }],
        },
        'pull'
      ),
      'retag'
    );
  });

  test('empty logged stub can still be retagged', () => {
    assert.equal(resolveCalendarTypeTap({ type: 'push', exercises: [] }, 'legs'), 'retag');
  });
});

describe('calendarDayMarkers', () => {
  const y = 2026;
  const m = 8; // September
  const day = (h, type, id) => ({
    id,
    type,
    timestamp: new Date(y, m, 7, h).getTime(),
  });

  test('newest session of the day wins regardless of array order', () => {
    const older = day(9, 'push', 'old');
    const newer = day(18, 'pull', 'new');
    const fromOldestFirst = calendarDayMarkers([older, newer], y, m);
    const fromNewestFirst = calendarDayMarkers([newer, older], y, m);
    assert.equal(fromOldestFirst[7].id, 'new');
    assert.equal(fromNewestFirst[7].id, 'new');
    assert.equal(fromNewestFirst[7].type, 'pull');
  });

  test('skips other months and tombstones', () => {
    const keep = day(12, 'legs', 'keep');
    const otherMonth = { id: 'aug', type: 'push', timestamp: new Date(y, 7, 7, 12).getTime() };
    const dead = { ...day(15, 'push', 'dead'), _deleted: true };
    const days = calendarDayMarkers([dead, otherMonth, keep], y, m);
    assert.deepEqual(Object.keys(days), ['7']);
    assert.equal(days[7].id, 'keep');
  });
});

describe('applyCalendarTypeTap — no silent wipe', () => {
  test('retag keeps sets, tonnage and PRs', async () => {
    const exercises = [
      {
        name: 'Bench Press',
        sets: [
          { weight: 80, reps: 5, done: true },
          { weight: 82.5, reps: 4, done: true },
        ],
      },
    ];
    const id = await DB.Workouts.save({
      type: 'push',
      timestamp: new Date(2026, 8, 7, 12).getTime(),
      duration: 3600000,
      tonnage: 730,
      exercises,
      prs: [{ name: 'Bench Press', weight: 82.5, reps: 4 }],
    });

    const result = await applyCalendarTypeTap({
      existingId: id,
      type: 'pull',
      timestamp: new Date(2026, 8, 7, 12).getTime(),
    });
    assert.equal(result.action, 'retag');

    const row = await DB.Workouts.get(id);
    assert.equal(row.type, 'pull');
    assert.equal(row.tonnage, 730);
    assert.equal(row.duration, 3600000);
    assert.deepEqual(row.exercises, exercises);
    assert.equal(row.prs.length, 1);

    const all = await DB.Workouts.getAll();
    assert.equal(all.length, 1, 'must not add a second empty row');
  });

  test('tapping the same type does not tombstone the session', async () => {
    const id = await DB.Workouts.save({
      type: 'push',
      timestamp: Date.now(),
      tonnage: 500,
      exercises: [{ name: 'OHP', sets: [{ weight: 50, reps: 6, done: true }] }],
    });

    const result = await applyCalendarTypeTap({
      existingId: id,
      type: 'push',
      timestamp: Date.now(),
    });
    assert.equal(result.action, 'noop');

    const raw = await DB._getRaw('workouts', id);
    assert.equal(raw._deleted, undefined);
    assert.equal(raw.tonnage, 500);
    assert.equal((await DB.Workouts.getAll()).length, 1);
  });

  test('empty day still creates a logged stub', async () => {
    const ts = new Date(2026, 8, 1, 12).getTime();
    const result = await applyCalendarTypeTap({ existingId: null, type: 'legs', timestamp: ts });
    assert.equal(result.action, 'create');
    const row = await DB.Workouts.get(result.id);
    assert.equal(row.type, 'legs');
    assert.equal(row.logged, true);
    assert.deepEqual(row.exercises, []);
  });
});
