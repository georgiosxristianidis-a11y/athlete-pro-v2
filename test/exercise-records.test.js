// @ts-check
/**
 * DATA-2 — «Мой максимум», e1RM и стаж из истории (js/shared/exercise-records.js).
 * Реестр читается напрямую, без флагов; флаг history-records стоит у вызывающих.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecords, oneRMsFromHistory, mergeOneRMs, recordKey,
  experienceYearsFromHistory, effectiveExperienceYears,
} from '../js/shared/exercise-records.js';
import { flag } from '../js/flags.js';

const day = (/** @type {number} */ n) => new Date(2025, 0, n, 12).getTime();
const w = (/** @type {number} */ d, /** @type {any[]} */ exercises) => ({ timestamp: day(d), exercises });
const set = (/** @type {number} */ weight, /** @type {number} */ reps, extra = {}) => ({ weight, reps, done: true, ...extra });

describe('рекорды по id реестра', () => {
  test('расколы имён — один рекорд, варианты — разные', () => {
    const rec = buildRecords([
      w(1, [{ name: 'Pullover DB', sets: [set(20, 10)] }, { name: 'Bench Press', sets: [set(80, 5)] }]),
      w(8, [{ name: 'Dumbbell Pullover', sets: [set(24, 10)] }, { name: 'Dumbbell Bench Press', sets: [set(30, 8)] }]),
    ]);
    assert.equal(rec.get('pullover.base')?.myMax.weight, 24);
    assert.equal(rec.get('pullover.base')?.sessions, 2);
    assert.equal(rec.get('bench.barbell')?.myMax.weight, 80);
    assert.equal(rec.get('bench.dumbbell')?.myMax.weight, 30);
  });

  test('«Мой максимум» — самый тяжёлый подход, при равенстве больше повторов; e1RM отдельно', () => {
    const [r] = [...buildRecords([
      w(1, [{ name: 'Bench Press', sets: [set(100, 1), set(100, 3), set(80, 12)] }]),
    ]).values()];
    assert.deepEqual([r.myMax.weight, r.myMax.reps], [100, 3]);
    assert.equal(r.e1rm.weight, 80);
    assert.equal(r.e1rm.value, 112);
  });

  test('ё/е и регистр не раскалывают; неизвестное имя — своим ключом', () => {
    assert.equal(recordKey('Жим лёжа'), recordKey('жим лежа'));
    assert.equal(recordKey('Bench Press'), 'bench.barbell');
    assert.equal(recordKey('Что-то своё'), 'name:что-то свое');
  });

  test('не поднятое не считается: done:false, 0 повторов, 0 кг, удалённая сессия', () => {
    const rec = buildRecords([
      { ...w(1, [{ name: 'Bench Press', sets: [set(200, 5)] }]), _deleted: true },
      w(2, [{ name: 'Bench Press', sets: [set(150, 5, { done: false }), set(150, 0), set(0, 10), set(60, 5)] }]),
    ]);
    assert.equal(rec.get('bench.barbell')?.myMax.weight, 60);
  });
});

describe('1RM из истории для норм', () => {
  test('штанговый жим и OHP попадают в lift, гантели и хак-присед — нет', () => {
    const o = oneRMsFromHistory([w(1, [
      { name: 'Barbell Bench Press', sets: [set(80, 8)] },
      { name: 'Dumbbell Bench Press', sets: [set(60, 8)] },
      { name: 'Hack Squat (Machine)', sets: [set(200, 8)] },
      { name: 'Seated Dumbbell Shoulder Press', sets: [set(30, 8)] },
      { name: 'Overhead Press (OHP)', sets: [set(40, 5)] },
    ])]);
    assert.deepEqual(o, { bench: 101, ohp: 47 });
  });

  test('mergeOneRMs берёт большее и не теряет ручные значения ORM', () => {
    assert.deepEqual(
      mergeOneRMs({ bench: 90, squat: 140 }, { bench: 101, ohp: 47 }),
      { bench: 101, squat: 140, ohp: 47 },
    );
  });
});

describe('стаж из истории', () => {
  test('срок от первой до последней тренировки; одна тренировка — стажа нет', () => {
    const ws = [{ timestamp: new Date(2023, 4, 2).getTime() }, { timestamp: new Date(2026, 9, 2).getTime() }];
    assert.equal(experienceYearsFromHistory(ws), 3.4);
    assert.equal(experienceYearsFromHistory([ws[0]]), 0);
    assert.equal(experienceYearsFromHistory([]), 0);
  });

  test('effectiveExperienceYears: история важнее онбординга, без истории — онбординг', () => {
    const ws = [{ timestamp: new Date(2023, 4, 2).getTime() }, { timestamp: new Date(2026, 9, 2).getTime() }];
    assert.equal(effectiveExperienceYears(2, ws), 3.4);
    assert.equal(effectiveExperienceYears(2, []), 2);
    assert.equal(effectiveExperienceYears(undefined, []), 0);
  });
});

test('флаг history-records по умолчанию OFF', () => {
  assert.equal(flag('history-records'), false);
});
