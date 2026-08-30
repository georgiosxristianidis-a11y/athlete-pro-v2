/**
 * LAUNCH-9 F-10: системный Back (и Escape) закрывают Athlete Room,
 * а не переключают экран под открытым оверлеем.
 *
 * popstate нельзя отменить — комната кладёт overlay-запись в history при
 * open(), Back её снимает. Chevron close обязан history.back(), иначе
 * следующая «назад» попадёт в пустую overlay-запись.
 */
import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

/** @type {Record<string, Function[]>} */
const listeners = {};
function onEvent(type, fn) {
  (listeners[type] ||= []).push(fn);
}
function fire(type, event) {
  for (const fn of listeners[type] || []) fn(event);
}

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      if (force === true) set.add(c);
      else if (force === false) set.delete(c);
      else if (set.has(c)) set.delete(c);
      else set.add(c);
    },
    contains: (c) => set.has(c),
  };
}

const overlay = {
  id: 'athlete-room',
  innerHTML: '',
  style: {},
  classList: makeClassList(),
  querySelector: () => null,
  querySelectorAll: () => [],
};

const historyStack = [{ screen: 's-train' }];
const hist = {
  get state() {
    return historyStack[historyStack.length - 1] || null;
  },
  pushState(state) {
    historyStack.push({ ...state });
  },
  back() {
    if (historyStack.length <= 1) return;
    historyStack.pop();
    fire('popstate', { state: hist.state });
  },
};

globalThis.history = hist;
globalThis.document = {
  addEventListener: onEvent,
  removeEventListener() {},
  body: { style: {} },
  getElementById: (id) => (id === 'athlete-room' ? overlay : null),
  querySelector: (sel) => (String(sel).includes('rel="stylesheet"') ? {} : null),
  querySelectorAll: () => [],
  createElement: () => ({
    style: {},
    classList: makeClassList(),
    addEventListener() {},
    setAttribute() {},
  }),
  head: { appendChild() {} },
};
Object.defineProperty(globalThis, 'window', {
  value: {
    addEventListener: onEvent,
    removeEventListener() {},
    dispatchEvent() {},
    history: hist,
    Toast: { show() {} },
  },
  writable: true,
  configurable: true,
});

const { DB } = await import('../js/db.js');
const { AthleteRoom } = await import('../js/shared/athlete-room.js');

function resetOverlay() {
  overlay.classList.remove('open');
  overlay.innerHTML = '';
  document.body.style.overflow = '';
  historyStack.length = 0;
  historyStack.push({ screen: 's-train' });
}

before(async () => {
  await DB.clearAll();
});
afterEach(async () => {
  AthleteRoom.close({ fromPop: true });
  resetOverlay();
  await DB.clearAll();
});

describe('F-10 Athlete Room system Back', () => {
  test('open() pushes an overlay history entry on top of the current screen', async () => {
    await AthleteRoom.open();
    assert.equal(overlay.classList.contains('open'), true);
    assert.equal(hist.state.overlay, 'athlete-room');
    assert.equal(hist.state.screen, 's-train');
    assert.equal(historyStack.length, 2);
  });

  test('open() twice does not stack a second overlay entry', async () => {
    await AthleteRoom.open();
    await AthleteRoom.open();
    assert.equal(historyStack.length, 2);
    assert.equal(hist.state.overlay, 'athlete-room');
  });

  test('popstate without overlay closes the room and leaves the screen entry', async () => {
    await AthleteRoom.open();
    hist.back();
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(hist.state.screen, 's-train');
    assert.equal(hist.state.overlay, undefined);
    assert.equal(historyStack.length, 1);
    assert.equal(document.body.style.overflow, '');
  });

  test('chevron close() consumes the overlay entry so the next Back is a screen pop', async () => {
    await AthleteRoom.open();
    AthleteRoom.close();
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(historyStack.length, 1);
    assert.equal(hist.state.screen, 's-train');
    assert.equal(hist.state.overlay, undefined);
  });

  test('Escape closes the open room and consumes history', async () => {
    await AthleteRoom.open();
    let prevented = false;
    fire('keydown', {
      key: 'Escape',
      preventDefault() {
        prevented = true;
      },
      target: { closest: () => null },
    });
    assert.equal(prevented, true);
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(historyStack.length, 1);
  });

  test('Escape does nothing when the room is closed', () => {
    let prevented = false;
    fire('keydown', {
      key: 'Escape',
      preventDefault() {
        prevented = true;
      },
      target: { closest: () => null },
    });
    assert.equal(prevented, false);
    assert.equal(historyStack.length, 1);
  });
});
