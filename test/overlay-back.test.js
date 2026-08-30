// @ts-check
/**
 * F-10 — системный Back / Escape закрывают Athlete Room, а не экран под ней.
 *
 * На baseline (оверлей не в history, popstate всегда зовёт Nav.go) этот файл
 * красный: иначе он мерил бы «модуль импортируется», а не баг.
 */
import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function classList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, force) => {
      const on = force ?? !s.has(c);
      on ? s.add(c) : s.delete(c);
      return on;
    },
  };
}

function makeEl(id) {
  return {
    id,
    classList: classList(),
    isConnected: true,
    scrollTop: 0,
    style: {},
    innerHTML: '',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 800 }),
    contains(node) {
      return node === this;
    },
  };
}

const home = makeEl('s-home');
const train = makeEl('s-train');
const stats = makeEl('s-stats');
const overlay = makeEl('athlete-room');
home.classList.add('active');

/** Что возвращает elementFromPoint — перекрытие судим попаданием, не z-index. */
let hit = home;

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
    back() {
      if (stack.length <= 1) return;
      stack.pop();
      const ev = new Event('popstate');
      Object.defineProperty(ev, 'state', { value: this.state });
      win.dispatchEvent(ev);
    },
  },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: {
    getElementById(id) {
      if (id === 's-home') return home;
      if (id === 's-train') return train;
      if (id === 's-stats') return stats;
      if (id === 'athlete-room') return overlay;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector(sel) {
      return String(sel).includes('rel="stylesheet"') ? {} : null;
    },
    elementFromPoint() {
      return hit;
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

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function openRoom() {
  overlay.classList.add('open');
  overlay.style.zIndex = '4000';
  hit = overlay;
  let closed = false;
  Nav.registerOverlay({
    id: 'athlete-room',
    el: overlay,
    close() {
      closed = true;
      overlay.classList.remove('open');
      Nav.unregisterOverlay('athlete-room');
    },
  });
  return {
    wasClosed: () => closed,
  };
}

before(async () => {
  await Nav.go('s-home');
});

afterEach(async () => {
  overlay.classList.remove('open');
  overlay.style.zIndex = '';
  hit = home;
  Nav.unregisterOverlay('athlete-room');
  await Nav.go('s-home');
  stack.length = 0;
  stack.push({ screen: 's-home' });
});

describe('F-10 overlay back — covering Athlete Room', () => {
  test('Back closes the room and leaves s-train in place', async () => {
    await Nav.go('s-train');
    const room = openRoom();
    assert.equal(Nav.current(), 's-train');

    history.back();
    await flush();

    assert.equal(room.wasClosed(), true, 'оверлей должен закрыться');
    assert.equal(Nav.current(), 's-train', 'экран под комнатой не листается');
    assert.equal(overlay.classList.contains('open'), false);
  });

  test('second Back after close navigates to the previous screen', async () => {
    await Nav.go('s-train');
    openRoom();

    history.back();
    await flush();
    assert.equal(Nav.current(), 's-train');

    history.back();
    await flush();
    assert.equal(Nav.current(), 's-home');
  });

  test('Escape closes the covering room the same way Back does', async () => {
    await Nav.go('s-train');
    const room = openRoom();

    const ev = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'key', { value: 'Escape' });
    win.dispatchEvent(ev);
    await flush();

    assert.equal(room.wasClosed(), true);
    assert.equal(Nav.current(), 's-train');
  });

  test('high z-index without a hit is not covering — Back does not close the room', async () => {
    await Nav.go('s-train');
    overlay.classList.add('open');
    overlay.style.zIndex = '99999';
    hit = train;
    let closed = false;
    Nav.registerOverlay({
      id: 'athlete-room',
      el: overlay,
      close() {
        closed = true;
        overlay.classList.remove('open');
        Nav.unregisterOverlay('athlete-room');
      },
    });

    history.back();
    await flush();

    assert.equal(closed, false, 'без попадания elementFromPoint слой не закрываем');
    assert.equal(Nav.current(), 's-train', 'первый Back снимает запись оверлея, экран не листает');
  });

  test('after Back closes the room, an immediate tab change is not dropped', async () => {
    await Nav.go('s-train');
    openRoom();
    history.back();
    await Nav.go('s-stats');
    assert.equal(Nav.current(), 's-stats');
  });
});

describe('F-10 overlay back — wiring', () => {
  test('Athlete Room registers with the shell overlay registry', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'shared', 'athlete-room.js'), 'utf8');
    assert.match(src, /registerOverlay/, 'open() должен звать Nav.registerOverlay');
    assert.match(src, /unregisterOverlay/, 'close() должен звать Nav.unregisterOverlay');
  });

  test('Nav exposes the overlay registry', () => {
    assert.equal(typeof Nav.registerOverlay, 'function');
    assert.equal(typeof Nav.unregisterOverlay, 'function');
  });
});
