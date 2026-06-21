// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionSummary, BLOCK_LABEL } from '../js/workout.store.js';

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

/** Default no-1RM-on-record lookup (every lift is a PR candidate). */
const noOneRM = async () => undefined;

// ── Duration ────────────────────────────────────────────────────────────────

test('timeStr — under an hour uses minutes only', async () => {
  const s = await buildSessionSummary(baseState(), 25 * 60_000, { oneRMLookup: noOneRM });
  assert.equal(s.timeStr, '25m');
});

test('timeStr — at least an hour uses h + zero-padded m', async () => {
  const s = await buildSessionSummary(baseState(), 3600_000 + 5 * 60_000, { oneRMLookup: noOneRM });
  assert.equal(s.timeStr, '1h 05m');
});

test('timeStr — defensive against null/negative durations', async () => {
  // @ts-ignore — testing the defensive branch
  const s = await buildSessionSummary(baseState(), null, { oneRMLookup: noOneRM });
  assert.equal(s.timeStr, '0m');
});

// ── Tonnage + reps ─────────────────────────────────────────────────────────

test('empty plan — zero totals, empty blocks and prs', async () => {
  const s = await buildSessionSummary(baseState(), 3600_000, { oneRMLookup: noOneRM });
  assert.equal(s.type, 'push');
  assert.equal(s.totalTonnage, 0);
  assert.equal(s.totalReps, 0);
  assert.deepEqual(s.blocks, []);
  assert.deepEqual(s.prs, []);
});

test('tonnage and reps aggregate over completed sets', async () => {
  const state = { ...baseState(), plan: [
    ex({ sets: [set(100, 5), set(100, 5), set(100, 5)] }),
  ] };
  const s = await buildSessionSummary(state, 1_800_000, { oneRMLookup: noOneRM });
  assert.equal(s.totalTonnage, 1500);  // 100 × 5 × 3
  assert.equal(s.totalReps, 15);
});

test('unfinished sets do not contribute to totals', async () => {
  const state = { ...baseState(), plan: [
    ex({ sets: [set(100, 5), set(100, 5, false), set(100, 5)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.totalTonnage, 1000);
  assert.equal(s.totalReps, 10);
});

test('isUnilateral doubles tonnage (Iso-Lateral Row safeguard)', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Iso-Lateral Row', isUnilateral: true, sets: [set(50, 10)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.totalTonnage, 1000);  // 50 × 10 × 2
  // And it propagates to the block tonnage too:
  assert.equal(s.blocks[0].tonnage, 1000);
});

// ── Camera 4 / Core (noDb) ─────────────────────────────────────────────────

test('Camera 4 (noDb) is shown but contributes zero tonnage', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Bench', sets: [set(100, 5)] }),
    ex({ name: 'Plank', block: 'core', noDb: true, sets: [set(0, 60)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.totalTonnage, 500);

  const coreBlock = s.blocks.find((b) => b.id === 'core');
  assert.ok(coreBlock, 'Core block must appear in the list (UI shows it)');
  assert.equal(coreBlock.tonnage, 0);
  assert.equal(coreBlock.exercises[0].noDb, true);
});

test('Camera 4 exercises can never earn a PR (no 1RM update)', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Plank', block: 'core', noDb: true, sets: [set(0, 60)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.prs.length, 0);
});

// ── PR detection ───────────────────────────────────────────────────────────

test('PR fires when no stored 1RM exists (first-ever lift)', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Bench', sets: [set(60, 8)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.prs.length, 1);
  assert.deepEqual(s.prs[0], { name: 'Bench', weight: 60, reps: 8 });
});

test('PR fires when new Epley estimate strictly exceeds stored 1RM', async () => {
  // 105 × (1 + 5/30) = 122.5 → rounds to 123. Stored 110 → PR.
  const state = { ...baseState(), plan: [
    ex({ name: 'Bench Press', sets: [set(105, 5)] }),
  ] };
  const oneRMLookup = async () => ({ value: 110 });
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup });
  assert.equal(s.prs.length, 1);
  assert.deepEqual(s.prs[0], { name: 'Bench Press', weight: 105, reps: 5 });
});

test('No PR when new estimate ties or is below stored 1RM', async () => {
  // 80 × (1 + 5/30) = 93.3 → rounds to 93. Stored 130 → no PR.
  const state = { ...baseState(), plan: [
    ex({ name: 'Bench', sets: [set(80, 5)] }),
  ] };
  const oneRMLookup = async () => ({ value: 130 });
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup });
  assert.equal(s.prs.length, 0);
});

test('PR uses best completed set (sorted by weight)', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Squat', sets: [set(90, 5), set(110, 3), set(100, 4)] }),
  ] };
  const oneRMLookup = async () => ({ value: 100 });
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup });
  // Best set: 110 × 3 → Epley ≈ 121 → PR over 100.
  assert.equal(s.prs.length, 1);
  assert.equal(s.prs[0].weight, 110);
  assert.equal(s.prs[0].reps, 3);
});

// ── weightStr formatting ────────────────────────────────────────────────────

test('weightStr — kg / BW / BW+plate', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Pull-up',          isBW: true, sets: [set(0, 10)] }),
    ex({ name: 'Weighted Pull-up', isBW: true, sets: [set(10, 8)] }),
    ex({ name: 'Bench',                       sets: [set(100, 5)] }),
    ex({ name: 'Skipped',                     sets: [set(0, 0, false)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  const exs = s.blocks.flatMap((b) => b.exercises);
  assert.equal(exs[0].weightStr, 'BW');
  assert.equal(exs[1].weightStr, 'BW+10');
  assert.equal(exs[2].weightStr, '100 kg');
  assert.equal(exs[3].weightStr, '—');
});

// ── Blocks ─────────────────────────────────────────────────────────────────

test('block list preserves insertion order from State.plan', async () => {
  const state = { ...baseState(), plan: [
    ex({ name: 'Bench', block: 'power' }),
    ex({ name: 'Curl', block: 'arms' }),
    ex({ name: 'Plank', block: 'core', noDb: true }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.deepEqual(s.blocks.map((b) => b.id), ['power', 'arms', 'core']);
});

test('block label is uppercase semantic from BLOCK_LABEL', async () => {
  const state = { ...baseState(), plan: [
    ex({ block: 'power' }),
    ex({ block: 'shape' }),
    ex({ block: 'core' }),
    ex({ block: 'mystery' }),  // unknown id → uppercased as-is
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.blocks[0].label, BLOCK_LABEL.power);
  assert.equal(s.blocks[1].label, BLOCK_LABEL.shape);
  assert.equal(s.blocks[2].label, BLOCK_LABEL.core);
  assert.equal(s.blocks[3].label, 'MYSTERY');
});

// ── Block timings (W-2-A) ──────────────────────────────────────────────────

test('blockTimings → durationStr in minutes', async () => {
  const state = {
    ...baseState(),
    blockTimings: { power: { startedAt: 1000, endedAt: 1000 + 18 * 60_000 } },
    plan: [ex({ sets: [set(100, 5)] })],
  };
  const s = await buildSessionSummary(state, 3600_000, { oneRMLookup: noOneRM });
  const powerBlock = s.blocks.find((b) => b.id === 'power');
  assert.equal(powerBlock.durationStr, '18m');
});

test('missing or invalid blockTimings → durationStr stays null', async () => {
  const cases = [
    {},
    { power: { startedAt: 0, endedAt: 0 } },
    { power: { startedAt: 1000, endedAt: 1000 } },     // zero-length
    { power: { startedAt: 2000, endedAt: 1000 } },     // end before start
  ];
  for (const blockTimings of cases) {
    const state = { ...baseState(), blockTimings, plan: [ex({ sets: [set(100, 5)] })] };
    const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
    assert.equal(s.blocks[0].durationStr, null);
  }
});

test('doneSets and totalSets report correctly', async () => {
  const state = { ...baseState(), plan: [
    ex({ sets: [set(100, 5), set(100, 5, false), set(100, 5)] }),
  ] };
  const s = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  const exo = s.blocks[0].exercises[0];
  assert.equal(exo.doneSets, 2);
  assert.equal(exo.totalSets, 3);
});
