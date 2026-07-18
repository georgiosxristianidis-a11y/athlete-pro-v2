// BUG-DRUM-0 repro: a set logged as «0×1» — weight zeroed on completion.
// display:none (set-done row, collapsed card, hidden screen) resets a drum
// track's scrollTop to 0 and does NOT restore it on reshow. The clientHeight
// guard (fd99a2e) only blocks reads while hidden; after reshow the track is
// laid out again, scrollTop is 0, lastIdx is stale → flushDrum computes a
// huge negative delta → weight 0, reps clamp to 1.
//
// DOM stubs (FakeTrack et al.) live in drum-harness.js, shared with the
// DRUM-PERF-2 contract suite (drum-contract.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_H, FakeTrack, buildDrum, roInstances, countItems, activeItem,
} from './drum-harness.js';

/* ── tests — every BUG-DRUM-0 trust guard must hold on EVERY render path
      (legacy full range / drum-virtual live window / drum-window) ────────── */

// _drums is keyed `${type}-${ei}-${si}` inside the (cached) module — give
// each mode its own ei range so the drums never collide.
const GUARD_BASE = { legacy: 0, virtual: 10, window: 50 };

for (const mode of ['legacy', 'virtual']) {
  const label = `[${mode}]`;
  const base = GUARD_BASE[mode];

  test(`${label} repro BUG-DRUM-0: flushDrum after hide→reshow must not zero the weight`, async () => {
    const { track, stepWeight, flushDrum } = await buildDrum(base + 0, { mode });
    assert.equal(track.scrollTop, 72 * ITEM_H); // sanity: built at 180 kg

    track.hide();   // .set-done → display:none → scrollTop lost
    track.show();   // un-check / card expand → laid out again at scrollTop 0

    flushDrum('w', base + 0, 0); // tap set-check
    // Pre-fix: stepWeight(ei, 0, -180) — the phantom that logs «0×1»
    assert.deepEqual(stepWeight.calls, []);
  });

  test(`${label} repro BUG-DRUM-0: drum built without layout must not flush a phantom delta`, async () => {
    // renderActive on a hidden screen / collapsed card: scrollTop write dropped
    const { track, stepWeight, flushDrum } = await buildDrum(base + 1, { hidden: true, mode });
    track.show();
    assert.equal(track.scrollTop, 0); // browser kept the dropped write

    flushDrum('w', base + 1, 0);
    assert.deepEqual(stepWeight.calls, []);
  });

  test(`${label} reshow heals the drum position from state (lastIdx)`, async () => {
    const { track } = await buildDrum(base + 2, { mode });
    track.hide();
    track.show();
    roInstances.forEach((ro) => ro.cb()); // layout returned → ResizeObserver
    assert.equal(track.scrollTop, 72 * ITEM_H); // back at 180 kg
  });

  test(`${label} genuine quick tap still flushes the in-flight scroll`, async () => {
    const { track, stepWeight, flushDrum } = await buildDrum(base + 3, { mode });
    track.userScrollTo(74 * ITEM_H); // user scrolls 180 → 185
    flushDrum('w', base + 3, 0);     // taps check before settle
    assert.deepEqual(stepWeight.calls, [[base + 3, 0, 5]]);
    // and the flush is one-shot: a second tap must not re-apply it
    flushDrum('w', base + 3, 0);
    assert.deepEqual(stepWeight.calls, [[base + 3, 0, 5]]);
  });

  test(`${label} scrollend settle still commits a genuine user scroll`, async () => {
    const { track, stepWeight } = await buildDrum(base + 4, { mode });
    track.userScrollTo(70 * ITEM_H); // 180 → 175
    track.fire('scrollend');
    assert.deepEqual(stepWeight.calls, [[base + 4, 0, -5, true]]);
  });

  test(`${label} fd99a2e guard holds: stray scrollend while hidden stays silent`, async () => {
    const { track, stepWeight } = await buildDrum(base + 5, { mode });
    track.hide(); // fires stray scroll + scrollend at scrollTop 0
    assert.deepEqual(stepWeight.calls, []);
  });
}

/* ── PERF-DRUM: virtual-window specifics ───────────────────────────────── */

test('[virtual] renders a window, not the full 161-item range', async () => {
  const { track } = await buildDrum(20, { mode: 'virtual' });
  assert.equal(countItems(track), 15);
  // spacers preserve the full scroll height: 161 items ↔ 15 real + padding
  const spacers = track.children.filter((el) => el.className === 'drum-spacer');
  assert.equal(spacers.length, 2);
  const padPx = spacers.reduce((s, el) => s + parseInt(el.style.height), 0);
  assert.equal(padPx + countItems(track) * ITEM_H, 161 * ITEM_H);
});

test('[virtual] window follows a long user scroll and keeps DOM bounded', async () => {
  const { track } = await buildDrum(21, { mode: 'virtual' });
  // fling 180 kg → 40 kg (idx 72 → 16), crossing well past the window edge
  for (let idx = 71; idx >= 16; idx--) track.userScrollTo(idx * ITEM_H);
  assert.equal(countItems(track), 15);
  // the active index must sit inside the rendered window
  const spacerTop = parseInt(track.children[0].style.height);
  const start = spacerTop / ITEM_H;
  assert.ok(start <= 16 && 16 <= start + 14, `idx 16 outside window [${start}..${start + 14}]`);
});

test('[legacy] full range still renders all 161 items (proven path untouched)', async () => {
  const { track } = await buildDrum(6, { mode: 'legacy' });
  assert.equal(countItems(track), 161);
});

/* ── BUG-7 repro: "+ add set" numbers vanish (fixed b7bab66, folded into the
      drum-fix line alongside fd99a2e) ──────────────────────────────────────
   addSet() rebuilds the sets-wrap via innerHTML, which throws away the old
   .drum-wrap (and its [data-drum-init] marker) and gives the new row a brand
   new, empty .drum-track. Without re-running initDrumPickers() after that
   swap, the new row's track never gets a .drum-item--active element at all
   (or, if some stale item survives, it can carry the wrong number) — the
   picker renders with no visible active value. */

/** Simulate addSet(): wipe the row's DOM (innerHTML replacement) and hand back
 *  a fresh wrap/track pair for the same key, as the real DOM would after the
 *  old nodes are discarded. Optionally re-run initDrumPickers() afterward —
 *  the caller decides, so the test can prove the fix requires that call. */
function simulateAddSetRerender(ei, { value = '80', si = 0 } = {}) {
  const track = new FakeTrack();
  const wrap = {
    dataset: { type: 'w', ei: String(ei), si: String(si), value },
    querySelector: () => track,
  };
  globalThis.document._wraps.push(wrap);
  return track;
}

const BUG7_BASE = { legacy: 30, virtual: 40, window: 60 };

for (const mode of ['legacy', 'virtual']) {
  const label = `[${mode}]`;
  const base = BUG7_BASE[mode];

  test(`${label} BUG-7 repro: add-set row rebuild must re-init the drum with a visible active number`, async () => {
    const { initDrumPickers, track: firstTrack } = await buildDrum(base + 0, { mode, value: '80' });
    assert.ok(activeItem(firstTrack), 'sanity: initial build has an active item');
    assert.equal(activeItem(firstTrack).textContent, '80');

    // addSet(): innerHTML = ... replaces the row -> fresh, un-initialised track/wrap.
    const newTrack = simulateAddSetRerender(base + 0, { value: '80' });
    assert.equal(newTrack.children.length, 0); // freshly wiped, nothing rendered yet

    // The real fix re-runs initDrumPickers() after the rebuild (handlers.js).
    initDrumPickers();

    const active = activeItem(newTrack);
    assert.ok(active, 'new row must have a .drum-item--active element after rebuild');
    assert.notEqual(active.textContent, '', 'active element must show a value, not blank');
    assert.equal(active.textContent, '80', 'active element must show the row\'s own value, not stale/wrong number');
  });

  test(`${label} BUG-7 repro: without re-running initDrumPickers, the rebuilt row has no active number`, async () => {
    const { track: firstTrack } = await buildDrum(base + 1, { mode, value: '80' });
    assert.ok(activeItem(firstTrack));

    const newTrack = simulateAddSetRerender(base + 1, { value: '80' });
    // Deliberately skip initDrumPickers() here — this is the pre-fix behaviour
    // (BUG-7): the new track is left exactly as innerHTML rebuild produced it,
    // with no drum items at all, so there is no visible active number.
    assert.equal(activeItem(newTrack), undefined, 'pre-fix: rebuilt row has no active item to show a number');
  });

  test(`${label} BUG-7 repro: second add-set on a multi-row exercise gives each row its own correct value`, async () => {
    const { initDrumPickers, track: row0 } =
      await buildDrum(base + 2, { mode, value: '60' });
    // second row, same exercise, different weight — mimics ex.sets[1] with its
    // own lastSet-derived value once addSet() pushes a new set.
    const row1 = simulateAddSetRerender(base + 2, { value: '100', si: 1 });
    initDrumPickers();

    assert.equal(activeItem(row0).textContent, '60');
    const active1 = activeItem(row1);
    assert.ok(active1, 'second row must also get an active element');
    assert.equal(active1.textContent, '100', 'second row must not inherit the first row\'s stale value');
  });
}
