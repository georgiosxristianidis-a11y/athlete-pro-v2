// @ts-check
// UNDO-1 / UNDO-2 — случайный тап отменяется кнопкой «Вернуть» в тосте.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
};
let toast = null;
globalThis.window = {
  DynamicIsland: null,
  Toast: { show: (msg, type, dur, opts) => { toast = { msg, dur, opts }; } },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {} };

const { State } = await import('../js/workout.store.js');
const { PiP } = await import('../js/features/pip.js');
const { RestTimer } = await import('../js/rest-timer.js');
let frame = null;
PiP.drawFrame = (s) => { frame = s; };
after(() => RestTimer.stop());

State.plan = [{ name: 'Bench', sets: [{ done: true }, { done: false }] }];

test('UNDO-2 флаг OFF: пропуск отдыха как раньше, без тоста', () => {
  ls.clear(); toast = null;
  RestTimer.start('Bench', '1/2', 90);
  RestTimer.tapSkip();
  assert.equal(toast, null);
});

test('UNDO-2 флаг ON: «Вернуть» ведёт отсчёт к прежнему концу', () => {
  ls.set('ap-flag-rest-skip-undo', '1'); toast = null;
  RestTimer.start('Bench', '1/2', 90);
  RestTimer.tapSkip();
  assert.ok(toast?.opts?.action, 'тост с действием');
  frame = null;
  toast.opts.action.onClick();
  assert.match(frame.time, /^01:(29|30)$/, 'отсчёт продолжился, а не начался заново');
});

test('UNDO-2: новый отдых после пропуска — старый «Вернуть» молчит', () => {
  ls.set('ap-flag-rest-skip-undo', '1'); toast = null;
  RestTimer.start('Bench', '1/2', 90);
  RestTimer.tapSkip();
  const stale = toast;
  RestTimer.start('Bench', '2/2', 30);
  frame = null;
  stale.opts.action.onClick();
  assert.equal(frame, null, 'текущий отдых не перебит');
});

test('UNDO-2: пропуск без идущего отдыха тоста не даёт', () => {
  ls.set('ap-flag-rest-skip-undo', '1');
  RestTimer.stop(); toast = null;
  RestTimer.tapSkip();
  assert.equal(toast, null);
});

test('UNDO-1 проводка: тост пропуска несёт «Вернуть» и ищет упражнение по ссылке', () => {
  const h = readFileSync(new URL('../js/workout.view/handlers.js', import.meta.url), 'utf8');
  assert.match(h, /t\('train\.skipped_toast', \{ name: ex\.name \}\)/);
  assert.match(h, /label: t\('train\.undo'\)/);
  assert.match(h, /State\.plan\.indexOf\(ex\)/);
  const loc = readFileSync(new URL('../js/locale.store.js', import.meta.url), 'utf8');
  for (const k of ['train.undo', 'rest.skipped_toast', 'lab.rest-skip-undo', 'lab.rest-skip-undo_sub']) {
    assert.equal(loc.split(`'${k}':`).length - 1, 2, `${k} парой EN+RU`);
  }
});
