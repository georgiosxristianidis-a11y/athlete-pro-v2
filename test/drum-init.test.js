// BUG-7 regression: after addSet innerHTML reset, .drum-wrap loses [data-drum-init]
// and the drum track is empty — numbers vanish. initDrumPickers() (called via rAF
// in handlers.js:204) must re-stamp the marker and restore the active item.
import test from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal DOM mock ─────────────────────────────────────────────────────────
// drum-picker.js accesses document / window / navigator only inside function
// bodies, so setting globals before the dynamic import is sufficient.

const _wrapPool = []; // querySelectorAll('.drum-wrap:not([data-drum-init])') source

function _classList() {
  const s = new Set();
  return {
    toggle(name, force) {
      (force ?? !s.has(name)) ? s.add(name) : s.delete(name);
    },
    has(name) { return s.has(name); },
    get _set() { return s; },
  };
}

function _div() {
  const cl = _classList();
  let _cn = '';
  return {
    get className() { return _cn; },
    set className(v) {
      _cn = v;
      cl._set.clear();
      v.split(' ').filter(Boolean).forEach(n => cl._set.add(n));
    },
    textContent: '',
    classList: cl,
  };
}

function _frag() {
  const ch = [];
  return { _ch: ch, appendChild(el) { ch.push(el); return el; } };
}

globalThis.document = {
  querySelectorAll(sel) {
    if (sel !== '.drum-wrap:not([data-drum-init])') return [];
    return _wrapPool.filter(w => !w.dataset.drumInit);
  },
  createDocumentFragment: _frag,
  createElement() { return _div(); },
};
// window / navigator are read-only in Node 22 — use defineProperty
Object.defineProperty(globalThis, 'window', {
  value: {},           // no onscrollend → fallback scroll path
  writable: true, configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate() {} },
  writable: true, configurable: true,
});

// Dynamic import so globals are live before module code runs
const { initDrumPickers } = await import('../js/ui/drum-picker.js');

// ─── DOM factory (one instance = one physical .drum-wrap after innerHTML set) ──

function makeDrumWrap({ type = 'r', ei = 0, si = 0, value = 10 } = {}) {
  const items = [];
  const track = {
    scrollTop: 0,
    style: { paddingTop: '', paddingBottom: '' },
    addEventListener() {},
    appendChild(frag) { if (frag._ch) items.push(...frag._ch); },
    querySelectorAll(sel) { return sel === '.drum-item' ? items : []; },
  };
  const wrap = {
    dataset: { type, ei: String(ei), si: String(si), value: String(value) },
    querySelector(sel) { return sel === '.drum-track' ? track : null; },
  };
  return { wrap, items };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('BUG-7 — drum visibility after addSet innerHTML reset', async t => {

  await t.test('pre-condition: fresh .drum-wrap has no [data-drum-init] and empty track', () => {
    const { wrap, items } = makeDrumWrap({ type: 'r', ei: 20, si: 0, value: 10 });
    // State before initDrumPickers is called — mirrors a newly rendered wrap
    assert.strictEqual(wrap.dataset.drumInit, undefined, 'no drum-init before initDrumPickers');
    assert.strictEqual(items.length, 0, 'track empty before initDrumPickers');
  });

  await t.test('initDrumPickers stamps [data-drum-init] and activates correct reps item', () => {
    const { wrap, items } = makeDrumWrap({ type: 'r', ei: 21, si: 0, value: 10 });
    _wrapPool.length = 0;
    _wrapPool.push(wrap);

    initDrumPickers();

    assert.strictEqual(wrap.dataset.drumInit, '1', '[data-drum-init] must be set');

    // R_MIN=1, R_STEP=1, value=10 → initIdx = (10-1)/1 = 9
    const active = items.filter(item => item.classList.has('drum-item--active'));
    assert.strictEqual(active.length, 1, 'exactly one drum-item must be active');
    assert.strictEqual(items[9].textContent, '10', 'active item must show current value');
  });

  await t.test('initDrumPickers stamps [data-drum-init] and activates correct weight item', () => {
    const { wrap, items } = makeDrumWrap({ type: 'w', ei: 22, si: 1, value: 60 });
    _wrapPool.length = 0;
    _wrapPool.push(wrap);

    initDrumPickers();

    assert.strictEqual(wrap.dataset.drumInit, '1', '[data-drum-init] must be set');

    // W_MIN=0, W_STEP=2.5, value=60 → initIdx = 60/2.5 = 24
    const active = items.filter(item => item.classList.has('drum-item--active'));
    assert.strictEqual(active.length, 1, 'exactly one drum-item must be active');
    assert.strictEqual(items[24].textContent, '60', 'active item must show current value');
  });

  await t.test('BUG-7: after addSet innerHTML reset, re-calling initDrumPickers re-inits the new wrap', () => {
    // Phase 1: initial render → init drums
    const { wrap: wrap1, items: items1 } = makeDrumWrap({ type: 'r', ei: 23, si: 0, value: 8 });
    _wrapPool.length = 0;
    _wrapPool.push(wrap1);
    initDrumPickers();
    assert.strictEqual(wrap1.dataset.drumInit, '1', 'initial init OK');
    assert.strictEqual(items1.filter(i => i.classList.has('drum-item--active')).length, 1);

    // Phase 2: addSet replaces innerHTML → brand-new DOM node, drum-init gone, track empty
    const { wrap: wrap2, items: items2 } = makeDrumWrap({ type: 'r', ei: 23, si: 0, value: 8 });
    _wrapPool.length = 0;
    _wrapPool.push(wrap2);

    assert.strictEqual(wrap2.dataset.drumInit, undefined, 'new wrap: no drum-init (BUG-7 trigger)');
    assert.strictEqual(items2.length, 0, 'new wrap: track empty (BUG-7 trigger)');

    // Phase 3: rAF fires → initDrumPickers() called (handlers.js:204 fix)
    initDrumPickers();

    assert.strictEqual(wrap2.dataset.drumInit, '1', 'new wrap must be re-stamped');
    assert.strictEqual(
      items2.filter(i => i.classList.has('drum-item--active')).length,
      1,
      'active digit must be visible after re-init — BUG-7 regression guard',
    );
  });

  await t.test('already-initialised wraps are skipped by initDrumPickers', () => {
    const { wrap, items } = makeDrumWrap({ type: 'r', ei: 24, si: 0, value: 5 });
    wrap.dataset.drumInit = '1'; // already stamped
    _wrapPool.length = 0;
    _wrapPool.push(wrap);

    initDrumPickers();

    // querySelectorAll filters it out → _buildDrum never called → track stays empty
    assert.strictEqual(items.length, 0, 'already-init wrap must not be rebuilt');
  });
});
