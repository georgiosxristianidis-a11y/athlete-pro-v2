// @ts-check
/**
 * DATA-0 — baseline логики данных (аудит 01.11, docs/handoff/HANDOFF_data_logic.md).
 *
 * Тесты с `{ todo: true }` фиксируют поведение, которое Фазы 1-2 обязаны
 * исправить: сейчас они красные, но прогон не валят. Фаза, которая чинит
 * случай, снимает `todo` — с этого момента тест держит фикс.
 *
 * У каждого todo — положительный контроль без todo: случай, где сигнал
 * обязан быть уже сейчас. Без него красный todo мог бы значить «стенд
 * сломан», а не «баг на месте».
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// passport-hero тянет events.js / utils.js — они вешают слушатели при импорте.
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

const { mapOneRMs } = await import('../js/shared/lift-map.js');
const { renderStrengthHero } = await import('../js/analytics.strength-curves.js');
const { renderPassportHero } = await import('../js/profile.view/passport-hero.js');

const rm = (/** @type {string} */ id, value = 100) => mapOneRMs([{ id, value }]);

describe('lift-map: тренажёр и гантели — не жим лёжа штангой', () => {
  test('контроль: штанговый жим даёт bench', () => {
    assert.equal(rm('Barbell Bench Press').bench, 100);
    assert.equal(rm('Bench Press').bench, 100);
  });

  test('Dumbbell Bench Press не засчитан как жим штанги', { todo: true }, () => {
    assert.equal(rm('Dumbbell Bench Press').bench, undefined);
  });

  test('Incline Dumbbell Bench Press не засчитан как жим штанги', { todo: true }, () => {
    assert.equal(rm('Incline Dumbbell Bench Press').bench, undefined);
  });
});

describe('lift-map: русские названия', () => {
  test('контроль: «жим лёжа» через «ё» даёт bench', () => {
    assert.equal(rm('Жим лёжа').bench, 100);
  });

  test('«жим лежа» через «е» распознан', { todo: true }, () => {
    assert.equal(rm('Жим лежа').bench, 100);
  });

  test('контроль: Overhead Press (OHP) даёт ohp', () => {
    assert.equal(rm('Overhead Press (OHP)').ohp, 100);
  });

  test('«жим штанги стоя» даёт ohp', { todo: true }, () => {
    assert.equal(rm('Жим штанги стоя').ohp, 100);
  });
});

describe('1RM после импорта без orm', () => {
  // Форма бэкапа ETL (scripts/import-etl.py): история есть, orm пуст.
  const imported = {
    workouts: [{
      type: 'push',
      timestamp: new Date(2025, 5, 1, 12).getTime(),
      exercises: [{ name: 'Barbell Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }],
    }],
    orm: /** @type {Array<{id: string, value: number}>} */ ([]),
  };

  test('контроль: orm с жимом даёт bench', () => {
    assert.equal(mapOneRMs([{ id: 'Bench Press', value: 101 }]).bench, 101);
  });

  // Ф2 заменит mapOneRMs(orm) производной от истории — тест переписать на неё.
  test('жим из истории виден в 1RM, даже когда orm пуст', { todo: true }, () => {
    assert.ok((mapOneRMs(imported.orm).bench ?? 0) > 0);
  });
});

describe('стаж: профиль и история', () => {
  // История 3.5 года: 2023-05 … 2026-10, жим растёт помесячно.
  const months = [];
  for (let i = 0; i <= 41; i += 1) months.push(new Date(2023, 4 + i, 2, 12).getTime());
  const workouts = months.map((ts, i) => ({
    type: 'push',
    timestamp: ts,
    duration: 0,
    tonnage: (40 + i) * 5,
    exercises: [{ name: 'Bench Press', sets: [{ weight: 40 + i, reps: 5, rpe: null, done: true }] }],
  }));
  const profile = /** @type {any} */ ({ name: 'Test', sex: 'm', dob: '', experienceYears: 2 });

  test('контроль: герой Stats считает стаж по истории — 3.4 г', () => {
    const mount = { innerHTML: '' };
    renderStrengthHero(workouts, mount);
    assert.match(mount.innerHTML, />3\.4<small>/);
  });

  test('контроль: паспорт печатает стаж из профиля', () => {
    const html = renderPassportHero(profile, null, {}, 'en');
    assert.match(html, /2y exp/);
  });

  test('стаж в паспорте совпадает со сроком истории', { todo: true }, () => {
    const html = renderPassportHero(profile, null, {}, 'en');
    assert.match(html, /3(\.\d)?y exp/);
  });
});
