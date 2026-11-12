// @ts-check
/**
 * SWAP-1b — UI-часть гарда: флаг swap-quick, тумблер, локали, полоса в render.js,
 * обработчик, CSS-токены. Красный до SWAP-1b (логика замены — test/swap-1.test.js, влита в 1a).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.document = /** @type {any} */ ({
  addEventListener() {},
  removeEventListener() {},
  body: { style: {} },
  getElementById: () => null,
  querySelector: () => null,
});
Object.defineProperty(globalThis, 'window', {
  value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  writable: true,
  configurable: true,
});
globalThis.localStorage = /** @type {any} */ ({ getItem: () => null, setItem() {}, removeItem() {} });

const read = (/** @type {string} */ p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { flag, LAB_FLAGS } = await import('../js/flags.js');

describe('SWAP-1: флаг, рендер, тумблер, локали, токены', () => {
  test('флаг swap-quick: дефолт OFF, тумблер в Лаборатории', () => {
    assert.equal(flag('swap-quick'), false);
    assert.ok(LAB_FLAGS.includes('swap-quick'));
  });
  test('локали: lab.swap-quick(+_sub) в en, ru, el', () => {
    assert.equal(read('js/locale.store.js').split("'lab.swap-quick'").length - 1, 2, 'en + ru');
    assert.ok(read('js/locale.el.js').includes("'lab.swap-quick'"));
    assert.ok(read('js/locale.el.js').includes("'lab.swap-quick_sub'"));
  });
  test('полоса в render.js только под flag(swap-quick) и только при аналогах', () => {
    const src = read('js/workout.view/render.js');
    assert.match(src, /flag\('swap-quick'\)/);
    assert.match(src, /hasAnalogs\(/);
  });
  test('view не зовёт DB.* в новом коде (A15): swap-groups.js чист, обработчик идёт через стор', () => {
    assert.doesNotMatch(read('js/shared/swap-groups.js'), /\bDB\./);
    assert.match(read('js/workout.view/handlers.js'), /swapExercise\(/);
  });
  test('CSS полосы только токены: без hex и rgba-литералов в блоке swap-1', () => {
    const css = read('css/workout.css');
    const i = css.indexOf('SWAP-1');
    assert.ok(i >= 0, 'блок SWAP-1 в css/workout.css');
    const block = css.slice(i, css.indexOf('\n/* ', i + 10) > 0 ? css.indexOf('\n/* ', i + 10) : undefined);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
