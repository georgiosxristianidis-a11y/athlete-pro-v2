// @ts-check
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { persistFinalSession, buildSessionSummary } from '../js/workout.store.js';
import { DB } from '../js/db.js';

beforeEach(async () => {
  await DB.clearAll();
});

afterEach(async () => {
  await DB.clearAll();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const baseState = () => ({
  type: 'push',
  startedAt: Date.now() - 3600000,
  plan: [],
  blockTimings: {},
});

const ex = (overrides = {}) => ({
  name: 'Bench Press',
  block: 'power',
  isUnilateral: false,
  isBW: false,
  noDb: false,
  sets: [],
  ...overrides,
});

const set = (w, r, done = true) => ({ weight: w, reps: r, done });

const noOneRM = async () => undefined;

async function persist(state, durationMs = 600_000) {
  const summary = await buildSessionSummary(state, durationMs, { oneRMLookup: noOneRM });
  await persistFinalSession(state, summary, durationMs);
  return summary;
}

// ── Workout row ──────────────────────────────────────────────────────────────

describe('persistFinalSession — Workouts row', () => {
  test('saves type, tonnage and duration matching the summary', async () => {
    const state = { ...baseState(), plan: [ex({ sets: [set(100, 5), set(100, 5)] })] };
    await persist(state, 600_000);
    const [row] = await DB.Workouts.getAll();
    assert.equal(row.type, 'push');
    assert.equal(row.tonnage, 1000);
    assert.equal(row.duration, 600_000);
  });

  test('Camera 4 (noDb) exercises never enter the saved row', async () => {
    const state = { ...baseState(), plan: [
      ex({ name: 'Bench', sets: [set(100, 5)] }),
      ex({ name: 'Plank', block: 'core', noDb: true, sets: [set(0, 60)] }),
    ] };
    await persist(state);
    const [row] = await DB.Workouts.getAll();
    assert.equal(row.exercises.length, 1);
    assert.equal(row.exercises[0].name, 'Bench');
  });

  test('tag survives onto the saved exercise only when present', async () => {
    const state = { ...baseState(), plan: [
      ex({ name: 'Bench', tag: 'AMRAP', sets: [set(100, 5)] }),
      ex({ name: 'Squat', sets: [set(100, 5)] }),
    ] };
    await persist(state);
    const [row] = await DB.Workouts.getAll();
    const bench = row.exercises.find((e) => e.name === 'Bench');
    const squat = row.exercises.find((e) => e.name === 'Squat');
    assert.equal(bench.tag, 'AMRAP');
    assert.equal('tag' in squat, false);
  });

  test('prs and blockTimings from the summary land on the saved row', async () => {
    const state = { ...baseState(),
      blockTimings: { power: { startedAt: 1000, endedAt: 1000 + 18 * 60_000 } },
      plan: [ex({ sets: [set(60, 8)] })],
    };
    const summary = await persist(state);
    const [row] = await DB.Workouts.getAll();
    assert.deepEqual(row.prs, summary.prs);
    assert.deepEqual(row.blockTimings, state.blockTimings);
  });
});

// ── Events log ───────────────────────────────────────────────────────────────

describe('persistFinalSession — Events log', () => {
  test('logs workout_complete with type and total tonnage', async () => {
    const state = { ...baseState(), plan: [ex({ sets: [set(50, 10)] })] };
    await persist(state);
    const [event] = await DB.Events.getAll();
    assert.equal(event.type, 'workout_complete');
    assert.equal(event.payload.type, 'push');
    assert.equal(event.payload.tonnage, 500);
  });
});

// ── OneRM updates ────────────────────────────────────────────────────────────

describe('persistFinalSession — OneRM updates', () => {
  test('updates 1RM from the best completed set per exercise', async () => {
    const state = { ...baseState(), plan: [
      ex({ name: 'Squat', sets: [set(90, 5), set(110, 3), set(100, 4)] }),
    ] };
    await persist(state);
    const record = await DB.OneRM.get('Squat');
    assert.equal(record.value, DB.OneRM.epley(110, 3));
  });

  test('Camera 4 (noDb) exercises never get a 1RM record', async () => {
    const state = { ...baseState(), plan: [
      ex({ name: 'Plank', block: 'core', noDb: true, sets: [set(0, 60)] }),
    ] };
    await persist(state);
    const record = await DB.OneRM.get('Plank');
    assert.equal(record, undefined);
  });

  test('an exercise with no completed sets does not touch 1RM', async () => {
    const state = { ...baseState(), plan: [
      ex({ name: 'Bench', sets: [set(100, 5, false)] }),
    ] };
    await persist(state);
    const record = await DB.OneRM.get('Bench');
    assert.equal(record, undefined);
  });
});
