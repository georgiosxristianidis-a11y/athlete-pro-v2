/**
 * HOME-1 хвост: недельная математика живёт в одном месте — js/shared/week.js.
 * badge-ladders (weekKey, weeklyStreak) и dashboard.store (computeWeekStreak)
 * — тонкие обёртки над ним. Даты через new Date(y, m, d, h) — местное время,
 * как в проде.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { weekKey, streakWeeks } from '../js/shared/week.js';
import * as ladders from '../js/shared/badge-ladders.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (m, d, h = 12, min = 0) => new Date(2026, m, d, h, min).getTime();
const s = (ts) => ({ timestamp: ts });

// Среда 14.10.2026 12:00; текущая неделя с пн 12.10.
const NOW = at(9, 14);

describe('weekKey', () => {
  test('воскресенье 23:59 и понедельник 00:00 — соседние недели', () => {
    const sun = new Date(2026, 9, 11, 23, 59, 59, 999).getTime();
    const mon = new Date(2026, 9, 12, 0, 0, 0, 0).getTime();
    assert.equal(weekKey(mon) - weekKey(sun), 7);
    assert.equal(weekKey(NOW), weekKey(mon), 'среда — та же неделя, что её понедельник');
  });

  test('смена месяца внутри недели: вс 01.11 в неделе пн 26.10', () => {
    assert.equal(weekKey(at(10, 1)), weekKey(at(9, 26)));
    assert.equal(weekKey(at(10, 2)) - weekKey(at(10, 1)), 7);
  });

  test('неделя после перехода с летнего времени (25.10) — ровно 7 дней', () => {
    assert.equal(weekKey(at(9, 26, 0)) - weekKey(at(9, 19, 0)), 7);
  });

  test('ключ — понедельник как номер дня от эпохи (UTC-календарь)', () => {
    assert.equal(weekKey(NOW), Date.UTC(2026, 9, 12) / 86400000);
  });
});

describe('streakWeeks', () => {
  test('пустой массив, undefined и мусор — 0', () => {
    assert.equal(streakWeeks([], NOW, 2), 0);
    assert.equal(streakWeeks(undefined, NOW, 2), 0);
    assert.equal(streakWeeks([null, { timestamp: NaN }], NOW, 2), 0);
  });

  test('текущая неделя ещё не засчитана — серия не рвётся, считается от прошлой', () => {
    const past = [s(at(9, 5)), s(at(9, 7)), s(at(8, 28)), s(at(8, 30))];
    assert.equal(streakWeeks([...past, s(at(9, 12))], NOW, 2), 2);
  });

  test('текущая неделя уже засчитана — даёт +1', () => {
    const past = [s(at(9, 5)), s(at(9, 7))];
    assert.equal(streakWeeks([...past, s(at(9, 12)), s(at(9, 13))], NOW, 2), 2);
  });

  test('пустая прошлая неделя рвёт серию', () => {
    assert.equal(streakWeeks([s(at(8, 28)), s(at(8, 30))], NOW, 2), 0);
  });

  test('серия через смену месяца: недели 26.10 и 02.11', () => {
    const now = at(10, 4);
    const ws = [s(at(9, 26)), s(at(10, 1)), s(at(10, 2)), s(at(10, 3))];
    assert.equal(streakWeeks(ws, now, 2), 2);
  });

  // До гарда min <= 0 засчитывал любую неделю, в том числе пустую: цикл не кончался.
  test('порог 0, отрицательный и NaN — 0, без зависания', () => {
    const ws = [s(at(9, 5)), s(at(9, 7)), s(at(9, 12))];
    for (const min of [0, -1, NaN]) {
      assert.equal(streakWeeks([], NOW, min), 0, `пусто, min=${min}`);
      assert.equal(streakWeeks(ws, NOW, min), 0, `с тренировками, min=${min}`);
    }
  });

  test('порог >= 1 не изменился: 1 считает неделю с одной тренировкой', () => {
    const ws = [s(at(9, 5)), s(at(9, 12))];
    assert.equal(streakWeeks(ws, NOW, 1), 2);
    assert.equal(streakWeeks(ws, NOW, 2), 0);
  });
});

describe('обёртки ведут к одному ядру', () => {
  test('badge-ladders.weekKey — та же функция, что shared/week.weekKey', () => {
    assert.equal(ladders.weekKey, weekKey);
  });

  test('weeklyStreak и computeWeekStreak совпадают с ядром', async () => {
    const { computeWeekStreak } = await import('../js/dashboard.store.js');
    const ws = [s(at(9, 5)), s(at(9, 7)), s(at(8, 28)), s(at(8, 30)), s(at(9, 12))];
    const core = streakWeeks(ws, NOW, 2);
    assert.equal(ladders.weeklyStreak(ws, NOW), core);
    assert.equal(computeWeekStreak(ws, undefined, NOW), core);
    // Порог: weeklyStreak берёт min как есть, computeWeekStreak — не ниже 2.
    assert.equal(ladders.weeklyStreak(ws, NOW, 1), streakWeeks(ws, NOW, 1));
    assert.equal(computeWeekStreak(ws, 1, NOW), core);
  });
});

describe('один источник недельной математики', () => {
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  function jsFiles(dir) {
    const out = [];
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) out.push(...jsFiles(rel));
      else if (e.name.endsWith('.js')) out.push(rel);
    }
    return out;
  }

  // Ключ недели = Date.UTC(понедельник) / сутки. (getDay() + 6) % 7 сам по себе
  // не признак: dashboard.js берёт его для подписи дня недели.
  test('ключ недели Date.UTC(...) / сутки считается только в shared/week.js', () => {
    const re = /Date\.UTC\([^;]*?\)\s*\/\s*(?:86400000|864e5|DAY_MS)\b/;
    const hits = jsFiles('js').filter((f) =>
      re.test(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    );
    assert.deepEqual(hits, ['js/shared/week.js']);
  });

  test('shared/week.js без импортов — в бут-граф Главной не тянет ничего', () => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, 'js/shared/week.js'), 'utf8'));
    assert.equal(/^\s*import\b/m.test(code), false);
  });
});
