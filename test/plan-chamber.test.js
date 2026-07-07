// @ts-check
// DHL-CLASSIFY — the fallback plan is the blocked PPL | GIO preset, and any
// blockless exercise is chamber-classified so the DHL tracker / summary never
// collapse into a single "custom" blob.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChamber, loadPlan, savePlan, buildSession, PPL_GIO_PLAN,
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

// ── classifyChamber (pure) ───────────────────────────────────────────────────

test('classifyChamber — core moves and noDb → core', () => {
  assert.equal(classifyChamber({ name: 'Plank' }), 'core');
  assert.equal(classifyChamber({ name: 'Hanging Leg Raise' }), 'core');
  assert.equal(classifyChamber({ name: 'Hyperextensions' }), 'core');
  assert.equal(classifyChamber({ name: 'Whatever', noDb: true }), 'core');
});

test('classifyChamber — arm / delt / calf isolation → arms (accent)', () => {
  assert.equal(classifyChamber({ name: 'Bicep Curl' }), 'arms');
  assert.equal(classifyChamber({ name: 'Tricep Pushdown' }), 'arms');
  assert.equal(classifyChamber({ name: 'Lateral Raise' }), 'arms');
  assert.equal(classifyChamber({ name: 'Standing Calf Raise' }), 'arms');
  assert.equal(classifyChamber({ name: 'Face Pull' }), 'arms');
});

test('classifyChamber — big compounds → heavy', () => {
  assert.equal(classifyChamber({ name: 'Back Squat' }), 'heavy');
  assert.equal(classifyChamber({ name: 'Deadlift' }), 'heavy');
  assert.equal(classifyChamber({ name: 'Bench Press' }), 'heavy');
  assert.equal(classifyChamber({ name: 'Barbell Row' }), 'heavy');
  assert.equal(classifyChamber({ name: 'Pull-up' }), 'heavy');
  assert.equal(classifyChamber({ name: 'Leg Press' }), 'heavy');
});

test('classifyChamber — hypertrophy shaping falls through to shape', () => {
  assert.equal(classifyChamber({ name: 'Cable Fly' }), 'shape');
  assert.equal(classifyChamber({ name: 'Dumbbell Pullover' }), 'shape');
  assert.equal(classifyChamber({ name: 'Pec Deck' }), 'shape');
});

test('classifyChamber — always returns one of the four chambers', () => {
  const out = classifyChamber({ name: 'Totally Unknown Movement 42' });
  assert.ok(['heavy', 'shape', 'arms', 'core'].includes(out));
});

// ── loadPlan fallback = blocked PPL preset ───────────────────────────────────

test('loadPlan — empty storage falls back to PPL | GIO weekA (has blocks)', () => {
  const plan = loadPlan('A');
  assert.deepEqual(plan.push, PPL_GIO_PLAN.weekA.push);
  assert.ok(plan.push.every((e) => typeof e.block === 'string' && e.block.length));
});

test('loadPlan — week B fallback returns weekB variant', () => {
  const plan = loadPlan('B');
  assert.deepEqual(plan.legs, PPL_GIO_PLAN.weekB.legs);
});

test('loadPlan — fallback is a deep clone (mutating result never touches the constant)', () => {
  const plan = loadPlan('A');
  plan.push[0].name = 'MUTATED';
  assert.notEqual(PPL_GIO_PLAN.weekA.push[0].name, 'MUTATED');
});

// ── buildSession — every exercise carries a chamber ──────────────────────────

test('buildSession — preset fallback: every exercise keeps its explicit block', () => {
  const session = buildSession('push');
  assert.ok(session.length > 0);
  assert.ok(session.every((e) => typeof e.block === 'string' && e.block.length));
  assert.equal(session[0].block, 'power');
});

test('buildSession — legacy blockless saved plan is chamber-classified (no null blocks)', () => {
  // Simulate an old user who edited & saved the flat DEFAULT_PLAN (no blocks).
  savePlan({
    push: [
      { name: 'Bench Press', sets: 3, reps: 8, weight: 80 },
      { name: 'Lateral Raise', sets: 3, reps: 15, weight: 12 },
      { name: 'Plank', sets: 3, reps: 60, weight: 0 },
    ],
  }, 'A');
  const session = buildSession('push');
  const blocks = session.map((e) => e.block);
  assert.ok(blocks.every((b) => b && b !== null), 'no null blocks after classify');
  assert.deepEqual(blocks, ['heavy', 'arms', 'core']);
});
