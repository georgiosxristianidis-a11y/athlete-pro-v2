// @ts-check
/**
 * UX-2g — английские пары реестра упражнений (раздражитель 6 из HANDOFF_ux_irritants).
 * Гард: в en на трёх рендерах (подпись семейства Stats, карточка оси радара, лейблы
 * карточки выбора упражнения) нет кириллицы; у каждой записи реестра и каждой мышцы
 * есть английская пара. Язык в Node по умолчанию en (setLang пишет в IDB).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// events.js вешает слушатели на document при импорте — стаб как в data-4-radar.
globalThis.document = /** @type {any} */ ({
  addEventListener() {}, removeEventListener() {}, body: { style: {} },
  getElementById: () => null, querySelector: () => null,
});
Object.defineProperty(globalThis, 'window', {
  value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  writable: true, configurable: true,
});
globalThis.localStorage = /** @type {any} */ ({ getItem: () => null });

const { isRu } = await import('../js/locale.store.js');
const reg = await import('../js/shared/exercise-registry.js');
const { familyLabel } = await import('../js/shared/family-curves.js');
const { axisCardHtml } = await import('../js/profile.view/radar-axis-card.js');
const { itemMetaHtml } = await import('../js/workout.view/picker-muscles.js');
const { buildRecords } = await import('../js/shared/exercise-records.js');

const CYR = /[Ѐ-ӿ]/;
const ALL_NAMES = reg.EXERCISES.flatMap((e) => e.names);

describe('UX-2g: в en нет кириллицы', () => {
  test('язык теста — не ru', () => assert.equal(isRu(), false));

  test('реестр: у каждой записи familyEn, у названного варианта variantEn, у каждой мышцы MUSCLE_EN', () => {
    const en = /** @type {Record<string, string>} */ (/** @type {any} */ (reg).MUSCLE_EN ?? {});
    for (const e of reg.EXERCISES) {
      const x = /** @type {any} */ (e);
      assert.ok(x.familyEn && !CYR.test(x.familyEn), `${e.id}: familyEn`);
      assert.equal(Boolean(x.variantEn), Boolean(e.variantRu), `${e.id}: variantEn есть ровно там, где variantRu`);
      assert.ok(!CYR.test(x.variantEn ?? ''), `${e.id}: variantEn`);
      for (const m of e.muscles) assert.ok(en[m] && !CYR.test(en[m]), `${e.id}: MUSCLE_EN.${m}`);
    }
    assert.deepEqual(Object.keys(en).sort(), Object.keys(reg.MUSCLE_RU).sort());
  });

  test('Stats: подпись «семейство · вариант» у всех имён реестра', () => {
    for (const n of ALL_NAMES) {
      const { label } = familyLabel(n);
      assert.ok(label, n);
      assert.ok(!CYR.test(label), `${n}: ${label}`);
    }
    assert.equal(familyLabel('Bench Press').label, 'bench press · barbell');
  });

  test('радар: строка семейства и мышц есть в en и без кириллицы', () => {
    const now = Date.now();
    const w = [{ timestamp: now - 86400000, tonnage: 500, exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5, done: true }] }] }];
    const ctx = { oneRMs: { bench: 117 }, bw: 80, sex: /** @type {'m'} */ ('m'), age: 30, records: buildRecords(w), monthVol: 0, sessions30d: 1 };
    for (const key of ['bench', 'squat', 'deadlift', 'ohp']) {
      const h = axisCardHtml({ key, label: key }, ctx);
      assert.ok(!CYR.test(h), `${key}: ${h}`);
    }
    const bench = axisCardHtml({ key: 'bench', label: 'Bench' }, ctx);
    assert.ok(bench.includes('pp-rc-muscles'), 'строка семейства и мышц в en видна');
    assert.ok(bench.includes('bench press · chest'), bench);
  });

  test('выбор упражнения: лейблы семейства и мышц у всех имён реестра', () => {
    for (const n of ALL_NAMES) {
      const h = itemMetaHtml({ name: n, category: 'push', muscleGroup: 'chest' });
      assert.ok(!CYR.test(h), `${n}: ${h}`);
    }
  });
});
