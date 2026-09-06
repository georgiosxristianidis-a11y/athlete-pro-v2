/**
 * Guard: user-facing "delete all data" must wipe localStorage too.
 * Plans, Body Metrics, and ap-active-session live outside IndexedDB.
 * An IDB-only clearAll + reload restores a ghost workout from boot.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import { DB } from '../js/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => {
    ls.set(k, String(v));
  },
  removeItem: (k) => {
    ls.delete(k);
  },
  clear: () => ls.clear(),
};

beforeEach(async () => {
  ls.clear();
  await DB.clearAll();
});

afterEach(async () => {
  ls.clear();
  await DB.clearAll();
});

describe('clearAll — localStorage contract', () => {
  test('default stays IDB-only so test harnesses keep their mocks', async () => {
    localStorage.setItem('ap-active-session', '{"type":"push"}');
    localStorage.setItem('ap-bodystats', '[{"date":"2026-08-20","waist":82}]');
    await DB.clearAll();
    assert.equal(localStorage.getItem('ap-active-session'), '{"type":"push"}');
    assert.equal(localStorage.getItem('ap-bodystats'), '[{"date":"2026-08-20","waist":82}]');
  });

  test('{ local: true } drops session, plan, and body stats', async () => {
    localStorage.setItem('ap-active-session', '{"type":"push"}');
    localStorage.setItem('ap-custom-plan-A', '{"push":[]}');
    localStorage.setItem('ap-bodystats', '[{"date":"2026-08-20","waist":82}]');
    await DB.Workouts.save({
      type: 'push',
      tonnage: 100,
      exercises: [{ name: 'Bench', sets: [] }],
    });
    await DB.clearAll({ local: true });
    assert.equal((await DB.Workouts.getAll()).length, 0);
    assert.equal(localStorage.getItem('ap-active-session'), null);
    assert.equal(localStorage.getItem('ap-custom-plan-A'), null);
    assert.equal(localStorage.getItem('ap-bodystats'), null);
  });

  test('Danger Zone and Privacy delete pass { local: true }', () => {
    assert.match(read('js/profile.js'), /DB\.clearAll\(\s*\{\s*local:\s*true\s*\}\s*\)/);
    assert.match(read('js/privacy.view.js'), /DB\.clearAll\(\s*\{\s*local:\s*true\s*\}\s*\)/);
  });
});
