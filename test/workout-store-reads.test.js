// @ts-check
/**
 * A15-handlers — чтения `js/workout.view/handlers.js` переехали в
 * `js/workout.store.js` (baseline 4 → 0). Гард `import-guard` считает вызовы
 * `DB.*`, но не видит, что при переносе не потерялись ключ, дефолт и порядок
 * чтений в Promise.all — это проверяется здесь: обёртки на реальной базе
 * (fake-indexeddb), call-site-ы handlers.js — по исходнику.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Стор пишет в localStorage на загрузке модуля.
const mem = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
});

const { DB } = await import('../js/db.js');
const { loadWorkoutHistory, loadRestDurationSetting, loadKeepAwakeSetting } = await import(
  '../js/workout.store.js'
);

beforeEach(async () => {
  await DB.clearAll();
});

describe('A15-handlers: обёртки чтения в workout.store', () => {
  test('loadWorkoutHistory: вся история, newest-first, как DB.Workouts.getAll()', async () => {
    assert.deepEqual(await loadWorkoutHistory(), []);
    const now = Date.now();
    await DB.Workouts.save({ type: 'push', timestamp: now - 2000, exercises: [] });
    await DB.Workouts.save({ type: 'pull', timestamp: now, exercises: [] });
    const viaStore = await loadWorkoutHistory();
    assert.deepEqual(viaStore, await DB.Workouts.getAll());
    assert.deepEqual(viaStore.map((w) => w.type), ['pull', 'push']);
  });

  test('loadRestDurationSetting: сырое значение, без разбора и без дефолта 90', async () => {
    assert.equal(await loadRestDurationSetting(), null, 'не задана — null, дефолт у вызывающего');
    await DB.Settings.set('rest-duration', 120);
    assert.equal(await loadRestDurationSetting(), 120);
  });

  test('loadKeepAwakeSetting: дефолт on (BG-1, opt-out), off читается как off', async () => {
    assert.equal(await loadKeepAwakeSetting(), 'on');
    await DB.Settings.set('keep-awake', 'off');
    assert.equal(await loadKeepAwakeSetting(), 'off');
  });
});

describe('A15-handlers: call-site-ы handlers.js', () => {
  const src = read('js/workout.view/handlers.js');
  const store = read('js/workout.store.js');

  test('обёртки остаются однострочными чтениями своего ключа', () => {
    assert.match(store, /export function loadRestDurationSetting\(\)\s*\{\s*return DB\.Settings\.get\('rest-duration'\);\s*\}/);
    assert.match(store, /export function loadKeepAwakeSetting\(\)\s*\{\s*return DB\.Settings\.get\('keep-awake', 'on'\);\s*\}/);
    assert.match(store, /export function loadWorkoutHistory\(\)\s*\{\s*return DB\.Workouts\.getAll\(\);\s*\}/);
  });

  test('handlers.js не импортирует DB и не зовёт его', () => {
    assert.ok(!/import\s*\{\s*DB\s*\}/.test(src), 'import { DB } вернулся в handlers.js');
    assert.ok(!/\bDB\./.test(src), 'прямой DB.* вернулся в handlers.js');
  });

  test('selectType: три чтения в одном Promise.all, порядок и .catch-значения прежние', () => {
    const m = src.match(/Promise\.all\(\[\s*([\s\S]*?)\]\);/);
    assert.ok(m, 'в selectType пропал Promise.all');
    const body = m[1];
    const i1 = body.indexOf('loadWorkoutHistory().catch(() => [])');
    const i2 = body.indexOf('loadRestDurationSetting().catch(() => null)');
    const i3 = body.indexOf("loadKeepAwakeSetting().catch(() => 'on')");
    assert.ok(i1 !== -1 && i2 > i1 && i3 > i2, 'порядок/.catch чтений в selectType изменился: ' + body);
  });

  test('smartCoach: история одним loadWorkoutHistory().catch(() => [])', () => {
    const fn = src.slice(src.indexOf('export async function smartCoach'));
    assert.equal((fn.match(/\bloadWorkoutHistory\(\)/g) || []).length, 1);
    assert.match(fn, /await loadWorkoutHistory\(\)\.catch\(\(\) => \[\]\)/);
  });
});
