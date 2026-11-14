// @ts-check
/**
 * UX-2a — экран не гаснет: блокировка держится всю тренировку.
 * Подмена navigator.wakeLock и document; модуль читает глобалы в момент вызова.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/** Фейковый браузер: request() выдаёт сентинел, который умеет терять блокировку сам. */
function installBrowser() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const sentinels = [];
  let requests = 0;
  const wakeLock = {
    async request() {
      requests++;
      if (doc.visibilityState === 'hidden') {
        throw Object.assign(new Error('hidden'), { name: 'NotAllowedError' });
      }
      const s = Object.assign(new EventTarget(), {
        released: false,
        async release() {
          if (s.released) return;
          s.released = true;
          s.dispatchEvent(new Event('release'));
        },
      });
      sentinels.push(s);
      return s;
    },
  };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { wakeLock }, configurable: true, writable: true });
  return {
    doc,
    sentinels,
    get requests() { return requests; },
    /** Браузер снимает блокировку при скрытии страницы. */
    hide() {
      doc.visibilityState = 'hidden';
      for (const s of sentinels) s.release();
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    show() {
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('UX-2a: wake-lock', () => {
  /** @type {typeof import('../js/features/wake-lock.js')} */
  let wl;
  /** @type {ReturnType<typeof installBrowser>} */
  let env;

  beforeEach(async () => {
    env = installBrowser();
    wl = await import('../js/features/wake-lock.js');
    await wl.releaseWakeLock(); // чистое состояние между кейсами
    await wl.setWakeLockEnabled(true);
    env.sentinels.length = 0;
  });

  test('старт сессии с keep-awake ON берёт блокировку', async () => {
    assert.equal(await wl.startWakeLockSession(true), true);
    assert.equal(wl.isWakeLockActive(), true);
    assert.equal(env.requests >= 1, true);
  });

  test('после скрытия и возврата страницы блокировка берётся заново', async () => {
    await wl.startWakeLockSession(true);
    env.hide();
    await tick();
    assert.equal(wl.isWakeLockActive(), false, 'браузер снял блокировку');
    env.show();
    await tick();
    assert.equal(wl.isWakeLockActive(), true, 'вернулась на visible');
  });

  test('повторные visible и старты не плодят запросы и слушателей', async () => {
    await wl.startWakeLockSession(true);
    await wl.startWakeLockSession(true);
    const before = env.requests;
    env.show();
    env.show();
    await tick();
    assert.equal(env.requests, before, 'блокировка уже держится — запроса нет');
    assert.equal(env.sentinels.filter((s) => !s.released).length, 1);
  });

  test('keep-awake OFF: запроса нет, ни на старте, ни на visible', async () => {
    await wl.startWakeLockSession(false);
    assert.equal(env.requests, 0);
    env.hide();
    env.show();
    await tick();
    assert.equal(env.requests, 0);
    assert.equal(wl.isWakeLockActive(), false);
  });

  test('без сессии visible ничего не просит', async () => {
    await wl.releaseWakeLock();
    env.show();
    await tick();
    assert.equal(env.requests, 0);
  });

  test('финиш отпускает блокировку и снимает слушатель', async () => {
    await wl.startWakeLockSession(true);
    await wl.releaseWakeLock();
    assert.equal(wl.isWakeLockActive(), false);
    const before = env.requests;
    env.hide();
    env.show();
    await tick();
    assert.equal(env.requests, before, 'после финиша на visible не просим');
  });

  test('тумблер OFF во время тренировки отпускает сразу, ON — берёт сразу', async () => {
    await wl.startWakeLockSession(true);
    await wl.setWakeLockEnabled(false);
    assert.equal(wl.isWakeLockActive(), false);
    env.hide();
    env.show();
    await tick();
    assert.equal(wl.isWakeLockActive(), false, 'OFF держится и после visible');
    await wl.setWakeLockEnabled(true);
    assert.equal(wl.isWakeLockActive(), true);
  });

  test('тумблер ON без тренировки блокировку не берёт', async () => {
    await wl.setWakeLockEnabled(true);
    assert.equal(env.requests, 0);
  });

  test('восстановление на скрытой странице: ждёт visible, потом берёт', async () => {
    env.doc.visibilityState = 'hidden';
    await wl.startWakeLockSession(true);
    assert.equal(wl.isWakeLockActive(), false);
    env.show();
    await tick();
    assert.equal(wl.isWakeLockActive(), true);
  });

  test('финиш во время полёта запроса: полученная блокировка отпускается', async () => {
    const p = wl.startWakeLockSession(true);
    await wl.releaseWakeLock();
    await p;
    await tick();
    assert.equal(wl.isWakeLockActive(), false);
    assert.equal(env.sentinels.every((s) => s.released), true);
  });

  test('API нет в браузере — тихо false', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    assert.equal(await wl.startWakeLockSession(true), false);
  });
});
