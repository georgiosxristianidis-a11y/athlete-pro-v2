// Shared DOM stubs for the drum-picker suites (drum-picker.test.js —
// BUG-DRUM-0 / BUG-7 trust guards; drum-contract.test.js — the DRUM-PERF-2
// scrollTop↔index contract). node --test runs each *.test.js file in its own
// process, so the module-level _drums cache inside drum-picker.js never leaks
// between files — but WITHIN a file every drum needs a unique `ei`.
//
// FakeTrack mimics the field browser's behaviour where a hidden element
// zeroes scrollTop (and fires a stray scroll) and silently drops scrollTop
// writes while it has no layout.

export const ITEM_H = 36;

export function makeEl() {
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

export class FakeTrack {
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

export const roInstances = [];

export function setupGlobals() {
  globalThis.window ??= {};
  // key present → drum-picker registers the controllable scrollend path
  if (!('onscrollend' in globalThis.window)) globalThis.window.onscrollend = null;
  if (!globalThis.navigator) globalThis.navigator = {};
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; roInstances.push(this); }
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

export function spy() {
  const calls = [];
  const fn = (...args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

/**
 * Build one drum (default: weight at 180 kg = idx 72) for exercise `ei`.
 * mode: 'legacy'  — full-range render (proven prod path)
 *       'virtual' — flag 'drum-virtual', live mid-scroll re-centre (field-failed, kept OFF)
 *       'window'  — flag 'drum-window', DRUM-PERF-2 at-rest window
 */
export async function buildDrum(ei, { hidden = false, value = '180', mode = 'legacy', si = '0', type = 'w' } = {}) {
  setupGlobals();
  // flags.js reads localStorage on every flag() call, so this wins over DEFAULTS.
  globalThis.localStorage = {
    getItem: (k) => {
      if (k === 'ap-flag-drum-virtual') return mode === 'virtual' ? '1' : '0';
      if (k === 'ap-flag-drum-window') return mode === 'window' ? '1' : '0';
      return null;
    },
  };
  const { initDrumPickers, flushDrum, syncDrumUI } =
    await import('../js/ui/drum-picker.js');
  const track = new FakeTrack({ hidden });
  const wrap = {
    dataset: { type, ei: String(ei), si, value },
    querySelector: () => track,
  };
  const stepWeight = spy();
  const stepReps = spy();
  globalThis.window.Workout = { stepWeight, stepReps };
  globalThis.document._wraps.push(wrap);
  initDrumPickers();
  return { track, stepWeight, stepReps, flushDrum, syncDrumUI, initDrumPickers };
}

export const countItems = (track) =>
  track.children.filter((el) => el.className.includes('drum-item')).length;

export const activeItem = (track) =>
  track.children.find((el) => el.classList.contains('drum-item--active'));
