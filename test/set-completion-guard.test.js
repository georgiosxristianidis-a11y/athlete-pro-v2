// @ts-check
// BUG-0KG — a non-bodyweight set left at the seed's weight:0 must not
// complete (it would silently zero tonnage and dashboard analytics), while
// bodyweight lifts legitimately log 0 = BW. The guard predicate lives in the
// store; these tests also pin the seed-plan invariants the guard relies on.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  canCompleteSet, buildSession, PPL_GIO_PLAN,
} from '../js/workout.store.js';

/** Minimal Map-backed localStorage so the store's persistence helpers run. */
function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(mockStorage);

// ── canCompleteSet (pure) ────────────────────────────────────────────────────

test('canCompleteSet — non-BW set at 0 kg is blocked', () => {
  assert.equal(canCompleteSet({ isBW: false }, { done: false, weight: 0 }), false);
});

test('canCompleteSet — non-BW set with missing/NaN-ish weight is blocked', () => {
  assert.equal(canCompleteSet({ isBW: false }, { done: false }), false);
  assert.equal(canCompleteSet({}, { done: false, weight: undefined }), false);
});

test('canCompleteSet — non-BW set with a positive weight completes', () => {
  assert.equal(canCompleteSet({ isBW: false }, { done: false, weight: 2.5 }), true);
  assert.equal(canCompleteSet({}, { done: false, weight: 80 }), true);
});

test('canCompleteSet — BW lift completes at 0 (0 means bodyweight)', () => {
  assert.equal(canCompleteSet({ isBW: true }, { done: false, weight: 0 }), true);
});

test('canCompleteSet — un-doing an already done set is always allowed', () => {
  assert.equal(canCompleteSet({ isBW: false }, { done: true, weight: 0 }), true);
});

// ── Seed-plan invariants the guard depends on ────────────────────────────────

const allSeedExercises = () => {
  const out = [];
  for (const week of Object.values(PPL_GIO_PLAN)) {
    for (const day of Object.values(week)) out.push(...day);
  }
  return out;
};

test('PPL_GIO_PLAN — every noDb (core/align checklist) exercise is isBW, so the guard never locks it', () => {
  for (const ex of allSeedExercises()) {
    if (ex.noDb) assert.equal(ex.isBW, true, `${ex.name} is noDb but not isBW — guard would block it at 0 kg`);
  }
});

test('PPL_GIO_PLAN — seed weight:0 means every non-BW lift starts blocked until a weight is entered', () => {
  for (const ex of allSeedExercises()) {
    const set = { done: false, weight: ex.weight };
    assert.equal(canCompleteSet(ex, set), !!ex.isBW, ex.name);
  }
});

// ── buildSession must carry isBW through, or BW lifts get wrongly guarded ────

test('buildSession — preset fallback preserves isBW on every exercise', () => {
  const session = buildSession('push');
  const byName = new Map(session.map((e) => [e.name, e]));
  const dips = byName.get('Dips (Chest Focus)');
  assert.ok(dips, 'seed exercise missing from session');
  assert.equal(dips.isBW, true);
  const bench = byName.get('Flat Barbell Bench Press');
  assert.ok(bench);
  assert.equal(bench.isBW, false);
});
