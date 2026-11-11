import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  calendarDayMarkers,
  resolveCalendarTypeTap,
  applyCalendarTypeTap,
  removeCalendarEntry,
  restoreCalendarEntry,
  calendarStubTimestamp,
  workoutHasSets,
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

describe('ANL-A1: удаление из календаря', () => {
  const SETS = [{ name: 'Bench', sets: [{ weight: 80, reps: 5, done: true }] }];

  test('workoutHasSets: подходы или тоннаж — да, пустая заглушка — нет', () => {
    assert.equal(workoutHasSets({ exercises: SETS }), true);
    assert.equal(workoutHasSets({ exercises: [], tonnage: 300 }), true);
    assert.equal(workoutHasSets({ exercises: [{ name: 'X', sets: [] }] }), false);
    assert.equal(workoutHasSets({ exercises: [], logged: true }), false);
    assert.equal(workoutHasSets(null), false);
  });

  test('calendarDayMarkers несёт hasSets', () => {
    const ts = new Date(2026, 8, 3, 12).getTime();
    const m = calendarDayMarkers(
      [{ id: 1, type: 'push', timestamp: ts, exercises: SETS, tonnage: 400 }],
      2026,
      8
    );
    assert.equal(m[3].hasSets, true);
  });

  test('сессия с подходами не удаляется: removeCalendarEntry → null, запись цела', async () => {
    const id = await DB.Workouts.save({ type: 'push', timestamp: Date.now(), tonnage: 400, exercises: SETS });
    assert.equal(await removeCalendarEntry(id), null);
    assert.equal((await DB.Workouts.getAll()).length, 1);
  });

  test('пустая заглушка удаляется, снимок возвращается, restore даёт её назад', async () => {
    const ts = new Date(2026, 8, 1, 12).getTime();
    const { id } = await applyCalendarTypeTap({ existingId: null, type: 'legs', timestamp: ts });
    const snapshot = await removeCalendarEntry(id);
    assert.equal(snapshot.type, 'legs');
    assert.equal((await DB.Workouts.getAll()).length, 0);

    const newId = await restoreCalendarEntry(snapshot);
    const rows = await DB.Workouts.getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, newId);
    assert.equal(rows[0].type, 'legs');
    assert.equal(rows[0].timestamp, ts);
    assert.equal(rows[0].logged, true);
  });

  test('removeCalendarEntry на отсутствующий id — null, без падения', async () => {
    assert.equal(await removeCalendarEntry(null), null);
    assert.equal(await removeCalendarEntry(999999), null);
  });

  test('calendarStubTimestamp: будущий день — null, сегодня — не позже «сейчас», прошлое — полдень', () => {
    const ref = new Date(2026, 10, 11, 9, 0, 0);
    assert.equal(calendarStubTimestamp(2026, 10, 12, ref), null);
    assert.equal(calendarStubTimestamp(2027, 0, 1, ref), null);
    assert.equal(calendarStubTimestamp(2026, 10, 11, ref), ref.getTime());
    assert.equal(calendarStubTimestamp(2026, 10, 10, ref), new Date(2026, 10, 10, 12).getTime());
  });

  test('стор не создаёт заглушку в будущем', async () => {
    const future = Date.now() + 3 * 86400000;
    const r = await applyCalendarTypeTap({ existingId: null, type: 'push', timestamp: future });
    assert.equal(r.action, 'noop');
    assert.equal((await DB.Workouts.getAll()).length, 0);
  });
});
