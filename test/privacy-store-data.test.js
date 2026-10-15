// @ts-check
/**
 * A15-privacy — контракт двух дверей `js/privacy.store.js`, через которые
 * экран приватности теперь ходит в базу (baseline import-guard 6 → 0).
 *
 * Гард считает вызовы `DB.*` в view, но не проверяет, что при переносе не
 * потерялись поштучные fallback'и паспорта и что стирание не глотает ошибку.
 * Это — здесь, на стабах методов `DB`: настоящую базу не трогаем вовсе,
 * а `deleteAllUserData` без стаба не вызывается ни при каком исходе.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { DB } = await import('../js/db.js');
const { loadPassportData, eraseAllUserData } = await import('../js/privacy.store.js');

/** @type {Array<[any, string, any]>} что подменили — вернуть после кейса */
const patched = [];
/** @param {any} obj @param {string} key @param {any} value */
function stub(obj, key, value) {
  patched.push([obj, key, obj[key]]);
  obj[key] = value;
}
afterEach(() => {
  while (patched.length) {
    const [obj, key, orig] = /** @type {[any, string, any]} */ (patched.pop());
    obj[key] = orig;
  }
});

const ok = (/** @type {any} */ v) => ({ getAll: async () => v });
const fail = () => ({
  getAll: async () => {
    throw new Error('idb down');
  },
});

describe('loadPassportData', () => {
  test('все источники живы — пять наборов как есть', async () => {
    stub(DB, 'Workouts', ok([{ id: 'w1' }]));
    stub(DB, 'OneRM', ok([{ id: 'o1' }]));
    stub(DB, 'Metrics', ok([{ id: 'm1' }]));
    stub(DB, 'Settings', ok({ lang: 'ru' }));
    stub(DB, 'Events', ok([{ id: 'e1' }]));
    assert.deepEqual(await loadPassportData(), {
      workouts: [{ id: 'w1' }],
      orms: [{ id: 'o1' }],
      metrics: [{ id: 'm1' }],
      settings: { lang: 'ru' },
      events: [{ id: 'e1' }],
    });
  });

  test('упал один массивный источник — он [], остальные пришли', async () => {
    stub(DB, 'Workouts', ok([{ id: 'w1' }]));
    stub(DB, 'OneRM', fail());
    stub(DB, 'Metrics', ok([{ id: 'm1' }]));
    stub(DB, 'Settings', ok({ lang: 'ru' }));
    stub(DB, 'Events', ok([{ id: 'e1' }]));
    const d = await loadPassportData();
    assert.deepEqual(d.orms, []);
    assert.deepEqual(d.workouts, [{ id: 'w1' }]);
    assert.deepEqual(d.metrics, [{ id: 'm1' }]);
    assert.deepEqual(d.settings, { lang: 'ru' });
    assert.deepEqual(d.events, [{ id: 'e1' }]);
  });

  test('упали Settings — они {}, а не [], остальные пришли', async () => {
    stub(DB, 'Workouts', ok([{ id: 'w1' }]));
    stub(DB, 'OneRM', ok([{ id: 'o1' }]));
    stub(DB, 'Metrics', ok([{ id: 'm1' }]));
    stub(DB, 'Settings', fail());
    stub(DB, 'Events', ok([{ id: 'e1' }]));
    const d = await loadPassportData();
    assert.deepEqual(d.settings, {});
    assert.ok(!Array.isArray(d.settings));
    assert.deepEqual(d.workouts, [{ id: 'w1' }]);
    assert.deepEqual(d.events, [{ id: 'e1' }]);
  });

  test('упали все — пустой паспорт, без исключения', async () => {
    for (const k of ['Workouts', 'OneRM', 'Metrics', 'Settings', 'Events']) stub(DB, k, fail());
    assert.deepEqual(await loadPassportData(), {
      workouts: [],
      orms: [],
      metrics: [],
      settings: {},
      events: [],
    });
  });
});

describe('eraseAllUserData', () => {
  test('вызывает DB.deleteAllUserData ровно один раз', async () => {
    let calls = 0;
    stub(DB, 'deleteAllUserData', async () => {
      calls++;
    });
    await eraseAllUserData();
    assert.equal(calls, 1);
  });

  test('ошибку стирания пробрасывает, не глотает', async () => {
    let calls = 0;
    stub(DB, 'deleteAllUserData', async () => {
      calls++;
      throw new Error('wipe failed');
    });
    await assert.rejects(eraseAllUserData(), /wipe failed/);
    assert.equal(calls, 1);
  });
});
