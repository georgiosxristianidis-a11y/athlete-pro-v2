// @ts-check
// UX-1a (аудит механики 14.11, находка №1) — «Пропустить сегодня» на упражнении
// с уже закрытыми подходами не имеет права выкинуть их из записи: жим 2×60×8
// закрыт и пропущен → в сводке и в IDB жима не было, тоннаж 400 вместо 1360.
// Правило: запись и тоннаж смотрят на закрытые подходы, а не на флаг `skipped`.
// Пропуск БЕЗ закрытых подходов по-прежнему в запись не идёт (FIELD-1).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

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
  buildSessionSummary, persistFinalSession, skipExercise, latestWorkoutForNames, nextWeightFor,
} = store;

beforeEach(async () => {
  mockStorage();
  await DB.clearAll();
});
afterEach(async () => {
  await DB.clearAll();
});

const DAY = 86_400_000;
const set = (w, r, done = false) => ({ weight: w, reps: r, done });
const ex = (name, sets, extra = {}) => ({
  name, block: 'heavy', isUnilateral: false, isBW: false, noDb: false, sets, ...extra,
});
const noOneRM = async () => undefined;

/** Жим: два подхода 60×8 закрыты, третий нет. Разведение: один 50×8 = 400. */
const benchPlan = (benchSets) => [
  ex('Bench Press', benchSets),
  ex('Hip Thrust', [set(120, 8), set(120, 8)]),
  ex('Lateral Raise', [set(50, 8, true)], { block: 'arms' }),
];
const closedThenSkipped = () => {
  const plan = benchPlan([set(60, 8, true), set(60, 8, true), set(60, 8)]);
  skipExercise(plan, 0);
  return plan;
};

async function finish(plan, startedAt) {
  const state = { type: 'push', plan, startedAt, blockTimings: {} };
  const summary = await buildSessionSummary(state, 600_000, { oneRMLookup: noOneRM });
  await persistFinalSession(state, summary, 600_000);
  return summary;
}

const byTime = (rows) => [...rows].sort((a, b) => a.timestamp - b.timestamp);

test('сводка: 2 закрытых подхода + пропуск — жим в отчёте, тоннаж 1360, не 400', async () => {
  const s = await buildSessionSummary(
    { type: 'push', plan: closedThenSkipped(), blockTimings: {} },
    600_000,
    { oneRMLookup: noOneRM },
  );
  assert.equal(s.totalTonnage, 1360, 'закрытые подходы пропущенного входят в тоннаж');
  assert.equal(s.shownTonnage, 1360);
  assert.equal(s.setsDone, 3);
  assert.equal(s.totalReps, 24);
  const rows = s.blocks.flatMap((b) => b.exercises);
  const bench = rows.find((e) => e.name === 'Bench Press');
  assert.ok(bench, 'жим обязан быть в сводке');
  assert.equal(bench.doneSets, 2);
  assert.equal(bench.totalSets, 3);
  assert.equal(bench.weightStr, '60 kg');
  assert.equal(s.prs.some((p) => p.name === 'Bench Press'), true, 'рекорд с закрытого подхода считается');
});

test('запись: три сессии, в последней жим закрыт и пропущен — подходы в IDB, тоннаж и 1RM на месте', async () => {
  const now = Date.now();
  // Сессия 1 — жим сделан целиком 55×8.
  await finish(benchPlan([set(55, 8, true), set(55, 8, true), set(55, 8, true)]), now - 3 * DAY);
  // Сессия 2 — жим пропущен нетронутым (тренажёр занят сразу).
  const untouched = benchPlan([set(57.5, 8), set(57.5, 8), set(57.5, 8)]);
  skipExercise(untouched, 0);
  await finish(untouched, now - 2 * DAY);
  // Сессия 3 — два подхода 60×8 закрыты, потом пропуск.
  const summary = await finish(closedThenSkipped(), now - DAY);

  const rows = byTime(await DB.Workouts.getAll());
  assert.equal(rows.length, 3);
  const [first, second, third] = rows;

  assert.deepEqual(third.exercises.map((e) => e.name).sort(), ['Bench Press', 'Hip Thrust', 'Lateral Raise']);
  const bench = third.exercises.find((e) => e.name === 'Bench Press');
  assert.deepEqual(
    bench.sets.filter((s) => s.done).map((s) => [s.weight, s.reps]),
    [[60, 8], [60, 8]],
    'закрытые подходы лежат в записи как были',
  );
  assert.equal(third.tonnage, 1360);
  assert.equal(third.tonnage, summary.totalTonnage, 'сводка и запись — одно число');
  assert.equal(sessionLoad(third), 1360);
  assert.equal('skipped' in bench, false, 'служебный флаг в историю не течёт');

  // FIELD-1 не сломан: нетронутый пропуск в запись не попал.
  assert.deepEqual(second.exercises.map((e) => e.name), ['Hip Thrust', 'Lateral Raise']);
  assert.equal(second.tonnage, 400);
  assert.equal(first.exercises.some((e) => e.name === 'Bench Press'), true);

  const orm = await DB.OneRM.get('Bench Press');
  assert.ok(orm, '1RM жима есть');
  assert.equal(orm.value, Math.round(60 * (1 + 8 / 30)), '1RM обновлён закрытым подходом последней сессии');
});

test('префилл: читатель истории берёт вес из сессии с закрытым и пропущенным жимом', async () => {
  const now = Date.now();
  await finish(benchPlan([set(55, 8, true), set(55, 8, true), set(55, 8, true)]), now - 3 * DAY);
  const untouched = benchPlan([set(57.5, 8), set(57.5, 8), set(57.5, 8)]);
  skipExercise(untouched, 0);
  await finish(untouched, now - 2 * DAY);
  await finish(closedThenSkipped(), now - DAY);

  const workouts = await DB.Workouts.getAll();
  const last = latestWorkoutForNames(workouts, ['Bench Press']);
  assert.ok(last, 'жим найден в истории');
  assert.equal(
    last.exercises.find((e) => e.name === 'Bench Press').sets[0].weight,
    60,
    'последняя сессия с жимом — та, где он закрыт и пропущен, не позавчерашняя',
  );
  const next = nextWeightFor({ name: 'Bench Press', reps: 8 }, workouts);
  assert.ok(next && next.lastWeight === 60, 'префилл идёт от 60, а не от 55');
});

test('пропуск без закрытых подходов по-прежнему нигде не учтён', async () => {
  const plan = benchPlan([set(60, 8), set(60, 8), set(60, 8)]);
  skipExercise(plan, 0);
  const s = await finish(plan, Date.now());
  assert.equal(s.totalTonnage, 400);
  assert.equal(s.setsDone, 1);
  assert.equal(s.blocks.flatMap((b) => b.exercises).some((e) => e.name === 'Bench Press'), false);
  const [row] = await DB.Workouts.getAll();
  assert.deepEqual(row.exercises.map((e) => e.name), ['Hip Thrust', 'Lateral Raise']);
  assert.equal(await DB.OneRM.get('Bench Press'), undefined);
});
