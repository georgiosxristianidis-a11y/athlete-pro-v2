// @ts-check
// FIELD-1 — «тренажёр занят»: упражнение пропускается на одну сессию. Пропуск
// не равен провалу: в сохраняемую запись, сводку, тоннаж и префилл следующей
// сессии он не попадает, а снимок persistSession переживает перезагрузку.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

/** Minimal Map-backed localStorage — стор пишет туда на загрузке модуля. */
function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  };
}

mockStorage();

const store = await import('../js/workout.store.js');
const { DB } = await import('../js/db.js');
const { sessionLoad } = await import('../js/intel.engine.js');
const {
  State, persistSession, tryRestoreSession, buildSessionSummary, persistFinalSession,
  latestWorkoutForNames, nextWeightFor, buildSession,
} = store;

beforeEach(async () => {
  mockStorage();
  await DB.clearAll();
});
afterEach(async () => {
  await DB.clearAll();
});

const set = (w, r, done = false) => ({ weight: w, reps: r, done });
const ex = (name, sets, extra = {}) => ({
  name, block: 'heavy', isUnilateral: false, isBW: false, noDb: false, sets, ...extra,
});
const plan3 = () => [
  ex('Bench Press', [set(100, 5, true), set(100, 5, true)]),
  ex('Hip Thrust', [set(120, 8), set(120, 8)]),
  ex('Lateral Raise', [set(10, 12, true)], { block: 'arms' }),
];
const noOneRM = async () => undefined;

async function finish(plan, startedAt) {
  const state = { type: 'push', plan, startedAt, blockTimings: {} };
  const summary = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  await persistFinalSession(state, summary, 600_000);
  return summary;
}

test('skipExercise уводит упражнение в конец со статусом skipped, сеты не трогает', () => {
  assert.equal(typeof store.skipExercise, 'function', 'нет skipExercise в модели сессии');
  const plan = plan3();
  assert.equal(store.skipExercise(plan, 1), true);
  assert.deepEqual(plan.map((e) => e.name), ['Bench Press', 'Lateral Raise', 'Hip Thrust']);
  assert.equal(plan[2].skipped, true);
  assert.equal(plan[2].skipFrom, 1);
  assert.deepEqual(plan[2].sets, [set(120, 8), set(120, 8)]);
  assert.equal(store.skipExercise(plan, 2), false, 'повторный пропуск — не действие');
});

test('unskipExercise возвращает на исходный индекс и снимает статус', () => {
  const plan = plan3();
  store.skipExercise(plan, 0);
  const to = store.unskipExercise(plan, 2);
  assert.equal(to, 0);
  assert.deepEqual(plan.map((e) => e.name), ['Bench Press', 'Hip Thrust', 'Lateral Raise']);
  assert.equal('skipped' in plan[0], false);
  assert.equal('skipFrom' in plan[0], false);
  assert.equal(store.unskipExercise(plan, 1), -1, 'непропущенное не возвращается');
});

test('isPending: пропущенное не всплывает «следующим»', () => {
  const plan = plan3();
  assert.equal(store.isPending(plan[1]), true);
  store.skipExercise(plan, 1);
  assert.equal(plan.some(store.isPending), false, 'остальное закрыто, пропущенное не ждёт');
});

test('статус skipped переживает перезагрузку (persistSession → tryRestoreSession)', () => {
  State.phase = 'active';
  State.type = 'push';
  State.plan = plan3();
  State.startedAt = Date.now();
  State.blockTimings = {};
  store.skipExercise(State.plan, 1);
  persistSession();
  State.plan = [];
  State.phase = 'select';
  assert.ok(tryRestoreSession());
  const hip = State.plan.find((e) => e.name === 'Hip Thrust');
  assert.equal(hip.skipped, true);
  assert.equal(hip.skipFrom, 1);
  assert.equal(State.plan.at(-1).name, 'Hip Thrust');
  State.phase = 'select';
});

test('сводка: пропущенное не входит ни в тоннаж, ни в сеты, ни в блоки', async () => {
  const plan = plan3();
  plan[1].sets[0].done = true; // успел один подход, потом тренажёр заняли
  store.skipExercise(plan, 1);
  const s = await buildSessionSummary({ type: 'push', plan, blockTimings: {} }, 600_000, { oneRMLookup: noOneRM });
  assert.equal(s.totalTonnage, 100 * 5 * 2 + 10 * 12);
  assert.equal(s.setsDone, 3);
  const names = s.blocks.flatMap((b) => b.exercises.map((e) => e.name));
  assert.equal(names.includes('Hip Thrust'), false);
  assert.equal(s.prs.some((p) => p.name === 'Hip Thrust'), false);
});

test('запись: пропуск не пишется, тоннаж = sessionLoad, 1RM не трогается', async () => {
  const plan = plan3();
  plan[1].sets[0].done = true;
  store.skipExercise(plan, 1);
  await finish(plan, Date.now());
  const [row] = await DB.Workouts.getAll();
  assert.deepEqual(row.exercises.map((e) => e.name), ['Bench Press', 'Lateral Raise']);
  assert.equal(sessionLoad(row), 100 * 5 * 2 + 10 * 12);
  assert.equal(await DB.OneRM.get('Hip Thrust'), undefined);
});

test('префилл: вес берётся из последней сессии, где упражнение реально делалось', async () => {
  const day = 86_400_000;
  // Сессия 1 — Hip Thrust сделан 140×8.
  const first = plan3();
  first[1].sets = [set(140, 8, true), set(140, 8, true)];
  await finish(first, Date.now() - 2 * day);
  // Сессия 2 — тренажёр занят, Hip Thrust пропущен с другим весом в сетах.
  const second = plan3();
  second[1].sets = [set(60, 8), set(60, 8)];
  store.skipExercise(second, 1);
  await finish(second, Date.now() - day);

  const workouts = await DB.Workouts.getAll();
  const last = latestWorkoutForNames(workouts, ['Hip Thrust']);
  assert.equal(last.exercises.find((e) => e.name === 'Hip Thrust').sets[0].weight, 140);
  const next = nextWeightFor({ name: 'Hip Thrust', reps: 8 }, workouts);
  assert.ok(next && next.lastWeight === 140, 'префилл обязан идти от 140, не от пропуска');
});

test('секции: пропущенное не в счёте и не держит секцию открытой', async () => {
  const { sectionList, focusInSection } = await import('../js/shared/logger-sections.js');
  const plan = [
    ex('Bench Press', [set(100, 5, true)]),
    ex('Incline Press', [set(60, 8)]),
  ];
  store.skipExercise(plan, 1);
  const [sec] = sectionList(plan);
  assert.deepEqual(sec.eis, [0, 1], 'карточка остаётся в своей секции');
  assert.equal(sec.total, 1);
  assert.equal(sec.doneEx, 1);
  assert.equal(sec.allDone, true);
  assert.equal(focusInSection(sec, plan), -1, 'фокус не уходит на пропущенное');
});

test('проводка: пункт меню, возврат тапом и фасад (иначе тап молча мёртв)', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const handlers = read('js/workout.view/handlers.js');
  const render = read('js/workout.view/render.js');
  const facade = read('js/workout.view.js');
  const integrity = read('js/shared/integrity.js');
  assert.match(handlers, /label: t\('train\.skip_today'\)/);
  assert.match(handlers, /export async function _unskipExercise/);
  assert.match(render, /on\('wo:unskip', \(el\) => W\(\)\._unskipExercise\(/);
  assert.match(render, /skipped \? 'wo:unskip' : 'wo:toggleCard'/);
  assert.match(facade, /^\s+_unskipExercise,$/m);
  assert.match(integrity, /'_unskipExercise'/);
  const locale = read('js/locale.store.js');
  for (const key of ['skip_today', 'skipped', 'skipped_undo', 'skipped_toast']) {
    assert.equal(locale.split(`'train.${key}':`).length - 1, 2, `train.${key} нужен парой EN+RU`);
  }
});

test('пропуск живёт одну сессию: buildSession статус не переносит', () => {
  const fresh = buildSession('push', { workouts: [] });
  assert.ok(fresh.length > 0);
  assert.equal(fresh.some((e) => 'skipped' in e || 'skipFrom' in e), false);
});
