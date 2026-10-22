// @ts-check
/**
 * HOME-1 хвост: значок «3 недели без пропусков» (_calcConsistency в
 * js/shared/athlete-room.js) считает неделю с понедельника через
 * js/shared/week.js. Раньше ключ недели был Math.floor(ts / 7 суток) —
 * неделя от эпохи, а эпоха 01.01.1970 — четверг: граница резала неделю
 * Пн–Вс на две. Условие значка не меняется: >= 9 тренировок и >= 3
 * активных недели из последних 5 (текущая + 4 прошлых).
 *
 * Даты через new Date(y, m, d, h) — местное время, как в проде. Старая
 * граница — Чт 00:00 UTC, по местному времени ночь Ср→Чт; все тесты ниже,
 * кроме порога, на старом коде красные.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// events.js / utils.js вешают слушатели на document/window при импорте.
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

const { _calcConsistency } = await import('../js/shared/athlete-room.js');

const at = (m, d, h = 12, min = 0) => new Date(2026, m, d, h, min).getTime();
const s = (ts) => ({ timestamp: ts });

// Среда 14.10.2026 12:00; текущая неделя с пн 12.10.
const NOW = at(9, 14);

describe('_calcConsistency — неделя с понедельника', () => {
  // Две недели Пн–Вс: 05.10–11.10 и 12.10–18.10. Старый ключ резал каждую
  // в четверг и насчитывал три недели — значок выдавался за две.
  test('Пн, Ср и Пт одной недели — одна неделя: 9 тренировок за 2 недели не значок', () => {
    const now = at(9, 18, 20);
    const ws = [
      s(at(9, 5)), s(at(9, 7)), s(at(9, 9)), s(at(9, 11)),
      s(at(9, 12)), s(at(9, 14)), s(at(9, 16)), s(at(9, 17)), s(at(9, 18)),
    ];
    assert.equal(_calcConsistency(ws, now), false);
  });

  // Без тренировки на стыке активны недели 28.09 и 12.10, неделя 05.10 пуста.
  // Вс 11.10 23:59 — ещё неделя 05.10 (третья активная), Пн 12.10 00:00 — уже
  // текущая (активных так и остаётся две).
  test('граница Вс 23:59 → Пн 00:00 переключает неделю', () => {
    const base = [
      s(at(8, 28)), s(at(8, 28, 18)), s(at(8, 29)), s(at(8, 29, 18)),
      s(at(9, 12, 8)), s(at(9, 12, 18)), s(at(9, 13)), s(at(9, 14, 9)),
    ];
    const sun = new Date(2026, 9, 11, 23, 59, 59, 999).getTime();
    const mon = new Date(2026, 9, 12, 0, 0, 0, 0).getTime();
    assert.equal(_calcConsistency([...base, s(sun)], NOW), true, 'вс 23:59 — прошлая неделя');
    assert.equal(_calcConsistency([...base, s(mon)], NOW), false, 'пн 00:00 — текущая неделя');
  });

  // Сейчас ср 04.11. Неделя 26.10–01.11 идёт через смену месяца (и через
  // переход на зимнее время 25.10 в неделе до неё); тренировки в ней только
  // в сб 31.10 и вс 01.11.
  test('смена месяца: неделя 26.10–01.11 засчитана, три недели подряд — значок', () => {
    const now = at(10, 4);
    const ws = [
      s(at(9, 19)), s(at(9, 19, 18)), s(at(9, 20)),
      s(at(9, 31)), s(at(10, 1)), s(at(10, 1, 18)),
      s(at(10, 2)), s(at(10, 2, 18)), s(at(10, 3)),
    ];
    assert.equal(_calcConsistency(ws, now), true);
  });

  // Окно — текущая неделя (пн 12.10) и четыре прошлых: самая ранняя с пн 14.09.
  test('окно ровно 5 недель: пн 14.09 00:00 внутри, вс 13.09 23:59 снаружи', () => {
    const base = [
      s(at(8, 28)), s(at(8, 28, 15)), s(at(8, 28, 18)),
      s(at(8, 21)), s(at(8, 21, 15)), s(at(8, 21, 18)),
    ];
    const edgeIn = new Date(2026, 8, 14, 0, 0, 0, 0).getTime();
    const edgeOut = new Date(2026, 8, 13, 23, 59, 59, 999).getTime();
    const triple = (ts) => [s(ts), s(ts), s(ts)];
    assert.equal(_calcConsistency([...base, ...triple(edgeIn)], NOW), true, 'неделя 14.09 — в окне');
    assert.equal(_calcConsistency([...base, ...triple(edgeOut)], NOW), false, 'неделя 07.09 — за окном');
  });

  test('порог не изменился: 8 тренировок за 3 недели — нет, 9 — да', () => {
    const eight = [
      s(at(8, 28)), s(at(8, 29)), s(at(8, 30)),
      s(at(9, 5)), s(at(9, 6)), s(at(9, 7)),
      s(at(9, 12)), s(at(9, 13)),
    ];
    assert.equal(_calcConsistency(eight, NOW), false);
    assert.equal(_calcConsistency([...eight, s(at(9, 14, 9))], NOW), true);
  });
});
