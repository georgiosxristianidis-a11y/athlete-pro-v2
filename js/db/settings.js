// @ts-check
/* ════════════════════════════════════════════════════════
   db/settings.js — key-value settings store
   ════════════════════════════════════════════════════════ */

import { S, tx, req2p, req2pSafe, getDeviceId, _triggerSync, getAll } from './core.js';

export const Settings = {
  /**
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    const record = { key, value, updatedAt: Date.now(), deviceId: getDeviceId() };
    await tx(S.SETTINGS, 'readwrite').then((s) => req2pSafe(s.put(record), s.transaction));

    // Don't sync internal/temporary settings
    if (!key.startsWith('privacy.audit') && !key.startsWith('ap-')) {
      _triggerSync(S.SETTINGS, record);
    }
  },

  /**
   * @param {string} key
   * @param {*} [fallback]
   * @returns {Promise<*>}
   */
  get(key, fallback = null) {
    return tx(S.SETTINGS).then((s) => req2p(s.get(key)).then((r) => (r ? r.value : fallback)));
  },

  /**
   * @returns {Promise<Object<string, *>>}
   */
  getAll() {
    return getAll(S.SETTINGS).then((list) => {
      const map = {};
      list.forEach((r) => {
        map[r.key] = r.value;
      });
      return map;
    });
  },

  clear() {
    return tx(S.SETTINGS, 'readwrite').then((s) => req2p(s.clear()));
  },
};
