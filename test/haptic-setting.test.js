// @ts-check
/**
 * P0-HAPTIC — тумблер «Вибрация» в профиле обязан глушить haptic().
 *
 * До карточки haptic() настройку не читал вообще: тумблер писал 'off' в базу,
 * а 71 вызов вибрировал дальше. Тест идёт тем же путём, что приложение:
 * тумблер — через toggleHapticPref() стора на реальной базе (fake-indexeddb),
 * старт — через loadHapticPref(), вибрация — через сам haptic(). Мок только
 * у браузера: navigator.vibrate, window (жест разблокировки) и узел пульса.
 *
 * Нет значения в базе = вибрация включена (opt-out) — первый тест держит
 * дефолт и заодно доказывает, что стенд вообще умеет поймать вибрацию:
 * без него «off → не вызван» зеленел бы и на мёртвом моке.
 */
import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Map<string, Set<Function>>} */
const winListeners = new Map();
/** @type {any} */ (globalThis).window = {
  addEventListener(type, h) {
    if (!winListeners.has(type)) winListeners.set(type, new Set());
    winListeners.get(type)?.add(h);
  },
  removeEventListener(type, h) {
    winListeners.get(type)?.delete(h);
  },
};

/** Узел пульса: класс, слушатели и CSS-анимация, которую видит getAnimations(). */
function fakeEl() {
  const classes = new Set();
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  const el = {
    calls: { cancel: 0, play: 0, layoutReads: 0 },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    get offsetWidth() {
      el.calls.layoutReads++;
      return 0;
    },
    getAnimations() {
      if (!classes.has('ios-haptic-pulse')) return [];
      return [
        {
          animationName: 'ios-haptic-pulse',
          cancel: () => el.calls.cancel++,
          play: () => el.calls.play++,
        },
      ];
    },
    addEventListener(type, h) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(h);
    },
    removeEventListener(type, h) {
      listeners.get(type)?.delete(h);
    },
    /** Анимация доиграла — браузер шлёт animationend. */
    end(animationName = 'ios-haptic-pulse', target = el) {
      for (const h of [...(listeners.get('animationend') || [])]) h({ animationName, target });
    },
    has: (c) => classes.has(c),
  };
  return el;
}

const body = fakeEl();
/** @type {any} */ (globalThis).document = { body, activeElement: null };

/** @type {Array<number|number[]>} */
let vibrations = [];
/** @param {boolean} supported Android — vibrate есть; iOS — нет, работает пульс. */
function setDevice(supported) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: supported
      ? {
          vibrate: (p) => {
            vibrations.push(p);
            return true;
          },
        }
      : {},
  });
}

const { DB } = await import('../js/db.js');
const store = await import('../js/profile.store.js');
const { haptic } = await import('../js/shared/utils.js');

before(() => {
  // Жест пользователя: без него haptic() молчит при любой настройке.
  for (const h of winListeners.get('pointerdown') || []) h({ type: 'pointerdown' });
});
beforeEach(async () => {
  vibrations = [];
  await DB.clearAll();
  // Каждый тест стартует с чистой базы и кеша — как приложение после установки.
  await store.loadHapticPref();
});
afterEach(async () => {
  await DB.clearAll();
});

describe('P0-HAPTIC: настройка haptic глушит haptic()', () => {
  test('дефолт: в базе пусто — вибрация есть (стенд ловит вызов)', () => {
    setDevice(true);
    haptic(10);
    assert.deepEqual(vibrations, [10]);
  });

  test("тумблер в 'off' → navigator.vibrate не вызван", async () => {
    setDevice(true);
    assert.equal(await store.toggleHapticPref(), 'off');
    haptic(10);
    haptic([20, 40, 20]);
    assert.deepEqual(vibrations, [], 'тумблер выключен, а телефон вибрирует');
  });

  test("тумблер в 'off' → iOS-пульс ios-haptic-pulse не ставится", async () => {
    setDevice(false);
    await store.toggleHapticPref();
    const el = fakeEl();
    haptic(10, el);
    assert.equal(el.has('ios-haptic-pulse'), false, 'тумблер выключен, а пульс идёт');
  });

  test("старт с 'off' в базе → тишина с первого тапа", async () => {
    setDevice(true);
    await DB.Settings.set('haptic', 'off');
    await store.loadHapticPref();
    haptic(10);
    assert.deepEqual(vibrations, []);
  });

  test("тумблер обратно в 'on' → вибрация вернулась", async () => {
    setDevice(true);
    await store.toggleHapticPref();
    assert.equal(await store.toggleHapticPref(), 'on');
    haptic(10);
    assert.deepEqual(vibrations, [10]);
  });
});

describe('P0-HAPTIC: iOS-пульс без чтения layout', () => {
  test('повторный тап перематывает живую анимацию, offsetWidth не читается', () => {
    setDevice(false);
    const el = fakeEl();
    haptic(10, el);
    assert.equal(el.has('ios-haptic-pulse'), true, 'первый тап ставит класс');
    haptic(10, el);
    assert.deepEqual(el.calls, { cancel: 1, play: 1, layoutReads: 0 });
  });

  test('класс снимается по animationend своей анимации, чужое всплытие не считается', () => {
    setDevice(false);
    const el = fakeEl();
    haptic(10, el);
    el.end('ios-haptic-pulse', fakeEl());
    el.end('some-other');
    assert.equal(el.has('ios-haptic-pulse'), true, 'всплывшее с потомка не снимает класс');
    el.end();
    assert.equal(el.has('ios-haptic-pulse'), false);
    haptic(10, el);
    assert.equal(el.has('ios-haptic-pulse'), true, 'после конца пульс стартует заново');
  });

  test('исходник: в haptic() нет forced reflow', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/shared/utils.js'), 'utf8');
    const start = src.indexOf('let _hapticOn');
    const end = src.indexOf('export const listenerGroup');
    assert.ok(start > 0 && end > start, 'якоря haptic-блока протухли');
    const code = src
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /offsetWidth|offsetHeight|getBoundingClientRect/);
  });
});
