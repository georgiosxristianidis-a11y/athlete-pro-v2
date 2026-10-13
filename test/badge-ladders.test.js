import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNGS,
  weekKey,
  weeklyStreak,
  dayStreak,
  climb,
  buildLadders,
  splitHeroes,
  currentFill,
} from '../js/shared/badge-ladders.js';

const DAY = 86400000;
// Среда 14.10.2026 12:00 локального времени — середина недели, граница недели далеко.
const NOW = new Date(2026, 9, 14, 12, 0, 0).getTime();
const at = (daysAgo) => NOW - daysAgo * DAY;
const sess = (daysAgo, extra = {}) => ({ timestamp: at(daysAgo), tonnage: 8000, prs: [], ...extra });

test('climb: сегменты считаются от предыдущей ступени, а не от нуля', () => {
  const c = climb([5, 10, 15, 20], 11.8);
  assert.equal(c.reached, 2);
  assert.equal(c.next, 15);
  assert.deepEqual(c.segs.slice(0, 2), [1, 1]);
  assert.ok(Math.abs(c.segs[2] - 0.36) < 1e-9);
  assert.equal(c.segs[3], 0);
});

test('climb: ноль, мусор и потолок лестницы', () => {
  assert.equal(climb([10, 50], 0).reached, 0);
  assert.equal(climb([10, 50], NaN).reached, 0);
  assert.equal(climb([10, 50], -3).reached, 0);
  const top = climb([10, 50], 400);
  assert.equal(top.reached, 2);
  assert.equal(top.next, null);
  assert.deepEqual(top.segs, [1, 1]);
});

test('weekKey: неделя с понедельника, воскресенье и понедельник — соседние недели', () => {
  const sun = new Date(2026, 9, 11, 23, 0).getTime();
  const mon = new Date(2026, 9, 12, 1, 0).getTime();
  const mon2 = new Date(2026, 9, 18, 23, 0).getTime();
  assert.equal(weekKey(mon) - weekKey(sun), 7);
  assert.equal(weekKey(mon2), weekKey(mon));
});

test('weeklyStreak: недели с >=2 тренировок подряд, порядок входа не важен', () => {
  // Эта неделя: 1 тренировка (идёт, серию не рвёт); три прошлых недели по 2.
  const ws = [sess(0), sess(7), sess(8), sess(14), sess(15), sess(21), sess(22)];
  assert.equal(weeklyStreak(ws, NOW), 3);
  assert.equal(weeklyStreak([...ws].reverse(), NOW), 3);
});

test('weeklyStreak: пустая прошлая неделя рвёт серию, одна тренировка в неделе не считается', () => {
  assert.equal(weeklyStreak([sess(0), sess(1), sess(14), sess(15)], NOW), 1);
  assert.equal(weeklyStreak([sess(7), sess(14), sess(21)], NOW), 0);
  assert.equal(weeklyStreak([], NOW), 0);
});

test('weeklyStreak: текущая неделя с двумя тренировками входит в серию', () => {
  assert.equal(weeklyStreak([sess(0), sess(1), sess(7), sess(8)], NOW), 2);
});

test('dayStreak: сегодня без тренировки не рвёт серию, пропуск рвёт', () => {
  assert.equal(dayStreak([sess(1), sess(2), sess(3)], NOW), 3);
  assert.equal(dayStreak([sess(0), sess(1), sess(3)], NOW), 2);
  assert.equal(dayStreak([], NOW), 0);
});

test('buildLadders: тоннаж, тренировки и PR на фикстуре из трёх сессий', () => {
  const ws = [
    sess(0, { tonnage: 11800, prs: [{}, {}] }),
    sess(3, { tonnage: 7000, prs: [{}] }),
    sess(6, { tonnage: 9000 }),
  ];
  const by = Object.fromEntries(buildLadders(ws, { now: NOW }).map((l) => [l.id, l]));
  assert.equal(by.sessionTonnes.value, 11.8);
  assert.equal(by.sessionTonnes.reached, 2);
  assert.ok(Math.abs(by.totalTonnes.value - 27.8) < 1e-9);
  assert.equal(by.totalTonnes.reached, 0);
  assert.equal(by.workouts.value, 3);
  assert.equal(by.prs.value, 3);
  assert.equal(by.dayStreak.reached, 0);
  assert.equal(by.bench, undefined, 'без 1RM и веса плитки жима нет');
});

test('buildLadders: сессии без tonnage и prs не ломают расчёт', () => {
  const ws = [{ timestamp: at(0) }, { timestamp: at(1), tonnage: NaN, prs: null }];
  const by = Object.fromEntries(buildLadders(ws, { now: NOW }).map((l) => [l.id, l]));
  assert.equal(by.sessionTonnes.value, 0);
  assert.equal(by.prs.value, 0);
});

test('buildLadders: жим берёт ступени из таблицы exrxTier, а не «× веса тела»', () => {
  const l = buildLadders([sess(0)], { now: NOW, benchOneRM: 105, bodyweight: 90, sex: 'm', age: 38 }).find(
    (x) => x.id === 'bench'
  );
  assert.deepEqual(l.rungs, [95, 125, 165, 210]);
  assert.equal(l.reached, 1);
  assert.equal(l.next, 125);
});

test('RUNGS: пороги Gio 13.10 не дрейфуют', () => {
  assert.deepEqual(RUNGS.sessionTonnes, [5, 10, 15, 20]);
  assert.deepEqual(RUNGS.totalTonnes, [100, 500, 1000]);
  assert.deepEqual(RUNGS.workouts, [10, 50, 100, 250]);
  assert.deepEqual(RUNGS.weekStreak, [3, 6, 12, 26]);
  assert.deepEqual(RUNGS.prs, [10, 25, 50, 100]);
  assert.deepEqual(RUNGS.dayStreak, [7]);
});

test('splitHeroes: три главные — сессия, тренировки, жим; остальные под список', () => {
  const l = buildLadders([sess(0)], { now: NOW, benchOneRM: 105, bodyweight: 90, sex: 'm', age: 38 });
  const { heroes, rest } = splitHeroes(l);
  assert.deepEqual(heroes.map((x) => x.id), ['sessionTonnes', 'workouts', 'bench']);
  assert.deepEqual(rest.map((x) => x.id), ['totalTonnes', 'weekStreak', 'prs', 'dayStreak']);
});

test('splitHeroes: без жима третья карточка — недельная серия, в списке три', () => {
  const { heroes, rest } = splitHeroes(buildLadders([sess(0)], { now: NOW }));
  assert.deepEqual(heroes.map((x) => x.id), ['sessionTonnes', 'workouts', 'weekStreak']);
  assert.deepEqual(rest.map((x) => x.id), ['totalTonnes', 'prs', 'dayStreak']);
});

test('currentFill: доля текущего сегмента, потолок лестницы даёт полную полосу', () => {
  const mid = climb([5, 10, 15, 20], 11.8);
  assert.ok(Math.abs(currentFill({ ...mid, rungs: [5, 10, 15, 20], id: 'x', value: 11.8 }) - 0.36) < 1e-9);
  const top = climb([10, 50], 400);
  assert.equal(currentFill({ ...top, rungs: [10, 50], id: 'x', value: 400 }), 1);
  assert.equal(currentFill({ ...climb([10, 50], 0), rungs: [10, 50], id: 'x', value: 0 }), 0);
});
