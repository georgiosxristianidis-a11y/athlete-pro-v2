// @ts-check
// FIELD-3: перерыв виден на графиках — пунктир через паузу, заливки под ней нет,
// длительность словами, скраб на паузе не читает соседнюю точку.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { renderStrengthCurves, findGaps, curvePaths, pauseLabel, gapZones, MONTHLY_GAP_DAYS, SESSION_GAP_DAYS } =
  await import('../js/analytics.strength-curves.js');

const mount = () => ({ innerHTML: '', querySelectorAll: () => [], querySelector: () => null });
const wo = (y, mo, d, weight) => ({
  type: 'push',
  timestamp: new Date(y, mo, d, 12).getTime(),
  exercises: [{ name: 'Bench Press', sets: [{ weight, reps: 5, done: true }] }],
});
const mid = (y, mo) => Date.UTC(y, mo, 15, 12);

describe('FIELD-3 — findGaps', () => {
  test('соседние месяцы паузой не считаются, один пустой месяц — считается (в любой длине месяца)', () => {
    const adj = [mid(2026, 0), mid(2026, 1), mid(2026, 2), mid(2026, 3)].map((t) => ({ t }));
    assert.deepEqual(findGaps(adj, MONTHLY_GAP_DAYS), []);
    const feb = [mid(2026, 0), mid(2026, 2)].map((t) => ({ t })); // февраль пуст: 59 дн
    assert.equal(findGaps(feb, MONTHLY_GAP_DAYS).length, 1);
  });

  test('сессии: порог равен FIELD-2 — 27 дн не пауза, 28 — пауза', () => {
    const day = 86400000;
    assert.equal(SESSION_GAP_DAYS, 28);
    assert.equal(findGaps([{ t: 0 }, { t: 27 * day }], SESSION_GAP_DAYS).length, 0);
    assert.equal(findGaps([{ t: 0 }, { t: 28 * day }], SESSION_GAP_DAYS).length, 1);
  });

  test('подпись: месяцы — пустые месяцы, сессии — недели', () => {
    assert.match(pauseLabel(92, true), /(пауза|break) 2 (мес|mo)/); // июнь -> сентябрь
    assert.match(pauseLabel(63, false), /(пауза|break) 9 (нед|wk)/);
  });
});

describe('FIELD-3 — curvePaths', () => {
  const P = [
    { x: 8, y: 50 },
    { x: 40, y: 40 },
    { x: 200, y: 20 },
    { x: 312, y: 10 },
  ];
  test('без пауз разметка та же, что раньше: одна кривая, одна заливка, нет пунктира', () => {
    const r = curvePaths(P, [], { H: 96, color: 'c' });
    assert.equal(r.extra, '');
    assert.equal((r.line.match(/M /g) || []).length, 1);
    assert.equal((r.area.match(/Z/g) || []).length, 1);
  });
  test('пауза режет линию и заливку надвое, пунктир соединяет края', () => {
    const r = curvePaths(P, [{ i: 1 }], { H: 96, color: 'c' });
    assert.equal((r.line.match(/M /g) || []).length, 2);
    assert.equal((r.area.match(/Z/g) || []).length, 2);
    assert.match(r.extra, /sc-gap-line/);
    assert.match(r.extra, /M 40\.0,40\.0 L 200\.0,20\.0/);
  });
  test('изолированная точка между двумя паузами получает точку, а не пропадает', () => {
    const r = curvePaths(P, [{ i: 0 }, { i: 1 }], { H: 96, color: 'c' });
    assert.match(r.extra, /sc-gap-dot/);
  });
  test('зоны скраба лежат между краями паузы', () => {
    const z = gapZones(P, [{ i: 1, days: 92 }], true);
    assert.deepEqual([z[0].x0, z[0].x1], [40, 200]);
  });
});

describe('FIELD-3 — карточка силы', () => {
  test('пропуск февраля: пунктир, подпись «пауза 1 мес», зона скраба', () => {
    const m = mount();
    renderStrengthCurves([wo(2026, 0, 10, 60), wo(2026, 2, 10, 65), wo(2026, 3, 10, 67.5)], m);
    assert.match(m.innerHTML, /sc-gap-line/);
    assert.match(m.innerHTML, /sc-gap-note">(пауза|break) 1 (мес|mo)/);
    assert.doesNotMatch(m.innerHTML, /NaN/);
  });
  test('ровные месяцы: ни пунктира, ни подписи', () => {
    const m = mount();
    renderStrengthCurves([wo(2026, 0, 10, 60), wo(2026, 1, 10, 62.5), wo(2026, 2, 10, 65)], m);
    assert.doesNotMatch(m.innerHTML, /sc-gap/);
  });
  test('пауза 2 месяца не рисуется «обычным длинным отрезком»: сплошных кусков два', () => {
    const m = mount();
    renderStrengthCurves(
      [wo(2026, 0, 10, 60), wo(2026, 1, 10, 62.5), wo(2026, 4, 10, 65), wo(2026, 5, 10, 67.5)],
      m,
    );
    const stroke = m.innerHTML.match(/<path d="([^"]+)" fill="none" stroke="[^"]+" stroke-width="2\.5"/);
    assert.ok(stroke);
    assert.equal((stroke[1].match(/M /g) || []).length, 2);
  });
});
