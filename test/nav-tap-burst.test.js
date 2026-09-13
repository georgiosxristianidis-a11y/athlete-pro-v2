// @ts-check
/**
 * NAV-1 — быстрая серия тапов теряет переход.
 *
 * Baseline: `_current` двигается только внутри `performNav()`, то есть позже,
 * при сливе очереди. В серии тапов из s-home все вызовы сравниваются с
 * доburst-овым `_current`, поэтому финальный тап обратно на s-home совпадает
 * со стартовым экраном и молча отбрасывается. Тест без DOM view-transition —
 * только очередь.
 */
import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';

function classList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
  };
}

function makeEl(id) {
  return {
    id,
    classList: classList(),
    isConnected: true,
    scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 800 }),
    contains(node) {
      return node === this;
    },
  };
}

const home = makeEl('s-home');
const stats = makeEl('s-stats');
const profile = makeEl('s-profile');
home.classList.add('active');

/** @type {{ screen?: string, overlay?: string }[]} */
let stack = [{ screen: 's-home' }];

const win = new EventTarget();
Object.defineProperty(globalThis, 'window', {
  value: win,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'history', {
  value: {
    get state() {
      return stack[stack.length - 1] ?? null;
    },
    replaceState(s) {
      stack[stack.length - 1] = { ...s };
    },
    pushState(s) {
      stack.push({ ...s });
    },
  },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: {
    getElementById(id) {
      if (id === 's-home') return home;
      if (id === 's-stats') return stats;
      if (id === 's-profile') return profile;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector(sel) {
      return String(sel).includes('rel="stylesheet"') ? {} : null;
    },
    body: { style: {}, appendChild() {} },
    createElement() {
      return makeEl('');
    },
    addEventListener() {},
    removeEventListener() {},
  },
  writable: true,
  configurable: true,
});

const { Nav } = await import('../js/shell.js');

before(async () => {
  await Nav.go('s-home');
});

afterEach(async () => {
  await Nav.go('s-home', { force: true });
  stack.length = 0;
  stack.push({ screen: 's-home' });
});

describe('NAV-1 — burst of taps back to the starting screen', () => {
  test('s-stats -> s-profile -> s-home lands on s-home, not s-profile', async () => {
    const p1 = Nav.go('s-stats');
    const p2 = Nav.go('s-profile');
    const p3 = Nav.go('s-home');
    await Promise.all([p1, p2, p3]);

    assert.equal(Nav.current(), 's-home');
  });

  test('a mid-burst screen is still not dropped', async () => {
    const p1 = Nav.go('s-stats');
    const p2 = Nav.go('s-profile');
    await Promise.all([p1, p2]);

    assert.equal(Nav.current(), 's-profile');
  });
});
