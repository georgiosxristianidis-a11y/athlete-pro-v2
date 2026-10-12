// @ts-check
/* ════════════════════════════════════════════════════════
   db/progression-cache.js — IndexedDB persistence for progression curves cache
   Uses S.SETTINGS ('settings') store to avoid breaking migrations,
   with schema versioning and full offline-first durability.
   ════════════════════════════════════════════════════════ */

import { S, tx, req2p, req2pSafe } from './core.js';

/**
 * Prefix for progression curve records stored in Settings store.
 */
const CACHE_PREFIX = 'ap-progression-cache:';

/**
 * Expected schema version for progression curves cache. Поднимать и при смене
 * правил группировки упражнений (2: NAME-1, склейка имён) — ключ кэша их не видит.
 */
export const PROGRESSION_CACHE_VERSION = 2;

/**
 * Storage facade for progression curves cache.
 */
export const ProgressionCache = {
  /**
   * Retrieves a cached progression curve record by key.
   * Performs schema validation and version checks.
   *
   * @param {string} key
   * @returns {Promise<import('../analytics.progression-curves.js').ProgressionCurveCacheRecord | null>}
   */
  async getProgressionCurvesCache(key) {
    if (!key || typeof key !== 'string') return null;
    try {
      const storedKey = `${CACHE_PREFIX}${key}`;
      const store = await tx(S.SETTINGS);
      const row = await req2p(store.get(storedKey));
      if (!row || !row.value || typeof row.value !== 'object') return null;

      const record = row.value;

      // Version check
      if (record.version !== PROGRESSION_CACHE_VERSION) {
        return null;
      }

      // Integrity checks
      if (
        typeof record.id !== 'string' ||
        typeof record.timestamp !== 'number' ||
        typeof record.workoutCount !== 'number' ||
        !Array.isArray(record.curves)
      ) {
        return null;
      }

      return record;
    } catch (e) {
      console.warn('[ProgressionCache] Failed to read cache record', e);
      return null;
    }
  },

  /**
   * Stores a progression curve cache record in IndexedDB.
   *
   * @param {import('../analytics.progression-curves.js').ProgressionCurveCacheRecord} record
   * @returns {Promise<void>}
   */
  async setProgressionCurvesCache(record) {
    if (!record || typeof record !== 'object' || !record.id) {
      throw new Error('[ProgressionCache] Invalid cache record provided');
    }

    try {
      const key = `${CACHE_PREFIX}${record.id}`;
      const toStore = {
        id: record.id,
        version: record.version || PROGRESSION_CACHE_VERSION,
        timestamp: Number(record.timestamp) || Date.now(),
        workoutCount: Number(record.workoutCount) || 0,
        curves: Array.isArray(record.curves) ? record.curves : [],
      };

      const recordToSave = {
        key,
        value: toStore,
        updatedAt: Date.now(),
      };

      const store = await tx(S.SETTINGS, 'readwrite');
      await req2pSafe(store.put(recordToSave), store.transaction);
    } catch (e) {
      console.warn('[ProgressionCache] Failed to write cache record', e);
    }
  },

  /**
   * Clears all progression curves cache entries permanently from store.
   * @returns {Promise<void>}
   */
  async clearProgressionCurvesCache() {
    try {
      const store = await tx(S.SETTINGS, 'readwrite');
      const allKeys = await req2p(store.getAllKeys ? store.getAllKeys() : store.getAll());
      const keysToDelete = Array.isArray(allKeys)
        ? allKeys
            .map((k) => (typeof k === 'object' && k ? k.key : k))
            .filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX))
        : [];

      for (const k of keysToDelete) {
        await req2p(store.delete(k));
      }
    } catch (e) {
      console.warn('[ProgressionCache] Failed to clear cache', e);
    }
  },
};

export const getProgressionCurvesCache = ProgressionCache.getProgressionCurvesCache;
export const setProgressionCurvesCache = ProgressionCache.setProgressionCurvesCache;
export const clearProgressionCurvesCache = ProgressionCache.clearProgressionCurvesCache;
