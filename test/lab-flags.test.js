// LAB-1 — Лаборатория в Профиле: тумблеры флагов вместо консоли DevTools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { flag, setLabFlag, isOverridden, LAB_FLAGS, allFlags } = await import('../js/flags.js');

test('LAB_FLAGS — только известные флаги, без провалившихся в поле drum-*', () => {
  const known = Object.keys(allFlags());
  for (const name of LAB_FLAGS) assert.ok(known.includes(name), `${name} нет в DEFAULTS`);
  assert.ok(!LAB_FLAGS.some((n) => n.startsWith('drum-')), 'drum-* обнуляли вес в поле');
});

test('тумблер: значение, равное дефолту, снимает override', () => {
  store.clear();
  const name = 'sw-cache-first'; // дефолт OFF
  setLabFlag(name, true);
  assert.equal(flag(name), true);
  assert.equal(isOverridden(name), true);
  setLabFlag(name, false);
  assert.equal(flag(name), false);
  assert.equal(isOverridden(name), false, 'выключение обратно к дефолту не должно оставлять "0"');
});

test('тумблер: выключенный ON-флаг пишет "0", включение обратно его снимает', () => {
  store.clear();
  const name = 'logger-sections'; // дефолт ON
  setLabFlag(name, false);
  assert.equal(store.get('ap-flag-' + name), '0');
  setLabFlag(name, true);
  assert.equal(isOverridden(name), false);
});

test('у каждого флага Лаборатории есть подписи на обоих языках', () => {
  const src = fs.readFileSync(new URL('../js/locale.store.js', import.meta.url), 'utf8');
  for (const name of LAB_FLAGS) {
    for (const key of [`lab.${name}`, `lab.${name}_sub`]) {
      const hits = src.split(`'${key}':`).length - 1;
      assert.equal(hits, 2, `${key}: ждём en и ru, нашли ${hits}`);
    }
  }
});

test('обработчик пропускает только белый список имён', () => {
  const src = fs.readFileSync(new URL('../js/profile.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!LAB_FLAGS\.includes\(name\)\) return;/);
});
