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
  return { className: '', textContent: '', classList: { toggle() {} } };
}

class FakeTrack {
  constructor({ hidden = false } = {}) {
    this._scrollTop = 0;
    this.clientHeight = hidden ? 0 : 108;
    this.style = {};
    this.items = [];
    this.listeners = {};
  }
  get scrollTop() { return this._scrollTop; }
  // Field-browser semantics: writes to a non-laid-out element are dropped.
  set scrollTop(v) { if (this.clientHeight) this._scrollTop = Math.max(0, v); }
  appendChild(frag) { this.items.push(...frag.items); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelectorAll() { return this.items; }
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
async function buildDrum(ei, { hidden = false, value = '180' } = {}) {
  setupGlobals();
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
  return { track, stepWeight, stepReps, flushDrum, syncDrumUI };
}

/* ── tests ─────────────────────────────────────────────────────────────── */

test('repro BUG-DRUM-0: flushDrum after hide→reshow must not zero the weight', async () => {
  const { track, stepWeight, flushDrum } = await buildDrum(0);
  assert.equal(track.scrollTop, 72 * ITEM_H); // sanity: built at 180 kg

  track.hide();   // .set-done → display:none → scrollTop lost
  track.show();   // un-check / card expand → laid out again at scrollTop 0

  flushDrum('w', 0, 0); // tap set-check
  // Pre-fix: stepWeight(0, 0, -180) — the phantom that logs «0×1»
  assert.deepEqual(stepWeight.calls, []);
});

test('repro BUG-DRUM-0: drum built without layout must not flush a phantom delta', async () => {
  // renderActive on a hidden screen / collapsed card: scrollTop write dropped
  const { track, stepWeight, flushDrum } = await buildDrum(1, { hidden: true });
  track.show();
  assert.equal(track.scrollTop, 0); // browser kept the dropped write

  flushDrum('w', 1, 0);
  assert.deepEqual(stepWeight.calls, []);
});

test('reshow heals the drum position from state (lastIdx)', async () => {
  const { track } = await buildDrum(2);
  track.hide();
  track.show();
  _roInstances.forEach((ro) => ro.cb()); // layout returned → ResizeObserver
  assert.equal(track.scrollTop, 72 * ITEM_H); // back at 180 kg
});

test('genuine quick tap still flushes the in-flight scroll', async () => {
  const { track, stepWeight, flushDrum } = await buildDrum(3);
  track.userScrollTo(74 * ITEM_H); // user scrolls 180 → 185
  flushDrum('w', 3, 0);            // taps check before settle
  assert.deepEqual(stepWeight.calls, [[3, 0, 5]]);
  // and the flush is one-shot: a second tap must not re-apply it
  flushDrum('w', 3, 0);
  assert.deepEqual(stepWeight.calls, [[3, 0, 5]]);
});

test('scrollend settle still commits a genuine user scroll', async () => {
  const { track, stepWeight } = await buildDrum(4);
  track.userScrollTo(70 * ITEM_H); // 180 → 175
  track.fire('scrollend');
  assert.deepEqual(stepWeight.calls, [[4, 0, -5, true]]);
});

test('fd99a2e guard holds: stray scrollend while hidden stays silent', async () => {
  const { track, stepWeight } = await buildDrum(5);
  track.hide(); // fires stray scroll + scrollend at scrollTop 0
  assert.deepEqual(stepWeight.calls, []);
});
