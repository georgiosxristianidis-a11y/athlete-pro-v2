// @ts-check
/** ANL-A11 — тай-брейк по давности и вход «Все упражнения» при stats-families OFF. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateProgressionCurves } from '../js/analytics.progression-curves.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 1, 12);
const wo = (id, ts, names) => ({
  id,
  timestamp: ts,
  type: 'push',
  exercises: names.map((name) => ({ name, sets: [{ weight: 50, reps: 8, done: true }] })),
});

describe('ANL-A11 — тай-брейк при равном числе сессий', () => {
  test('свежее упражнение выше алфавитно более раннего', () => {
    const ws = [wo(1, NOW - 40 * DAY, ['Arnold Press']), wo(2, NOW - 2 * DAY, ['Zottman Curl'])];
    const out = calculateProgressionCurves(ws, { minMonths: 1, limit: 10 });
    assert.deepEqual(out.map((c) => c.name), ['Zottman Curl', 'Arnold Press']);
    assert.equal(out[0].lastTs, NOW - 2 * DAY);
  });

  test('число сессий главнее давности, имя — последний тай-брейк', () => {
    const ws = [
      wo(1, NOW - 30 * DAY, ['Bench Press', 'Seated Cable Row']),
      wo(2, NOW - 20 * DAY, ['Bench Press']),
      wo(3, NOW - 1 * DAY, ['Dips', 'Ab Wheel']),
    ];
    const out = calculateProgressionCurves(ws, { minMonths: 1, limit: 10 });
    assert.equal(out[0].name, 'Bench Press');
    assert.deepEqual(out.slice(1).map((c) => c.name), ['Ab Wheel', 'Dips', 'Seated Cable Row']);
  });

  test('большой limit возвращает все упражнения', () => {
    const ws = [wo(1, NOW, Array.from({ length: 12 }, (_, i) => `Ex ${i}`))];
    assert.equal(calculateProgressionCurves(ws, { minMonths: 1, limit: 100000 }).length, 12);
  });
});

describe('ANL-A11 — проводка входа', () => {
  const view = readFileSync(new URL('../js/analytics.view.js', import.meta.url), 'utf8');
  test('кнопка — .btn-text в section-header, действие зарегистрировано', () => {
    assert.match(view, /class="section-header" id="an-allex-head"[\s\S]*?class="btn-text" data-action="analytics:allExercises"/);
    assert.match(view, /on\('analytics:allExercises'/);
  });
  test('вход прячется при stats-families ON', () => {
    assert.match(view, /if \(!head \|\| flag\('stats-families'\)\) return;/);
  });
});
