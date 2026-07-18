// DRUM-PERF-2 contract: the scrollTop ↔ index ↔ value math is the load-bearing
// core of the set logger — every field «0 kg» incident traced back to a
// position that stopped mapping to the value State believed. This file pins
// the mapping on EVERY render path BEFORE any of them is allowed to change:
//
//   idx    = round(scrollTop / ITEM_H)
//   value  = min + idx * step
//   commit = (idx - lastIdx) * step          (delta, never absolute)
//   height = count * ITEM_H                  (items + spacers → snap grid intact)
//
// A new render mode may only ship once this whole suite is green for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_H, buildDrum, countItems } from './drum-harness.js';

const MODES = ['legacy', 'virtual', 'window'];
const BASE = { legacy: 0, virtual: 100, window: 200 };

for (const mode of MODES) {
  const ei = (n) => BASE[mode] + n;

  test(`[${mode}] contract: built value lands at scrollTop = idx*ITEM_H (0 / 180 / 400 kg)`, async () => {
    const a = await buildDrum(ei(0), { mode, value: '0' });
    assert.equal(a.track.scrollTop, 0);
    const b = await buildDrum(ei(1), { mode, value: '180' });
    assert.equal(b.track.scrollTop, 72 * ITEM_H);
    const c = await buildDrum(ei(2), { mode, value: '400' });
    assert.equal(c.track.scrollTop, 160 * ITEM_H);
  });

  test(`[${mode}] contract: settle at a new index commits the delta, cumulatively`, async () => {
    const { track, stepWeight } = await buildDrum(ei(3), { mode }); // 180 kg = idx 72
    track.userScrollTo(80 * ITEM_H);
    track.fire('scrollend');
    assert.deepEqual(stepWeight.calls, [[ei(3), 0, 20, true]]);        // +8 idx × 2.5
    track.userScrollTo(60 * ITEM_H);
    track.fire('scrollend');
    assert.deepEqual(stepWeight.calls.at(-1), [ei(3), 0, -50, true]);  // −20 idx × 2.5
  });

  test(`[${mode}] contract: misaligned rest position rounds to the nearest index`, async () => {
    const { track, stepWeight } = await buildDrum(ei(4), { mode });    // idx 72
    track.userScrollTo(75 * ITEM_H + 10);                              // 75.28 → 75
    track.fire('scrollend');
    assert.deepEqual(stepWeight.calls, [[ei(4), 0, 7.5, true]]);
  });

  test(`[${mode}] contract: syncDrumUI seeks the position without emitting a delta`, async () => {
    const { track, stepWeight, syncDrumUI } = await buildDrum(ei(5), { mode });
    syncDrumUI('w', ei(5), 0, 100);
    assert.equal(track.scrollTop, 40 * ITEM_H);
    syncDrumUI('w', ei(5), 0, 9999); // clamps to the top of the range
    assert.equal(track.scrollTop, 160 * ITEM_H);
    assert.deepEqual(stepWeight.calls, []);
  });

  test(`[${mode}] contract: total scroll height stays count*ITEM_H (snap grid intact)`, async () => {
    const { track } = await buildDrum(ei(6), { mode });
    const itemsPx = countItems(track) * ITEM_H;
    const spacerPx = track.children
      .filter((el) => el.className === 'drum-spacer')
      .reduce((s, el) => s + (parseInt(el.style.height) || 0), 0);
    assert.equal(itemsPx + spacerPx, 161 * ITEM_H);
  });

  test(`[${mode}] contract: flushDrum commits the in-flight position once, rounded`, async () => {
    const { track, stepWeight, flushDrum } = await buildDrum(ei(7), { mode });
    track.userScrollTo(74 * ITEM_H + 8); // 74.2 → 74
    flushDrum('w', ei(7), 0);
    assert.deepEqual(stepWeight.calls, [[ei(7), 0, 5]]);
    flushDrum('w', ei(7), 0);            // one-shot
    assert.deepEqual(stepWeight.calls, [[ei(7), 0, 5]]);
  });

  test(`[${mode}] contract: reps drum maps value with the min=1 offset`, async () => {
    const { track, stepReps } = await buildDrum(ei(8), { mode, type: 'r', value: '10' });
    assert.equal(track.scrollTop, 9 * ITEM_H); // idx = (10−1)/1
    track.userScrollTo(14 * ITEM_H);           // 15 reps
    track.fire('scrollend');
    assert.deepEqual(stepReps.calls, [[ei(8), 0, 5, true]]);
  });
}

/* ── DRUM-PERF-2: drum-window specifics — the contract that distinguishes it
      from the field-failed drum-virtual path ──────────────────────────────── */

test('[window] DOM is capped at the 41-item window (161 → 41)', async () => {
  const { track } = await buildDrum(300, { mode: 'window' });
  assert.equal(countItems(track), 41);
});

test('[window] scroll ticks NEVER mutate the DOM — mid-scroll re-centre is the drum-virtual failure mode', async () => {
  const { track } = await buildDrum(301, { mode: 'window' }); // idx 72, window [52..92]
  const before = track.children.slice();
  // long drag from 180 kg down past the window edge into spacer territory
  for (let idx = 71; idx >= 45; idx--) track.userScrollTo(idx * ITEM_H);
  assert.equal(track.children.length, before.length);
  before.forEach((el, i) => assert.equal(track.children[i], el, `child ${i} was replaced mid-scroll`));
});

test('[window] scrollend re-centres the window on the committed index without moving scrollTop', async () => {
  const { track, stepWeight } = await buildDrum(302, { mode: 'window' }); // idx 72, window [52..92]
  track.userScrollTo(55 * ITEM_H);
  track.fire('scrollend');
  assert.deepEqual(stepWeight.calls, [[302, 0, -42.5, true]]); // (55−72) × 2.5
  assert.equal(track.scrollTop, 55 * ITEM_H);                  // rebuild must not yank the position
  const spacerTop = parseInt(track.children[0].style.height);
  assert.equal(spacerTop / ITEM_H, 35);                        // window now [35..75], centred on 55
  assert.equal(countItems(track), 41);
  // the rebuild created fresh nodes after the last scroll tick — the active
  // highlight must be re-applied to the committed value (found live 2026-07-18)
  const active = track.children.find((el) => el.classList.contains('drum-item--active'));
  assert.equal(active?.textContent, '137.5');
});

test('[window] rest position inside a spacer heals back to State instead of committing garbage', async () => {
  // Mandatory snap only lands on rendered items, so a rest inside a spacer is
  // corruption by definition (the BUG-DRUM-0 tripwire, now on the new path).
  const { track, stepWeight } = await buildDrum(303, { mode: 'window' }); // idx 72, window [52..92]
  track.userScrollTo(30 * ITEM_H);
  track.fire('scrollend');
  assert.deepEqual(stepWeight.calls, []);
  assert.equal(track.scrollTop, 72 * ITEM_H); // healed to the value State holds
});

test('[window] consecutive flings chain across re-centres to reach any value', async () => {
  const { track, stepWeight } = await buildDrum(304, { mode: 'window' }); // 180 kg, idx 72
  track.userScrollTo(52 * ITEM_H); // fling 1 stops at the window edge (130 kg)
  track.fire('scrollend');
  track.userScrollTo(32 * ITEM_H); // window re-centred [32..72] → fling 2 reaches 80 kg
  track.fire('scrollend');
  assert.deepEqual(stepWeight.calls,
    [[304, 0, -50, true], [304, 0, -50, true]]); // 180 → 130 → 80
});
