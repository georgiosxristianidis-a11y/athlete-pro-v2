// @ts-check
// PLAN-1 — редкие упражнения push-дня (решение Gio 24.10, вариант A): в пресете
// PPL | GIO обе недели несут Cable Curl и Machine Chest Press с `rare: true`.
// Сессия собирает их уже пропущенными в хвосте (состояние FIELD-1): в обычный
// день ноль тапов, в запись и статистику не попадают; тап по шапке возвращает
// упражнение на место из плана. Сохранённые планы не переписываются.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const {
  PPL_GIO_PLAN, PPL_HYBRID_PLAN, buildSession, savePlan, setWeekMode, isPending, unskipExercise,
} = await import('../js/workout.store.js');
const { getTodayPreview, getNextSessionRecs } = await import('../js/dashboard.store.js');

const RARE = ['Cable Curl', 'Machine Chest Press'];

beforeEach(() => {
  localStorage.clear();
  setWeekMode('A');
});

test('PPL | GIO: обе недели несут оба редких упражнения в push', () => {
  for (const week of ['weekA', 'weekB']) {
    const rare = PPL_GIO_PLAN[week].push.filter((e) => e.rare).map((e) => e.name);
    assert.deepEqual(rare, RARE, week);
  }
});

test('редкие стоят только в push PPL | GIO; Hybrid не тронут', () => {
  for (const week of ['weekA', 'weekB']) {
    for (const day of ['pull', 'legs']) {
      assert.equal(PPL_GIO_PLAN[week][day].some((e) => e.rare), false, `${week}.${day}`);
    }
    for (const day of ['push', 'pull', 'legs']) {
      assert.equal(PPL_HYBRID_PLAN[week][day].some((e) => e.rare), false, `hybrid ${week}.${day}`);
    }
  }
});

test('имена редких есть в библиотеке упражнений', () => {
  const lib = JSON.parse(fs.readFileSync(new URL('../exercises-library.json', import.meta.url), 'utf8'));
  const names = new Set(lib.exercises.map((e) => e.name));
  for (const n of RARE) assert.ok(names.has(n), n);
});

test('buildSession: редкие в хвосте, уже пропущены, остальные ждут подходов', () => {
  for (const week of /** @type {const} */ (['A', 'B'])) {
    setWeekMode(week);
    const session = buildSession('push', { workouts: [] });
    const tail = session.slice(-RARE.length);
    assert.deepEqual(tail.map((e) => e.name), RARE, week);
    for (const ex of tail) {
      assert.equal(ex.skipped, true);
      assert.equal(isPending(ex), false);
    }
    assert.equal(session.slice(0, -RARE.length).some((e) => e.skipped), false);
  }
});

test('возврат редкого: встаёт за последним обычным упражнением плана, до кора', () => {
  const session = buildSession('push', { workouts: [] });
  const ei = session.findIndex((e) => e.name === 'Cable Curl');
  const to = unskipExercise(session, ei);
  assert.equal(session[to].name, 'Cable Curl');
  assert.equal(session[to - 1].name, 'Preacher Curls');
  assert.equal(session[to + 1].name, 'Hanging Leg Raises');
  assert.equal(isPending(session[to]), true);
});

test('сохранённый план без rare собирается как раньше — никто не пропущен', () => {
  const plan = JSON.parse(JSON.stringify(PPL_GIO_PLAN.weekA));
  plan.push = plan.push.filter((e) => !e.rare);
  savePlan(plan, 'A');
  const session = buildSession('push', { workouts: [] });
  assert.equal(session.length, plan.push.length);
  assert.equal(session.some((e) => e.skipped), false);
});

test('Home: редкие не в счёте и не в рекомендациях', () => {
  const ts = Date.now() - 3 * 864e5;
  const workouts = [{
    type: 'push', timestamp: ts,
    exercises: [{ name: 'Machine Chest Press', sets: [{ weight: 60, reps: 12, done: true }] }],
  }];
  const preview = getTodayPreview(workouts, 'push', PPL_GIO_PLAN.weekA);
  assert.equal(preview.total, PPL_GIO_PLAN.weekA.push.length - RARE.length);
  assert.equal(preview.items.some((x) => RARE.includes(x.name)), false);
  const recs = getNextSessionRecs(workouts, 'push', PPL_GIO_PLAN.weekA);
  assert.equal(recs.some((x) => RARE.includes(x.name)), false);
});
