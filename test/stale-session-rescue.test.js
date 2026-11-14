// @ts-check
/**
 * UX-1b — протухшая сессия больше не стирается молча.
 *
 * До: tryRestoreSession() видел снимок старше 4 ч (по savedAt — последнему
 * касанию) и удалял его вместе с закрытыми подходами; сторож 12 ч звал
 * cancelSession() — диалог «Отменить тренировку?» поверх любого confirm.
 * После: закрытые подходы уходят в журнал тем же путём, что «Завершить»
 * (buildSessionSummary + persistFinalSession), 1RM пишется только после
 * того, как окно «Вернуть» закрылось без отмены.
 *
 * bootTrain() повторяет store-сторону Workout.load(): спасение, потом restore.
 * Функции спасения живут в stale-session.store.js (вне бут-графа); на коде до
 * UX-1b модуля нет — тест краснеет на импорте.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

function mockStorage() {
  const m = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  });
}

mockStorage();

/** @type {any} */
const store = await import('../js/workout.store.js');
const rescueMod = await import('../js/stale-session.store.js');
const { DB } = await import('../js/db.js');
const { State, SESSION_KEY } = store;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = 3600000;
const noOneRM = async () => undefined;

beforeEach(async () => {
  mockStorage();
  await DB.clearAll();
  State.phase = 'select';
  State.plan = [];
  State.startedAt = 0;
  State.blockTimings = {};
});

const set = (weight, reps, done = true) => ({ weight, reps, done });

/** Три упражнения, 5 закрытых подходов, один незакрытый. */
const plan = () => [
  { name: 'Bench Press', block: 'power', sets: [set(80, 8), set(80, 8), set(80, 6)] },
  { name: 'Incline DB Press', block: 'shape', isUnilateral: true, sets: [set(24, 10), set(24, 10, false)] },
  { name: 'Lateral Raise', block: 'shape', sets: [set(10, 15)] },
];

/** @param {{ startedAgo?: number, savedAgo?: number, plan?: any[] }} [o] */
function seedSnapshot(o = {}) {
  const now = Date.now();
  const snap = {
    type: 'push',
    plan: o.plan ?? plan(),
    startedAt: now - (o.startedAgo ?? 6 * H),
    blockTimings: {},
    savedAt: now - (o.savedAgo ?? 5 * H),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
  return snap;
}

async function bootTrain() {
  const rescue = await rescueMod.rescueStaleSession?.({ oneRMLookup: noOneRM });
  const restored = store.tryRestoreSession();
  return { rescue, restored };
}

test('до/после: снимок −5 ч с 5 закрытыми подходами → запись в журнале', async () => {
  const snap = seedSnapshot();
  const { rescue, restored } = await bootTrain();

  const rows = await DB.Workouts.getAll();
  assert.equal(rows.length, 1, 'протухшая сессия стёрта молча — записи нет');
  const [row] = rows;
  assert.equal(row.type, 'push');
  assert.equal(row.timestamp, snap.startedAt, 'timestamp = startedAt');
  assert.equal(row.duration, snap.savedAt - snap.startedAt, 'длительность = savedAt − startedAt');
  // 80×8 + 80×8 + 80×6 + 24×10×2 + 10×15
  assert.equal(row.tonnage, 640 + 640 + 480 + 480 + 150);
  assert.deepEqual(row.exercises.map((e) => e.name), ['Bench Press', 'Incline DB Press', 'Lateral Raise']);

  assert.equal(rescue.sets, 5, 'в тост уходит число закрытых подходов');
  assert.equal(rescue.startedAt, snap.startedAt);
  assert.equal(restored, null, 'протухшая сессия не воскресает активной');
  assert.notEqual(State.phase, 'active');
  assert.equal(localStorage.getItem(SESSION_KEY), null, 'снимок снят — второй загрузкой не задвоится');

  const again = await bootTrain();
  assert.equal(again.rescue, null);
  assert.equal((await DB.Workouts.getAll()).length, 1);
});

test('1RM пишется только после commit (окно «Вернуть» закрылось)', async () => {
  seedSnapshot();
  const { rescue } = await bootTrain();
  assert.equal(await DB.OneRM.get('Bench Press'), undefined, '1RM необратим — до конца окна его не трогаем');
  assert.equal(await rescue.commit(), true);
  const orm = await DB.OneRM.get('Bench Press');
  assert.ok(orm && orm.value > 80);
  assert.equal(await rescue.undo(), false, 'после commit «Вернуть» уже ничего не делает');
  assert.equal((await DB.Workouts.getAll()).length, 1);
});

test('«Вернуть» → записи нет, и 1RM не пишется', async () => {
  seedSnapshot();
  const { rescue } = await bootTrain();
  assert.equal((await DB.Workouts.getAll()).length, 1);
  assert.equal(await rescue.undo(), true);
  assert.equal((await DB.Workouts.getAll()).length, 0, '«Вернуть» удаляет запись');
  assert.equal(await rescue.commit(), false, 'таймер окна после отмены — пустой');
  assert.equal(await DB.OneRM.get('Bench Press'), undefined);
});

test('ноль закрытых подходов → записи нет, снимок сброшен молча', async () => {
  seedSnapshot({
    plan: [
      { name: 'Bench Press', block: 'power', sets: [set(80, 8, false), set(80, 8, false)] },
      // Пропуск без подходов и Camera 4 (noDb) в запись не идут — пустая строка журнала хуже, чем ничего.
      { name: 'Squat', block: 'power', skipped: true, sets: [set(100, 5, false)] },
      { name: 'Plank', block: 'core', noDb: true, sets: [set(0, 60)] },
    ],
  });
  const { rescue, restored } = await bootTrain();
  assert.equal(rescue ?? null, null);
  assert.equal(restored, null);
  assert.equal((await DB.Workouts.getAll()).length, 0);
  assert.equal(localStorage.getItem(SESSION_KEY), null);
});

test('свежий снимок (−1 ч) не спасается, а восстанавливается как раньше', async () => {
  seedSnapshot({ startedAgo: 2 * H, savedAgo: 1 * H });
  const { rescue, restored } = await bootTrain();
  assert.equal(rescue ?? null, null);
  assert.ok(restored);
  assert.equal(State.phase, 'active');
  assert.equal((await DB.Workouts.getAll()).length, 0);
});

test('сбой записи: снимок возвращается, чтобы следующая загрузка повторила', async () => {
  seedSnapshot();
  const save = DB.Workouts.save;
  DB.Workouts.save = async () => {
    throw new Error('idb down');
  };
  try {
    await assert.rejects(() => rescueMod.rescueStaleSession({ oneRMLookup: noOneRM }));
  } finally {
    DB.Workouts.save = save;
  }
  assert.ok(localStorage.getItem(SESSION_KEY), 'снимок не потерян');
  assert.equal(store.tryRestoreSession(), null, 'протухший снимок restore не берёт и не стирает');
  assert.ok(localStorage.getItem(SESSION_KEY));
  const { rescue } = await bootTrain();
  assert.equal(rescue.sets, 5);
  assert.equal((await DB.Workouts.getAll()).length, 1);
});

test('сторож 12 ч: активная сессия уходит в журнал без диалога и один раз', async () => {
  const snap = seedSnapshot({ startedAgo: 13 * H, savedAgo: 11 * H });
  State.phase = 'active';
  State.type = 'push';
  State.plan = snap.plan;
  State.startedAt = snap.startedAt;
  State.blockTimings = {};

  const first = rescueMod.rescueActiveSession?.({ oneRMLookup: noOneRM });
  assert.notEqual(State.phase, 'active', 'фаза снимается синхронно — второй тик сторожа не задвоит');
  const second = rescueMod.rescueActiveSession?.({ oneRMLookup: noOneRM });
  const [r1, r2] = await Promise.all([first, second]);

  assert.equal(r1.sets, 5);
  assert.equal(r2, null);
  const rows = await DB.Workouts.getAll();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].duration, snap.savedAt - snap.startedAt, 'конец — последнее касание, не момент сторожа');
  assert.equal(localStorage.getItem(SESSION_KEY), null);
  assert.deepEqual(State.plan, []);
});

test('сторож в workout.view.js больше не зовёт cancelSession()', () => {
  const src = fs
    .readFileSync(path.join(ROOT, 'js', 'workout.view.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const fn = src.match(/function _startStaleCleanup\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, '_startStaleCleanup пропал');
  assert.doesNotMatch(fn[0], /cancelSession\s*\(/, 'диалог отмены поверх чужого confirm');
  assert.match(fn[0], /rescueOverdueSession\s*\(/);
});
