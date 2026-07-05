// BUG-DRUM-0 repro: a set logged as «0×1» — weight zeroed on completion.
// display:none (set-done row, collapsed card, hidden screen) resets a drum
// track's scrollTop to 0 and does NOT restore it on reshow. The clientHeight
// guard (fd99a2e) only blocks reads while hidden; after reshow the track is
// laid out again, scrollTop is 0, lastIdx is stale → flushDrum computes a
// huge negative delta → weight 0, reps clamp to 1.
//
// DOM is stubbed: FakeTrack mimics the field browser's behaviour where a
// hidden element zeroes scrollTop (and fires a stray scroll) and silently
// drops scrollTop writes while it has no layout.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ITEM_H = 36;

/* ── DOM stubs ─────────────────────────────────────────────────────────── */

function makeEl() {
  const el = {
    className: '', textContent: '', style: {},
    classList: {
      toggle(cls, force) {
        const has = el.className.split(' ').filter(Boolean).includes(cls);
        const want = force === undefined ? !has : force;
        if (want) el.classList.add(cls); else el.classList.remove(cls);
      },
      add(cls) {
        const parts = el.className.split(' ').filter(Boolean);
        if (!parts.includes(cls)) { parts.push(cls); el.className = parts.join(' '); }
      },
      remove(cls) {
        el.className = el.className.split(' ').filter((c) => c && c !== cls).join(' ');
      },
      contains(cls) { return el.className.split(' ').filter(Boolean).includes(cls); },
    },
  };
  return el;
}

class FakeTrack {
  constructor({ hidden = false } = {}) {
    this._scrollTop = 0;
    this.clientHeight = hidden ? 0 : 108;
    this.style = {};
    this.children = [];
    this.listeners = {};
  }
  get scrollTop() { return this._scrollTop; }
  // Field-browser semantics: writes to a non-laid-out element are dropped.
  set scrollTop(v) { if (this.clientHeight) this._scrollTop = Math.max(0, v); }
  appendChild(node) { this.children.push(...(node.items ?? [node])); }
  insertBefore(node, ref) {
    const list = node.items ?? [node];
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, ...list);
  }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelectorAll() { return this.children.filter((el) => el.className.includes('drum-item')); }
  fire(type) { (this.listeners[type] ?? []).forEach((fn) => fn()); }
  /* display:none — scrollTop collapses to 0 + stray scroll/scrollend fire */
  hide() {
    this.clientHeight = 0;
    this._scrollTop = 0;
    this.fire('scroll');
    this.fire('scrollend');
  }
  /* element laid out again — scrollTop is NOT restored by the browser */
  show() { this.clientHeight = 108; }
  userScrollTo(v) {
    this._scrollTop = v;
    this.fire('scroll');
  }
}

const _roInstances = [];

function setupGlobals() {
  globalThis.window ??= {};
  // key present → drum-picker registers the controllable scrollend path
  if (!('onscrollend' in globalThis.window)) globalThis.window.onscrollend = null;
  if (!globalThis.navigator) globalThis.navigator = {};
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; _roInstances.push(this); }
    observe(t) { this.target = t; }
    disconnect() {}
  };
  globalThis.document = {
    _wraps: [],
    querySelectorAll() { return this._wraps.splice(0); },
    createElement() { return makeEl(); },
    createDocumentFragment() {
      return { items: [], appendChild(el) { this.items.push(el); } };
    },
  };
}

function spy() {
  const calls = [];
  const fn = (...args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

/** Build one weight drum at 180 kg (idx 72) for exercise `ei`. */
async function buildDrum(ei, { hidden = false, value = '180', virt = false } = {}) {
  setupGlobals();
  // PERF-DRUM: force the 'drum-virtual' flag per build (flags.js reads
  // localStorage on every flag() call, so this wins over DEFAULTS).
  globalThis.localStorage = {
    getItem: (k) => (k === 'ap-flag-drum-virtual' ? (virt ? '1' : '0') : null),
  };
  const { initDrumPickers, flushDrum, syncDrumUI } =
    await import('../js/ui/drum-picker.js');
  const track = new FakeTrack({ hidden });
  const wrap = {
    dataset: { type: 'w', ei: String(ei), si: '0', value },
    querySelector: () => track,
  };
  const stepWeight = spy();
  const stepReps = spy();
  globalThis.window.Workout = { stepWeight, stepReps };
  globalThis.document._wraps.push(wrap);
  initDrumPickers();
  return { track, stepWeight, stepReps, flushDrum, syncDrumUI, initDrumPickers };
}

/* ── tests — every BUG-DRUM-0 trust guard must hold on BOTH render paths
      (legacy full range / PERF-DRUM virtual window) ─────────────────────── */

for (const virt of [false, true]) {
  const label = virt ? '[virtual]' : '[legacy]';
  // _drums is keyed `${type}-${ei}-${si}` inside the (cached) module — give
  // each pass its own ei range so the drums never collide.
  const base = virt ? 10 : 0;

  test(`${label} repro BUG-DRUM-0: flushDrum after hide→reshow must not zero the weight`, async () => {
    const { track, stepWeight, flushDrum } = await buildDrum(base + 0, { virt });
    assert.equal(track.scrollTop, 72 * ITEM_H); // sanity: built at 180 kg

    track.hide();   // .set-done → display:none → scrollTop lost
    track.show();   // un-check / card expand → laid out again at scrollTop 0

    flushDrum('w', base + 0, 0); // tap set-check
    // Pre-fix: stepWeight(ei, 0, -180) — the phantom that logs «0×1»
    assert.deepEqual(stepWeight.calls, []);
  });

  test(`${label} repro BUG-DRUM-0: drum built without layout must not flush a phantom delta`, async () => {
    // renderActive on a hidden screen / collapsed card: scrollTop write dropped
    const { track, stepWeight, flushDrum } = await buildDrum(base + 1, { hidden: true, virt });
    track.show();
    assert.equal(track.scrollTop, 0); // browser kept the dropped write

    flushDrum('w', base + 1, 0);
    assert.deepEqual(stepWeight.calls, []);
  });

  test(`${label} reshow heals the drum position from state (lastIdx)`, async () => {
    const { track } = await buildDrum(base + 2, { virt });
    track.hide();
    track.show();
    _roInstances.forEach((ro) => ro.cb()); // layout returned → ResizeObserver
    assert.equal(track.scrollTop, 72 * ITEM_H); // back at 180 kg
  });

  test(`${label} genuine quick tap still flushes the in-flight scroll`, async () => {
    const { track, stepWeight, flushDrum } = await buildDrum(base + 3, { virt });
    track.userScrollTo(74 * ITEM_H); // user scrolls 180 → 185
    flushDrum('w', base + 3, 0);     // taps check before settle
    assert.deepEqual(stepWeight.calls, [[base + 3, 0, 5]]);
    // and the flush is one-shot: a second tap must not re-apply it
    flushDrum('w', base + 3, 0);
    assert.deepEqual(stepWeight.calls, [[base + 3, 0, 5]]);
  });

  test(`${label} scrollend settle still commits a genuine user scroll`, async () => {
    const { track, stepWeight } = await buildDrum(base + 4, { virt });
    track.userScrollTo(70 * ITEM_H); // 180 → 175
    track.fire('scrollend');
    assert.deepEqual(stepWeight.calls, [[base + 4, 0, -5, true]]);
  });

  test(`${label} fd99a2e guard holds: stray scrollend while hidden stays silent`, async () => {
    const { track, stepWeight } = await buildDrum(base + 5, { virt });
    track.hide(); // fires stray scroll + scrollend at scrollTop 0
    assert.deepEqual(stepWeight.calls, []);
  });
}

/* ── PERF-DRUM: virtual-window specifics ───────────────────────────────── */

const countItems = (track) => track.children.filter((el) => el.className.includes('drum-item')).length;

test('[virtual] renders a window, not the full 161-item range', async () => {
  const { track } = await buildDrum(20, { virt: true });
  assert.equal(countItems(track), 15);
  // spacers preserve the full scroll height: 161 items ↔ 15 real + padding
  const spacers = track.children.filter((el) => el.className === 'drum-spacer');
  assert.equal(spacers.length, 2);
  const padPx = spacers.reduce((s, el) => s + parseInt(el.style.height), 0);
  assert.equal(padPx + countItems(track) * ITEM_H, 161 * ITEM_H);
});

test('[virtual] window follows a long user scroll and keeps DOM bounded', async () => {
  const { track } = await buildDrum(21, { virt: true });
  // fling 180 kg → 40 kg (idx 72 → 16), crossing well past the window edge
  for (let idx = 71; idx >= 16; idx--) track.userScrollTo(idx * ITEM_H);
  assert.equal(countItems(track), 15);
  // the active index must sit inside the rendered window
  const spacerTop = parseInt(track.children[0].style.height);
  const start = spacerTop / ITEM_H;
  assert.ok(start <= 16 && 16 <= start + 14, `idx 16 outside window [${start}..${start + 14}]`);
});

test('[legacy] full range still renders all 161 items (proven path untouched)', async () => {
  const { track } = await buildDrum(6, { virt: false });
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

function activeItem(track) {
  return track.children.find((el) => el.classList.contains('drum-item--active'));
}

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

for (const virt of [false, true]) {
  const label = virt ? '[virtual]' : '[legacy]';
  const base = virt ? 40 : 30;

  test(`${label} BUG-7 repro: add-set row rebuild must re-init the drum with a visible active number`, async () => {
    const { initDrumPickers, track: firstTrack } = await buildDrum(base + 0, { virt, value: '80' });
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
    const { track: firstTrack } = await buildDrum(base + 1, { virt, value: '80' });
    assert.ok(activeItem(firstTrack));

    const newTrack = simulateAddSetRerender(base + 1, { value: '80' });
    // Deliberately skip initDrumPickers() here — this is the pre-fix behaviour
    // (BUG-7): the new track is left exactly as innerHTML rebuild produced it,
    // with no drum items at all, so there is no visible active number.
    assert.equal(activeItem(newTrack), undefined, 'pre-fix: rebuilt row has no active item to show a number');
  });

  test(`${label} BUG-7 repro: second add-set on a multi-row exercise gives each row its own correct value`, async () => {
    const { initDrumPickers, track: row0 } =
      await buildDrum(base + 2, { virt, value: '60' });
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
