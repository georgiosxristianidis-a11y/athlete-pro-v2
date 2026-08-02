import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { workoutsToTxt } = await import('../js/shared/txt-export.js');

const NOW = new Date('2026-08-02T10:00:00.000Z');

const W = [
  {
    type: 'push',
    timestamp: Date.UTC(2026, 6, 30, 9, 0),
    duration: 58 * 60000,
    tonnage: 12450,
    exercises: [
      {
        name: 'Жим лёжа',
        sets: [
          { weight: 80, reps: 8, rpe: 8, done: true },
          { weight: 82.5, reps: 6, rpe: null, done: true },
          { weight: 85, reps: 5, rpe: null, done: false },
        ],
      },
    ],
  },
  {
    type: 'legs',
    timestamp: Date.UTC(2026, 7, 1, 9, 0),
    duration: 61 * 60000,
    tonnage: 9000,
    exercises: [],
  },
];

describe('workoutsToTxt', () => {
  test('свежие тренировки сверху', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.ok(txt.indexOf('2026-08-01') < txt.indexOf('2026-07-30'));
  });

  test('шапка: дата выгрузки, счёт и суммарный тоннаж', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /Выгружено: 2026-08-02/);
    assert.match(txt, /Тренировок: 2/);
    assert.match(txt, /Общий тоннаж: 21 450 кг/);
  });

  test('дробный вес не округляется до целого', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /82\.5 кг × 6/);
  });

  test('пропущенный подход помечен, а не выброшен', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /3\. — пропущен/);
    assert.match(txt, /\(2 подходов\)/, 'в счёт идут только выполненные');
  });

  test('RPE печатается только когда он есть', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /80 кг × 8 {2}RPE 8/);
    assert.ok(!/82\.5 кг × 6 {2}RPE/.test(txt));
  });

  test('английская локаль переводит подписи', () => {
    const txt = workoutsToTxt(W, { lang: 'en', now: NOW });
    assert.match(txt, /training log/);
    assert.match(txt, /Workouts: 2/);
    assert.match(txt, /80 kg × 8/);
  });

  test('пустая история — валидный текст, а не пустая строка', () => {
    const txt = workoutsToTxt([], { lang: 'ru', now: NOW });
    assert.match(txt, /Тренировок: 0/);
    assert.match(txt, /История пуста/);
  });

  test('мусор на входе не роняет: null, undefined, кривые записи', () => {
    assert.match(workoutsToTxt(null, { now: NOW }), /Workouts: 0/);
    assert.match(workoutsToTxt(undefined, { now: NOW }), /Workouts: 0/);
    const junk = [{ type: null, timestamp: NaN, exercises: [{ name: null, sets: null }] }];
    assert.doesNotThrow(() => workoutsToTxt(junk, { now: NOW }));
  });

  test('без эмодзи — правило DESIGN_DNA', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.ok(!/\p{Extended_Pictographic}/u.test(txt));
  });
});
