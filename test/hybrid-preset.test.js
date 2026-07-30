// @ts-check
// HYBRID-PRESET — «PPL | Hybrid v1» это оригинал GIO с хирургическими заменами
// объёма, а не новый словарь упражнений. Гард держит именно это: имена и alias
// совпадают с PPL_GIO_PLAN один в один, иначе префилл истории потеряет рабочие
// веса и сессия стартует с 0 кг (кейс 0кг 2026-07-08).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PPL_GIO_PLAN, PPL_HYBRID_PLAN, buildSession, savePlan,
} from '../js/workout.store.js';
import { BLOCK_NAMES_EN } from '../js/shared/chamber-pill.js';

function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(mockStorage);

/** Все упражнения оригинала: name → упражнение (обе недели, все дни). */
function gioVocabulary() {
  const map = new Map();
  for (const week of Object.values(PPL_GIO_PLAN)) {
    for (const day of Object.values(week)) {
      for (const ex of day) map.set(ex.name, ex);
    }
  }
  return map;
}

/** Плоский список упражнений гибрида. */
function hybridExercises() {
  const out = [];
  for (const [weekId, week] of Object.entries(PPL_HYBRID_PLAN)) {
    for (const [dayId, day] of Object.entries(week)) {
      for (const ex of day) out.push({ ex, where: `${weekId}.${dayId}` });
    }
  }
  return out;
}

test('hybrid — структура: weekA/weekB × push/pull/legs, непустые дни', () => {
  for (const weekId of ['weekA', 'weekB']) {
    const week = PPL_HYBRID_PLAN[weekId];
    assert.ok(week, weekId);
    for (const dayId of ['push', 'pull', 'legs']) {
      assert.ok(Array.isArray(week[dayId]) && week[dayId].length > 0, `${weekId}.${dayId}`);
    }
  }
});

test('hybrid — ни одного нового имени: весь словарь взят из PPL | GIO', () => {
  const gio = gioVocabulary();
  for (const { ex, where } of hybridExercises()) {
    assert.ok(gio.has(ex.name), `${where}: «${ex.name}» нет в PPL_GIO_PLAN — префилл истории отвяжется`);
  }
});

test('hybrid — alias совпадает с оригиналом для того же упражнения', () => {
  const gio = gioVocabulary();
  for (const { ex, where } of hybridExercises()) {
    const src = gio.get(ex.name);
    assert.deepEqual(ex.alias ?? null, src.alias ?? null, `${where}: ${ex.name}`);
  }
});

test('hybrid — флаги веса совпадают с оригиналом (isBW / noDb / isUnilateral)', () => {
  const gio = gioVocabulary();
  for (const { ex, where } of hybridExercises()) {
    const src = gio.get(ex.name);
    for (const flag of ['isBW', 'noDb', 'isUnilateral']) {
      assert.equal(!!ex[flag], !!src[flag], `${where}: ${ex.name}.${flag}`);
    }
  }
});

test('hybrid — каждое упражнение несёт известный блок и seed weight 0', () => {
  for (const { ex, where } of hybridExercises()) {
    assert.ok(ex.block && BLOCK_NAMES_EN[ex.block], `${where}: неизвестный блок «${ex.block}» у ${ex.name}`);
    assert.equal(ex.weight, 0, `${where}: ${ex.name}`);
    assert.ok(ex.sets >= 1 && ex.reps >= 1, `${where}: ${ex.name}`);
  }
});

test('hybrid — checklist-упражнения (noDb) всегда isBW: гард завершения их не блокирует', () => {
  for (const { ex, where } of hybridExercises()) {
    if (ex.noDb) assert.ok(ex.isBW, `${where}: ${ex.name}`);
  }
});

test('hybrid — блоки внутри дня идут непрерывно (трекер камер не рвётся)', () => {
  for (const [weekId, week] of Object.entries(PPL_HYBRID_PLAN)) {
    for (const [dayId, day] of Object.entries(week)) {
      const seen = new Set();
      let prev = null;
      for (const ex of day) {
        if (ex.block !== prev) {
          assert.ok(!seen.has(ex.block), `${weekId}.${dayId}: блок «${ex.block}» разорван`);
          seen.add(ex.block);
          prev = ex.block;
        }
      }
      assert.equal(seen.size, 4, `${weekId}.${dayId}: ожидались 4 камеры, получено ${seen.size}`);
    }
  }
});

test('hybrid — нейросиловой блок I: первые два упражнения 5x5 / 4x5', () => {
  for (const [weekId, week] of Object.entries(PPL_HYBRID_PLAN)) {
    for (const [dayId, day] of Object.entries(week)) {
      assert.deepEqual(
        [day[0].sets, day[0].reps, day[1].sets, day[1].reps],
        [5, 5, 4, 5],
        `${weekId}.${dayId}`,
      );
    }
  }
});

test('hybrid — загруженный план подхватывает вес из истории GIO (не сбрасывает в 0)', () => {
  savePlan(JSON.parse(JSON.stringify(PPL_HYBRID_PLAN.weekA)), 'A');
  const history = [{
    type: 'push',
    timestamp: Date.now() - 86400000,
    exercises: [
      { name: 'Bench Press', sets: [{ weight: 90, reps: 8, done: true }] },
      { name: 'Incline Dumbbell Press', sets: [{ weight: 32, reps: 10, done: true }] },
    ],
  }];
  const session = buildSession('push', { workouts: history });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.ok(bench.sets[0].weight >= 90, `bench: ${bench.sets[0].weight}`);
  const incline = session.find((e) => e.name === 'Incline DB Press');
  assert.ok(incline.sets[0].weight >= 32, `incline (via alias): ${incline.sets[0].weight}`);
});

test('hybrid — константа не мутируется при загрузке пресета', () => {
  const copy = JSON.parse(JSON.stringify(PPL_HYBRID_PLAN.weekA));
  copy.push[0].name = 'MUTATED';
  savePlan(copy, 'A');
  assert.notEqual(PPL_HYBRID_PLAN.weekA.push[0].name, 'MUTATED');
});
