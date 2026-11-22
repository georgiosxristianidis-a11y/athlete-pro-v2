// ANL-A3: недельный график объёма — календарные недели пн–вс, неполная текущая неделя,
// лучшая только среди полных, норма — среднее непустых из последних 4 полных.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { calendarWeeks, weekSummary, axisLabelMask, calendarWeekLabel, NORM_WEEKS } =
  await import('../js/analytics.store.js');

// Среда 18.11.2026 14:00 локально; понедельник текущей недели — 16.11.
const NOW = new Date(2026, 10, 18, 14, 0, 0);
const at = (y, m, d, h = 12, min = 0) => new Date(y, m, d, h, min).getTime();

describe('calendarWeeks — границы недель', () => {
  test('неделя начинается в понедельник 00:00, последняя — текущая и неполная', () => {
    const w = calendarWeeks([], 10, NOW);
    assert.equal(w.length, 10);
    const last = w[w.length - 1];
    assert.equal(last.start, at(2026, 10, 16, 0, 0));
    assert.equal(last.end, at(2026, 10, 23, 0, 0));
    assert.equal(last.partial, true);
    assert.ok(w.slice(0, -1).every((b) => !b.partial));
    assert.equal(new Date(w[0].start).getDay(), 1);
  });

  test('вс 23:59 и пн 00:00 — разные недели', () => {
    const w = calendarWeeks(
      [
        { timestamp: at(2026, 10, 15, 23, 59), tonnage: 1000 },
        { timestamp: at(2026, 10, 16, 0, 0), tonnage: 500 },
      ],
      10,
      NOW
    );
    assert.equal(w[8].tonnage, 1000);
    assert.equal(w[9].tonnage, 500);
  });

  test('все типы суммируются, включая custom; вне окна — мимо', () => {
    const w = calendarWeeks(
      [
        { timestamp: at(2026, 10, 10), tonnage: 100, type: 'push' },
        { timestamp: at(2026, 10, 11), tonnage: 50, type: 'custom' },
        { timestamp: at(2025, 0, 1), tonnage: 9999, type: 'legs' },
        { timestamp: at(2026, 10, 30), tonnage: 9999, type: 'pull' },
        { timestamp: 'x', tonnage: 9999 },
      ],
      10,
      NOW
    );
    assert.equal(w[8].tonnage, 150);
    assert.equal(
      w.reduce((s, b) => s + b.tonnage, 0),
      150
    );
  });

  test('пустые недели остаются столбцами с нулём', () => {
    const w = calendarWeeks([{ timestamp: at(2026, 9, 1), tonnage: 300 }], 10, NOW);
    assert.equal(w.length, 10);
    assert.equal(w.filter((b) => b.tonnage === 0).length, 9);
  });

  test('переход на зимнее время не сдвигает понедельник', () => {
    // В зоне с DST (25.10.2026 в ЕС) 7*86400000 дал бы 23:00 воскресенья.
    const w = calendarWeeks([], 10, NOW);
    for (const b of w) {
      const d = new Date(b.start);
      assert.equal(d.getDay(), 1);
      assert.equal(d.getHours(), 0);
    }
  });
});

describe('weekSummary — лучшая и норма', () => {
  const B = (tonnage, partial = false) => ({ tonnage, partial });

  test('лучшая неделя не берётся из неполной', () => {
    const s = weekSummary([B(100), B(300), B(200), B(999, true)]);
    assert.equal(s.bestIndex, 1);
    assert.equal(s.best, 300);
  });

  test('норма — среднее непустых из последних полных, без неполной', () => {
    assert.equal(NORM_WEEKS, 4);
    const s = weekSummary([B(1000), B(100), B(200), B(0), B(300), B(5000, true)]);
    // последние 4 полных: 100, 200, 0, 300 → непустые 100/200/300
    assert.equal(s.norm, 200);
  });

  test('ни одной полной непустой — нет лучшей и нормы', () => {
    const s = weekSummary([B(0), B(0), B(700, true)]);
    assert.equal(s.bestIndex, -1);
    assert.equal(s.norm, null);
  });
});

describe('подписи оси', () => {
  test('через одну, считая справа: текущая подписана всегда', () => {
    assert.deepEqual(axisLabelMask(5), [true, false, true, false, true]);
    assert.deepEqual(axisLabelMask(4), [false, true, false, true]);
    assert.equal(axisLabelMask(10).at(-1), true);
  });

  test('дата понедельника д.мм', () => {
    assert.equal(calendarWeekLabel({ start: at(2026, 10, 16, 0, 0) }), '16.11');
    assert.equal(calendarWeekLabel({ start: at(2026, 0, 5, 0, 0) }), '5.01');
  });
});
