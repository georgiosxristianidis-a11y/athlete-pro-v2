// @ts-check
/**
 * Гард: «удалить все мои данные» обязано удалять их и снаружи IndexedDB.
 *
 * План, Body Metrics и снапшот аварийного восстановления живут в localStorage,
 * поэтому IDB-only очистка оставляла призрак: `ap-active-session` поднимал
 * «удалённую» тренировку на следующем заходе.
 *
 * Обратная сторона, из-за которой блочный `localStorage.clear()` не годится:
 * вместе с данными он сносил самоисключение из аналитики, личность установки
 * и курсор синка. Последний — мина: обнулив его, следующий pull утягивает с
 * сервера всю историю обратно в опустошённый IDB, и удаление отменяет само
 * себя после перезагрузки.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Исходник без комментариев — иначе гард зеленеет на закомментированной строке. */
const code = (rel) =>
  readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => {
    ls.set(k, String(v));
  },
  removeItem: (k) => {
    ls.delete(k);
  },
  clear: () => ls.clear(),
  key: (i) => [...ls.keys()][i] ?? null,
  get length() {
    return ls.size;
  },
});

const { DB, KEEP_ON_WIPE } = await import('../js/db.js');

/** Устройство «пожившее»: данные, настройки и три ключа-долгожителя. */
function seedDevice() {
  ls.clear();
  localStorage.setItem('ap-active-session', '{"type":"push"}');
  localStorage.setItem('ap-bodystats', '[{"date":"2026-08-20","waist":82}]');
  localStorage.setItem('ap-custom-plan', '{"push":[]}');
  localStorage.setItem('ap-theme', 'dark');
  localStorage.setItem('ap-sync-queue', '[{"store":"workouts"}]');
  localStorage.setItem('sb-abcdef-auth-token', '{"access_token":"x"}');
  localStorage.setItem('ap-usage-exclude', '1');
  localStorage.setItem('ap-device-id', 'dev-42');
  localStorage.setItem('ap-sync-pulled-at', '1757000000000');
}

beforeEach(async () => {
  ls.clear();
  await DB.clearAll();
});

afterEach(async () => {
  ls.clear();
  await DB.clearAll();
});

describe('удаление всех данных — контракт localStorage', () => {
  test('clearAll остаётся IDB-only: тестовые сбросы не трогают моки', async () => {
    seedDevice();
    await DB.clearAll();
    assert.equal(localStorage.getItem('ap-active-session'), '{"type":"push"}');
    assert.equal(localStorage.getItem('ap-bodystats'), '[{"date":"2026-08-20","waist":82}]');
  });

  test('deleteAllUserData сносит данные, живущие вне IndexedDB', async () => {
    seedDevice();
    await DB.deleteAllUserData();
    for (const k of [
      'ap-active-session',
      'ap-bodystats',
      'ap-custom-plan',
      'ap-theme',
      'ap-sync-queue',
      'sb-abcdef-auth-token',
    ]) {
      assert.equal(localStorage.getItem(k), null, `ключ ${k} пережил полное удаление`);
    }
  });

  test('самоисключение из аналитики переживает удаление', async () => {
    seedDevice();
    await DB.deleteAllUserData();
    assert.equal(
      localStorage.getItem('ap-usage-exclude'),
      '1',
      'удаление данных молча включило телеметрию обратно'
    );
  });

  test('личность установки переживает удаление', async () => {
    seedDevice();
    await DB.deleteAllUserData();
    assert.equal(localStorage.getItem('ap-device-id'), 'dev-42');
  });

  test('курсор синка переживает удаление — иначе данные вернутся с сервера', async () => {
    seedDevice();
    await DB.deleteAllUserData();
    assert.equal(
      localStorage.getItem('ap-sync-pulled-at'),
      '1757000000000',
      'обнулённый курсор утянет всю историю обратно на следующем pull'
    );
  });

  test('деной-лист ровно тот, что объявлен, — молчаливых исключений нет', async () => {
    assert.deepEqual([...KEEP_ON_WIPE].sort(), [
      'ap-device-id',
      'ap-sync-pulled-at',
      'ap-usage-exclude',
    ]);
    seedDevice();
    await DB.deleteAllUserData();
    const survivors = [...ls.keys()].sort();
    assert.deepEqual(survivors, [...KEEP_ON_WIPE].sort(), 'выжило не то, что объявлено');
  });

  test('пустой localStorage не роняет удаление', async () => {
    ls.clear();
    await DB.deleteAllUserData();
    assert.equal(ls.size, 0);
  });

  test('оба пользовательских пути удаления зовут deleteAllUserData, не clearAll', () => {
    for (const rel of ['js/privacy.view.js', 'js/profile.js']) {
      const src = code(rel);
      assert.match(
        src,
        /DB\.deleteAllUserData\(\)/,
        `${rel} удаляет данные мимо деной-листа — снапшот и план переживут удаление`
      );
      assert.doesNotMatch(
        src,
        /await DB\.clearAll\(\)/,
        `${rel} вернулся к IDB-only очистке: localStorage останется нетронутым`
      );
    }
  });
});
