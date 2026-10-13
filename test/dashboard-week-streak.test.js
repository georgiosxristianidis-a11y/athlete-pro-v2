/**
 * HOME-1: серия на Главной в НЕДЕЛЯХ (computeWeekStreak, флаг streak-weeks).
 * Правило Gio 13.10: неделя ISO пн–вс по местному времени засчитана при
 * тренировках ≥ max(норма, 2); текущая незаконченная неделя серию не рвёт.
 * Даты строятся через new Date(y, m, d, h) — местное время, как в проде.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { computeWeekStreak } = await import('../js/dashboard.store.js');

const at = (m, d, h = 12, min = 0) => new Date(2026, m, d, h, min).getTime();
// Сессия как из DB.Workouts.getAll(): часть подходов недожата (done:false) —
// computeStreak считает каждую сохранённую сессию, серия недель тоже.
const s = (ts, type = 'push') => ({
  timestamp: ts,
  type,
  exercises: [{ name: 'Жим', sets: [{ weight: 100, reps: 5, done: true }, { weight: 105, reps: 5, done: false }] }],
});
const newestFirst = (arr) => [...arr].sort((a, b) => b.timestamp - a.timestamp);

// Сейчас — среда 14.10.2026, 12:00. Текущая неделя с пн 12.10.
const NOW = at(9, 14);
// Три прошлые недели по 3 тренировки (пн/ср/пт): с 21.09, 28.09, 05.10.
const PPL3 = [
  s(at(8, 21), 'push'), s(at(8, 23), 'pull'), s(at(8, 25), 'legs'),
  s(at(8, 28), 'push'), s(at(8, 30), 'pull'), s(at(9, 2), 'legs'),
  s(at(9, 5), 'push'), s(at(9, 7), 'pull'), s(at(9, 9), 'legs'),
];

describe('computeWeekStreak', () => {
  test('3/нед три недели подряд = 3 (newest-first, текущая пуста)', () => {
    assert.equal(computeWeekStreak(newestFirst(PPL3), 3, NOW), 3);
  });

  test('порядок массива не влияет', () => {
    assert.equal(computeWeekStreak(PPL3, 3, NOW), 3);
  });

  test('неделя с 1 тренировкой рвёт серию', () => {
    // Неделя с 28.09 — одна тренировка: засчитана только неделя с 05.10.
    const broken = PPL3.filter((w) => w.timestamp !== at(8, 30) && w.timestamp !== at(9, 2));
    assert.equal(computeWeekStreak(newestFirst(broken), 2, NOW), 1);
  });

  test('норма 4 и 3 тренировки — неделя не засчитана', () => {
    assert.equal(computeWeekStreak(newestFirst(PPL3), 4, NOW), 0);
  });

  test('норма 1 поднимается до порога 2', () => {
    const one = [s(at(9, 5)), s(at(8, 28)), s(at(8, 21))];
    assert.equal(computeWeekStreak(one, 1, NOW), 0);
    const two = [s(at(9, 5)), s(at(9, 6)), s(at(8, 28))];
    assert.equal(computeWeekStreak(two, 1, NOW), 1);
  });

  test('нет нормы — порог 2', () => {
    assert.equal(computeWeekStreak(newestFirst(PPL3), undefined, NOW), 3);
    assert.equal(computeWeekStreak([s(at(9, 5))], undefined, NOW), 0);
  });

  test('текущая неделя с 0 тренировок не рвёт серию', () => {
    // Понедельник утром: на этой неделе ещё ничего.
    assert.equal(computeWeekStreak(newestFirst(PPL3), 3, at(9, 12, 7)), 3);
  });

  test('текущая неделя с 1 тренировкой (ниже нормы) не рвёт и не добавляет', () => {
    assert.equal(computeWeekStreak(newestFirst([s(at(9, 12)), ...PPL3]), 2, NOW), 3);
  });

  test('текущая засчитанная неделя даёт +1', () => {
    const cur = [s(at(9, 12)), s(at(9, 14, 8))];
    assert.equal(computeWeekStreak(newestFirst([...cur, ...PPL3]), 2, NOW), 4);
  });

  test('пропущенная прошлая неделя обнуляет серию, даже если раньше были', () => {
    const old = PPL3.filter((w) => w.timestamp < at(9, 5, 0));
    assert.equal(computeWeekStreak(newestFirst(old), 2, NOW), 0);
  });

  test('вс 23:30 и пн 00:30 по местному времени — разные недели', () => {
    // Вс 11.10 23:30 — прошлая неделя, пн 12.10 00:30 — текущая.
    const edge = [s(at(9, 12, 0, 30)), s(at(9, 11, 23, 30))];
    assert.equal(computeWeekStreak(edge, 2, NOW), 0, 'по одной в каждой неделе — не засчитано');
    // Если бы обе легли в одну неделю, серия стала бы 1.
    const sameWeek = [s(at(9, 11, 23, 30)), s(at(9, 10, 10))];
    assert.equal(computeWeekStreak(sameWeek, 2, NOW), 1);
  });

  test('пустая история и мусор — 0, не NaN', () => {
    assert.equal(computeWeekStreak([], 3, NOW), 0);
    assert.equal(computeWeekStreak(undefined, 3, NOW), 0);
    assert.equal(computeWeekStreak([null, { timestamp: NaN }], 3, NOW), 0);
  });
});
