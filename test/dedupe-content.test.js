// DATA-2 хвост: «убрать дубли» схлопывала РАЗНЫЕ сессии импорта с одной датой.
// Фикстура синтетическая (обезличена): 22 сессии одного типа с одним timestamp,
// у каждой свои упражнения/подходы и id вида `imp-...` (как у import-etl.py).
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { DB } = await import('../js/db.js');
const { setFlag } = await import('../js/flags.js');

const TS = Date.UTC(2023, 5, 2, 12, 0, 0);
const COLS = 'ABCDEFGHIJKLMNOPQRSTUV'.split(''); // 22 колонки блока

/** 22 разные сессии «июнь 2023»: свой состав и вес в каждой. */
function importFile({ withIds = true } = {}) {
  const workouts = COLS.map((c, i) => ({
    ...(withIds ? { id: `imp-2023-push-20230602-${c}` } : {}),
    type: 'push',
    timestamp: TS,
    duration: 0,
    tonnage: 100 * (i + 1),
    exercises: [
      { name: i % 2 ? 'Bench Press' : 'Overhead Press', sets: [{ weight: 40 + i, reps: 8, done: true }] },
      { name: `Accessory ${i}`, sets: [{ weight: 10 + i, reps: 12, done: true }] },
    ],
    _source: 'England_GYM_2023',
  }));
  return JSON.stringify({ version: 1, workouts, orm: [], metrics: [], settings: {} });
}

before(async () => {
  await DB.clearAll();
});
afterEach(async () => {
  setFlag('dedupe-content', false);
  store.clear();
  await DB.clearAll();
});

test('22 разные сессии с одной датой: флаг OFF — прежнее поведение побитно (схлопывает 21)', async () => {
  setFlag('dedupe-content', false);
  await DB.Backup.import(importFile());
  assert.equal((await DB.Workouts.getAll()).length, 22);
  const removed = await DB.Workouts.deduplicate();
  assert.equal(removed, 21, 'легаси-ключ timestamp+type: 21 разных сессий стёрты');
  assert.equal((await DB.Workouts.getAll()).length, 1);
});

test('22 разные сессии с одной датой: флаг ON — ни одна не удалена', async () => {
  setFlag('dedupe-content', true);
  await DB.Backup.import(importFile());
  const removed = await DB.Workouts.deduplicate();
  assert.equal(removed, 0);
  assert.equal((await DB.Workouts.getAll()).length, 22);
});

test('идемпотентность: повторный импорт того же файла (те же id) не плодит и не теряет', async () => {
  setFlag('dedupe-content', true);
  await DB.Backup.import(importFile());
  await DB.Backup.import(importFile());
  assert.equal((await DB.Workouts.getAll()).length, 22, 'put по тому же id перезаписывает');
  assert.equal(await DB.Workouts.deduplicate(), 0);
  assert.equal((await DB.Workouts.getAll()).length, 22);
});

test('настоящие дубли: файл без id, импортирован дважды — флаг ON схлопывает копии до 22', async () => {
  setFlag('dedupe-content', true);
  await DB.Backup.import(importFile({ withIds: false }));
  await DB.Backup.import(importFile({ withIds: false }));
  assert.equal((await DB.Workouts.getAll()).length, 44, 'новые uuid — 44 строки');
  const removed = await DB.Workouts.deduplicate();
  assert.equal(removed, 22);
  assert.equal((await DB.Workouts.getAll()).length, 22);
});

test('удаление мягкое: у схлопнутой копии остаётся полное содержимое', async () => {
  setFlag('dedupe-content', true);
  await DB.Backup.import(importFile({ withIds: false }));
  await DB.Backup.import(importFile({ withIds: false }));
  const before = (await DB.Workouts.getAll()).map((w) => w.id);
  await DB.Workouts.deduplicate();
  const alive = new Set((await DB.Workouts.getAll()).map((w) => w.id));
  const gone = before.filter((id) => !alive.has(id));
  const raw = await Promise.all(gone.map((id) => DB._getRaw('workouts', id)));
  assert.equal(raw.length, 22);
  assert.ok(raw.every((w) => w._deleted === true));
  assert.ok(raw.every((w) => w.exercises.length === 2 && w.tonnage > 0));
});

test('разный подход при тех же упражнениях и дате — разные сессии', async () => {
  setFlag('dedupe-content', true);
  const mk = (weight) => ({
    type: 'legs',
    timestamp: TS,
    tonnage: 0,
    exercises: [{ name: 'Squat', sets: [{ weight, reps: 5, done: true }] }],
  });
  await DB.Workouts.save(mk(100));
  await DB.Workouts.save(mk(110));
  await DB.Workouts.save(mk(110));
  assert.equal(await DB.Workouts.deduplicate(), 1, 'схлопнулась только пара с одинаковым составом');
});

test('флаг по умолчанию ON (LAB-2): кнопка не стирает разные сессии с одной датой', async () => {
  const { allFlags } = await import('../js/flags.js');
  assert.equal(allFlags()['dedupe-content'], true);
});
