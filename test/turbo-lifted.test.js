// Турбо (smartCoach, js/workout.view/handlers.js) кладёт один шаг сетки поверх
// ПОДНЯТОГО веса прошлой сессии. Сессия предзаполняет подходы весом
// автопрогрессии с done:false (buildSession) и сохраняется как есть
// (persistFinalSession), так что максимум по всем подходам читал недожатые
// +2.5 кг как поднятые, и Турбо накручивал прогрессию без поднятого веса.
// Второй дефект той же строки: getAll() отдаёт новые сессии первыми, а
// `[...workouts].reverse().find()` брал первую сессию в жизни, а не прошлую.
//
// Гоняется сам обработчик, а не копия расчёта: DOM заменён стабами ровно
// настолько, чтобы handlers.js загрузился, а Toast.show подменён шпионом.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const noop = () => {};
const mem = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
});
const stubEl = () => ({
  style: {},
  dataset: {},
  children: [],
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop,
  getAttribute: () => null,
  addEventListener: noop,
  removeEventListener: noop,
  appendChild: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
});
Object.assign(globalThis, {
  window: globalThis,
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  requestAnimationFrame: (f) => setTimeout(f, 0),
  history: { replaceState: noop, pushState: noop, back: noop, state: null },
  location: { hash: '', pathname: '/', search: '', href: 'http://localhost/' },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    createElement: stubEl,
    body: stubEl(),
    documentElement: stubEl(),
    visibilityState: 'visible',
  },
});
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: noop, userAgent: 'node' },
  configurable: true,
});

const { DB } = await import('../js/db.js');
const { State, lastLiftedTopWeight } = await import('../js/workout.store.js');
const { Toast } = await import('../js/shell.js');
const { t } = await import('../js/locale.store.js');
const { smartCoach } = await import('../js/workout.view/handlers.js');

const DAY = 86400000;
const NOW = Date.now();
/** @type {string[]} */
let toasts = [];
Toast.show = /** @type {any} */ ((msg) => toasts.push(msg));

/** Сохраняет сессию с Bench Press `daysAgo` дней назад через настоящий DB. */
const saveBench = (daysAgo, sets) =>
  DB.Workouts.save({
    type: 'push',
    timestamp: NOW - daysAgo * DAY,
    exercises: [{ name: 'Bench Press', sets }],
  });

/** Живая сессия: один подход, вес которого Турбо перезапишет. */
async function turbo() {
  State.phase = 'active';
  State.plan = [{ name: 'Bench Press', sets: [{ weight: 40, reps: 5, done: false }] }];
  await smartCoach(0, 0);
  return State.plan[0].sets[0].weight;
}

beforeEach(async () => {
  await DB.clearAll();
  toasts = [];
});

describe('Турбо кладёт шаг на поднятый вес прошлой сессии', () => {
  test('done:false с бо́льшим весом не поднимает опору Турбо', async () => {
    await saveBench(2, [
      { weight: 100, reps: 5, done: true },
      { weight: 102.5, reps: 5, done: false },
    ]);
    assert.equal(await turbo(), 102.5, '100 поднято + шаг 2.5; не 102.5 недожатых + шаг');
  });

  test('опора — новейшая сессия, а не первая в жизни', async () => {
    await saveBench(20, [{ weight: 60, reps: 5, done: true }]);
    await saveBench(2, [{ weight: 100, reps: 5, done: true }]);
    assert.equal(await turbo(), 102.5);
  });

  test('сессия, где упражнение не поднято ни разу, пропускается — опора в прошлой поднятой', async () => {
    await saveBench(20, [{ weight: 60, reps: 5, done: true }]);
    await saveBench(5, [{ weight: 100, reps: 5, done: true }]);
    await saveBench(1, [
      { weight: 102.5, reps: 5, done: false },
      { weight: 102.5, reps: 5, done: false },
    ]);
    assert.equal(await turbo(), 102.5);
  });

  test('подход с 0 повторов не поднят', async () => {
    await saveBench(2, [
      { weight: 100, reps: 5, done: true },
      { weight: 110, reps: 0, done: true },
    ]);
    assert.equal(await turbo(), 102.5);
  });

  test('запись без поля done считается поднятой (конвенция txt-export)', async () => {
    await saveBench(2, [{ weight: 100, reps: 5 }]);
    assert.equal(await turbo(), 102.5);
  });

  test('поднятого нет нигде — «истории нет», вес не тронут', async () => {
    await saveBench(2, [{ weight: 102.5, reps: 5, done: false }]);
    assert.equal(await turbo(), 40);
    assert.deepEqual(toasts, [t('train.no_history')]);
  });
});

describe('lastLiftedTopWeight', () => {
  test('порядок массива не важен — решает timestamp', () => {
    const old = { timestamp: 1, exercises: [{ name: 'Squat', sets: [{ weight: 60, reps: 5, done: true }] }] };
    const fresh = { timestamp: 2, exercises: [{ name: 'Squat', sets: [{ weight: 90, reps: 5, done: true }] }] };
    assert.equal(lastLiftedTopWeight([fresh, old], 'Squat'), 90);
    assert.equal(lastLiftedTopWeight([old, fresh], 'Squat'), 90);
  });

  test('пустая история и чужое имя — null', () => {
    assert.equal(lastLiftedTopWeight([], 'Squat'), null);
    assert.equal(lastLiftedTopWeight(undefined, 'Squat'), null);
    const w = { timestamp: 1, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 5, done: true }] }] };
    assert.equal(lastLiftedTopWeight([w], 'Squat'), null);
  });
});
