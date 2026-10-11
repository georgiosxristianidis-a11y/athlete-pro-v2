// ANL-1: Volume Trend на главной — агрегация по шагу окна и окно-к-окну.
// Чистая функция, без DOM: workouts + days + now → {mode, buckets, total, prevTotal}.

import test from 'node:test';
import assert from 'node:assert/strict';

import { volumeTrend, trendPercent } from '../js/shared/volume-trend.js';

const NOW = new Date(2026, 9, 11, 15, 30); // 11 окт 2026, локальное время
const DAY = 24 * 60 * 60 * 1000;

/** Тренировка за n дней до NOW. */
const w = (daysAgo, tonnage, type = 'push') => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9, 0, 0, 0);
  return { timestamp: d.getTime(), tonnage, type };
};

/** 3 тренировки в неделю на ~5 месяцев, PPL по кругу. */
const seed = () => {
  const out = [];
  const types = ['push', 'pull', 'legs'];
  for (let i = 0; i < 150; i++) {
    if (i % 7 === 0 || i % 7 === 2 || i % 7 === 4) out.push(w(i, 1000 + (i % 5) * 100, types[out.length % 3]));
  }
  return out;
};

test('7 дней: 7 дневных корзин, доминирующий PPL-тип', () => {
  const r = volumeTrend([w(0, 500, 'push'), w(0, 900, 'legs'), w(2, 300, 'pull')], 7, NOW);
  assert.equal(r.mode, 'day');
  assert.equal(r.buckets.length, 7);
  assert.equal(r.buckets[6].value, 1400);
  assert.equal(r.buckets[6].type, 'legs', 'доминирует тип с большим тоннажем');
  assert.equal(r.buckets[4].value, 300);
  assert.equal(r.buckets[4].type, 'pull');
  assert.equal(r.buckets[5].value, 0);
  assert.equal(r.buckets[5].type, null);
  assert.equal(r.total, 1700);
});

test('30 дней: недельные корзины (5), 90 дней: 13, сумма корзин = total', () => {
  const ws = seed();
  const r30 = volumeTrend(ws, 30, NOW);
  const r90 = volumeTrend(ws, 90, NOW);
  assert.equal(r30.mode, 'week');
  assert.equal(r30.buckets.length, 5);
  assert.equal(r90.buckets.length, 13);
  assert.equal(r30.buckets.reduce((s, b) => s + b.value, 0), r30.total);
  assert.equal(r90.buckets.reduce((s, b) => s + b.value, 0), r90.total);
  assert.ok(r90.buckets.every((b) => b.value > 0), 'нулевых провалов при 3 трен./нед нет');
});

test('границы окна: день window-1 внутри, день window снаружи (идёт в прошлое окно)', () => {
  const r = volumeTrend([w(29, 100), w(30, 700), w(59, 50), w(60, 9999)], 30, NOW);
  assert.equal(r.total, 100);
  assert.equal(r.prevTotal, 750);
});

test('окно к окну: пилюля считается от предыдущего равного окна', () => {
  const r = volumeTrend([w(1, 1500), w(40, 1000)], 30, NOW);
  assert.equal(r.total, 1500);
  assert.equal(r.prevTotal, 1000);
  assert.equal(trendPercent(r), 50);
});

test('прошлое окно пустое → пилюли нет (null), а не +100%', () => {
  const r = volumeTrend([w(1, 1500)], 30, NOW);
  assert.equal(r.prevTotal, 0);
  assert.equal(trendPercent(r), null);
});

test('текущее окно пустое при непустом прошлом: total 0, пилюля -100%', () => {
  const r = volumeTrend([w(40, 1000)], 30, NOW);
  assert.equal(r.total, 0);
  assert.equal(trendPercent(r), -100);
});

test('пустое окно и нет тренировок: total 0, все корзины 0', () => {
  for (const ws of [[], null, undefined]) {
    const r = volumeTrend(ws, 7, NOW);
    assert.equal(r.total, 0);
    assert.equal(r.prevTotal, 0);
    assert.ok(r.buckets.every((b) => b.value === 0));
    assert.equal(trendPercent(r), null);
  }
});

test('не-PPL тип и мусорный тоннаж: тоннаж в сумме, тип корзины null / не падает', () => {
  const r = volumeTrend([w(0, 400, 'cardio'), w(0, undefined, 'push'), w(1, NaN, 'pull')], 7, NOW);
  assert.equal(r.total, 400);
  assert.equal(r.buckets[6].type, null);
});

test('тренировка в будущем (дрейф часов) в окно не попадает', () => {
  const r = volumeTrend([w(-2, 800)], 7, NOW);
  assert.equal(r.total, 0);
});

test('NOW не мутируется, а шаг окна не зависит от времени суток', () => {
  const before = NOW.getTime();
  const late = new Date(2026, 9, 11, 23, 59);
  const ws = [w(0, 100), w(6, 200)];
  assert.equal(volumeTrend(ws, 7, NOW).total, volumeTrend(ws, 7, late).total);
  assert.equal(NOW.getTime(), before);
  assert.ok(DAY > 0);
});
