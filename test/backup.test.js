import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import {
  shouldRemindBackup,
  BACKUP_REMIND_EVERY,
  K_LAST_EXPORT,
  K_LAST_REMIND,
  Backup,
  LOCAL_BACKUP_KEYS,
} from '../js/db/backup.js';
import { DB } from '../js/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Map-backed localStorage so plan keys round-trip under node --test. */
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

const DAY = 24 * 3600 * 1000;
const NOW = 1_800_000_000_000;

const SAMPLE_PLAN = {
  push: [{ name: 'LAUNCH8-PROBE', sets: 4, reps: 6, weight: 42 }],
  pull: [],
  legs: [],
};

beforeEach(async () => {
  ls.clear();
  await DB.clearAll();
});

afterEach(async () => {
  ls.clear();
  await DB.clearAll();
});

describe('shouldRemindBackup — pure reminder contract', () => {
  test('no workouts → never remind (nothing worth saving)', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 0, now: NOW }), false);
    assert.equal(shouldRemindBackup({ now: NOW }), false);
  });

  test('has data, never exported, never reminded → remind', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 5, now: NOW }), true);
  });

  test('fresh export inside the window → quiet', () => {
    assert.equal(
      shouldRemindBackup({ workoutCount: 5, lastExportAt: NOW - 3 * DAY, now: NOW }),
      false
    );
  });

  test('export older than the window → remind again', () => {
    assert.equal(
      shouldRemindBackup({
        workoutCount: 5,
        lastExportAt: NOW - BACKUP_REMIND_EVERY - DAY,
        now: NOW,
      }),
      true
    );
  });

  test('already reminded inside the window → no nagging', () => {
    assert.equal(
      shouldRemindBackup({
        workoutCount: 5,
        lastExportAt: NOW - 30 * DAY,
        lastRemindAt: NOW - 2 * DAY,
        now: NOW,
      }),
      false
    );
  });

  test('window is 2 weeks (≈ раз в 2-3 недели)', () => {
    assert.equal(BACKUP_REMIND_EVERY, 14 * DAY);
  });

  test('boundary: exactly at the window edge → remind', () => {
    assert.equal(
      shouldRemindBackup({ workoutCount: 1, lastExportAt: NOW - BACKUP_REMIND_EVERY, now: NOW }),
      true
    );
  });
});

describe('backup module facade wiring', () => {
  test('reminder settings keys are device-local (ap-* prefix skips sync)', () => {
    assert.ok(K_LAST_EXPORT.startsWith('ap-'));
    assert.ok(K_LAST_REMIND.startsWith('ap-'));
  });

  test('Backup exposes export/import', () => {
    assert.equal(typeof Backup.export, 'function');
    assert.equal(typeof Backup.import, 'function');
  });

  test('DB facade re-exports the same Backup object', async () => {
    assert.equal(DB.Backup, Backup);
  });

  test('allowlist covers the plan keys in workout.store and skips device identity', () => {
    const storeSrc = readFileSync(path.join(ROOT, 'js/workout.store.js'), 'utf8');
    assert.match(storeSrc, /PLAN_KEY_A = 'ap-custom-plan-A'/);
    assert.match(storeSrc, /PLAN_KEY_B = 'ap-custom-plan-B'/);
    assert.match(storeSrc, /WEEK_MODE_KEY = 'ap-week-mode'/);
    assert.match(storeSrc, /CORE_KEY = 'ap-core-checklist'/);
    assert.match(storeSrc, /CUSTOM_WORKOUTS_KEY = 'ap-custom-workouts'/);
    assert.ok(LOCAL_BACKUP_KEYS.includes('ap-custom-plan-A'));
    assert.ok(LOCAL_BACKUP_KEYS.includes('ap-custom-plan-B'));
    assert.ok(LOCAL_BACKUP_KEYS.includes('ap-week-mode'));
    assert.ok(LOCAL_BACKUP_KEYS.includes('ap-core-checklist'));
    assert.ok(LOCAL_BACKUP_KEYS.includes('ap-custom-workouts'));
    assert.ok(LOCAL_BACKUP_KEYS.includes('ap-theme'));
    assert.equal(LOCAL_BACKUP_KEYS.includes('ap-device-id'), false);
    assert.equal(LOCAL_BACKUP_KEYS.includes('ap-active-session'), false);
  });
});

describe('LAUNCH-8 — restore on a wiped profile', () => {
  test('export → wipe → import restores plans, history, settings', async () => {
    const workoutId = await DB.Workouts.save({
      type: 'push',
      tonnage: 1234,
      exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 5, done: true }] }],
    });
    await DB.Settings.set('lang', 'ru');
    await DB.Settings.set('onboarding-complete', true);
    const planId = await DB.PlannedWorkouts.save('AI Push', { title: 'AI Push', day: 'push' });
    localStorage.setItem('ap-custom-plan-A', JSON.stringify(SAMPLE_PLAN));
    localStorage.setItem('ap-week-mode', 'B');
    localStorage.setItem('ap-theme', 'light');
    localStorage.setItem('ap-device-id', 'device-source');

    const json = await Backup.export();
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 1);
    assert.ok(Array.isArray(parsed.workouts));
    assert.ok(Array.isArray(parsed.plans));
    assert.equal(typeof parsed.local, 'object');
    assert.equal(parsed.local['ap-custom-plan-A'], JSON.stringify(SAMPLE_PLAN));
    assert.equal(parsed.local['ap-device-id'], undefined);

    ls.clear();
    await DB.clearAll();
    assert.equal((await DB.Workouts.getAll()).length, 0);
    assert.equal((await DB.PlannedWorkouts.getAll()).length, 0);
    assert.equal(await DB.Settings.get('lang', null), null);
    assert.equal(localStorage.getItem('ap-custom-plan-A'), null);

    localStorage.setItem('ap-device-id', 'device-target');
    await Backup.import(json);

    const workouts = await DB.Workouts.getAll();
    assert.equal(workouts.length, 1);
    assert.equal(workouts[0].id, workoutId);
    assert.equal(workouts[0].type, 'push');
    assert.equal(workouts[0].tonnage, 1234);
    assert.equal(workouts[0].exercises[0].name, 'Bench Press');
    assert.equal(workouts[0].exercises[0].sets[0].weight, 80);

    assert.equal(await DB.Settings.get('lang'), 'ru');
    assert.equal(await DB.Settings.get('onboarding-complete'), true);

    const plans = await DB.PlannedWorkouts.getAll();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].id, planId);
    assert.equal(plans[0].name, 'AI Push');

    assert.deepEqual(JSON.parse(localStorage.getItem('ap-custom-plan-A')), SAMPLE_PLAN);
    assert.equal(localStorage.getItem('ap-week-mode'), 'B');
    assert.equal(localStorage.getItem('ap-theme'), 'light');
    assert.equal(localStorage.getItem('ap-device-id'), 'device-target');
  });

  test('empty profile export is valid and imports onto another empty profile', async () => {
    const json = await Backup.export();
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 1);
    assert.deepEqual(parsed.workouts, []);
    assert.deepEqual(parsed.plans, []);
    assert.deepEqual(parsed.local, {});

    await Backup.import(json);
    assert.equal((await DB.Workouts.getAll()).length, 0);
    assert.equal((await DB.PlannedWorkouts.getAll()).length, 0);
  });

  test('corrupt file throws and leaves the store empty', async () => {
    await assert.rejects(() => Backup.import('not-json'), SyntaxError);
    await assert.rejects(() => Backup.import('null'), /Invalid backup format/);
    await assert.rejects(() => Backup.import('{}'), /Missing workouts array/);
    await assert.rejects(() => Backup.import('{"workouts":"nope"}'), /Missing workouts array/);
    assert.equal((await DB.Workouts.getAll()).length, 0);
  });

  test('old version-1 file without plans/local still restores workouts and settings', async () => {
    const oldFile = JSON.stringify({
      version: 1,
      exportedAt: '2026-07-18T00:00:00.000Z',
      workouts: [
        {
          id: 'legacy-wo',
          type: 'pull',
          tonnage: 500,
          exercises: [{ name: 'Row', sets: [{ weight: 60, reps: 8 }] }],
        },
      ],
      orm: [],
      metrics: [],
      settings: { lang: 'en', 'onboarding-complete': true },
    });
    await Backup.import(oldFile);
    const workouts = await DB.Workouts.getAll();
    assert.equal(workouts.length, 1);
    assert.equal(workouts[0].type, 'pull');
    assert.equal(await DB.Settings.get('lang'), 'en');
    assert.equal((await DB.PlannedWorkouts.getAll()).length, 0);
    assert.equal(localStorage.getItem('ap-custom-plan-A'), null);
  });

  test('hostile local keys cannot overwrite device id', async () => {
    localStorage.setItem('ap-device-id', 'keep-me');
    await Backup.import(
      JSON.stringify({
        version: 1,
        workouts: [],
        local: {
          'ap-device-id': 'stolen',
          'ap-active-session': '{"hijack":true}',
          'ap-custom-plan-A': JSON.stringify(SAMPLE_PLAN),
        },
      })
    );
    assert.equal(localStorage.getItem('ap-device-id'), 'keep-me');
    assert.equal(localStorage.getItem('ap-active-session'), null);
    assert.deepEqual(JSON.parse(localStorage.getItem('ap-custom-plan-A')), SAMPLE_PLAN);
  });
});
