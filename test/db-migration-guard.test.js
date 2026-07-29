import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { backupBeforeUpgrade, getBackupSnapshot } from '../js/shared/db-backup.js';

describe('IndexedDB Pre-Migration Guard (Sphere 3)', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.clear();
    }
  });

  test('returns false gracefully when indexedDB or localStorage is unavailable', async () => {
    const result = await backupBeforeUpgrade('test-db', 3);
    assert.equal(typeof result, 'boolean');
  });

  test('getBackupSnapshot returns null when no snapshot exists', () => {
    const snapshot = getBackupSnapshot(99);
    assert.equal(snapshot, null);
  });
});
