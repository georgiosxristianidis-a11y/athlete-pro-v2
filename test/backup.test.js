import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldRemindBackup, BACKUP_REMIND_EVERY, K_LAST_EXPORT, K_LAST_REMIND, Backup } from '../js/db/backup.js';

const DAY = 24 * 3600 * 1000;
const NOW = 1_800_000_000_000;

describe('shouldRemindBackup — pure reminder contract', () => {
  test('no workouts → never remind (nothing worth saving)', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 0, now: NOW }), false);
    assert.equal(shouldRemindBackup({ now: NOW }), false);
  });

  test('has data, never exported, never reminded → remind', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 5, now: NOW }), true);
  });

  test('fresh export inside the window → quiet', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 5, lastExportAt: NOW - 3 * DAY, now: NOW }), false);
  });

  test('export older than the window → remind again', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 5, lastExportAt: NOW - BACKUP_REMIND_EVERY - DAY, now: NOW }), true);
  });

  test('already reminded inside the window → no nagging', () => {
    assert.equal(shouldRemindBackup({
      workoutCount: 5,
      lastExportAt: NOW - 30 * DAY,
      lastRemindAt: NOW - 2 * DAY,
      now: NOW,
    }), false);
  });

  test('window is 2 weeks (≈ раз в 2-3 недели)', () => {
    assert.equal(BACKUP_REMIND_EVERY, 14 * DAY);
  });

  test('boundary: exactly at the window edge → remind', () => {
    assert.equal(shouldRemindBackup({ workoutCount: 1, lastExportAt: NOW - BACKUP_REMIND_EVERY, now: NOW }), true);
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
    const { DB } = await import('../js/db.js');
    assert.equal(DB.Backup, Backup);
  });
});
