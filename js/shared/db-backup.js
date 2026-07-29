// @ts-check
'use strict';

const BACKUP_KEY_PREFIX = 'ap-idb-backup-v';

/**
 * Creates a JSON snapshot of key stores in IndexedDB before a schema upgrade.
 * @param {string} dbName 
 * @param {number} currentVersion 
 * @returns {Promise<boolean>}
 */
export async function backupBeforeUpgrade(dbName, currentVersion) {
  if (typeof indexedDB === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  try {
    const existingDB = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const storeNames = Array.from(existingDB.objectStoreNames);
    if (storeNames.length === 0) {
      existingDB.close();
      return false;
    }

    const snapshot = {};
    const tx = existingDB.transaction(storeNames, 'readonly');

    for (const storeName of storeNames) {
      if (['workouts', 'oneRM', 'bodyMetrics', 'settings'].includes(storeName)) {
        snapshot[storeName] = await new Promise((resolve) => {
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      }
    }

    existingDB.close();

    const backupPayload = {
      timestamp: Date.now(),
      version: currentVersion,
      stores: snapshot
    };

    localStorage.setItem(`${BACKUP_KEY_PREFIX}${currentVersion}`, JSON.stringify(backupPayload));
    return true;
  } catch (err) {
    console.warn('[db-backup] Pre-upgrade snapshot skipped or failed:', err);
    return false;
  }
}

/**
 * Retrieves the latest pre-upgrade snapshot from localStorage.
 * @param {number} [version]
 * @returns {Object|null}
 */
export function getBackupSnapshot(version) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const key = version ? `${BACKUP_KEY_PREFIX}${version}` : null;
    if (key) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    for (let i = 10; i >= 1; i--) {
      const raw = localStorage.getItem(`${BACKUP_KEY_PREFIX}${i}`);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    return null;
  }
  return null;
}
