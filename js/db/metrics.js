// @ts-check
/* ════════════════════════════════════════════════════════
   db/metrics.js — BODY METRICS  (weight/height/BMI, PII encrypted)
   ════════════════════════════════════════════════════════ */

import { encryptAsync, decryptAsync } from '../shared/cryptoClient.js';
import { S, tx, req2p, req2pSafe, withMeta, _triggerSync, getAll } from './core.js';

export const Metrics = {
  /**
   * Calculate BMI.
   * @param {number} weight
   * @param {number} heightCm
   * @returns {number}
   */
  bmi(weight, heightCm) {
    const h = heightCm / 100;
    return Math.round((weight / (h * h)) * 10) / 10;
  },

  /**
   * Save a metrics entry.
   * @param {number} weight
   * @param {number} heightCm
   * @returns {Promise<void>}
   */
  async save(weight, heightCm) {
    const rawData = {
      weight,
      height: heightCm,
      bmi: this.bmi(weight, heightCm)
    };

    // Encrypt sensitive PII
    const cryptoData = await encryptAsync(rawData);

    const entry = withMeta({
      _encrypted: cryptoData.encrypted,
      _iv: cryptoData.iv,
      timestamp: Date.now(),
    });
    return tx(S.METRICS, 'readwrite').then((s) => {
      return req2pSafe(s.add(entry), s.transaction).then(() => {
        // Don't sync PII that's only base64-encoded (insecure-context fallback) —
        // it would land in the cloud unencrypted. Keep it device-local.
        if (!cryptoData.plain) _triggerSync(S.METRICS, entry);
      });
    });
  },

  /**
   * Get latest entry.
   * @returns {Promise<MetricsRecord|undefined>}
   */
  async latest() {
    const list = await getAll(S.METRICS);
    if (!list.length) return null;
    const latestRaw = list.sort((a, b) => b.timestamp - a.timestamp)[0];

    if (latestRaw._encrypted) {
      try {
        const decrypted = await decryptAsync(latestRaw._encrypted, latestRaw._iv);
        return { ...decrypted, id: latestRaw.id, timestamp: latestRaw.timestamp };
      } catch(e) {
        console.warn('[DB] Ignoring corrupted metric', latestRaw.id);
        return null;
      }
    }
    return latestRaw;
  },
  /**
   * Get all entries sorted newest first (for chart).
   * @returns {Promise<MetricsRecord[]>}
   */
  async getAll() {
    const list = await getAll(S.METRICS);
    const decryptedList = await Promise.all(list.map(async (r) => {
      if (r._encrypted) {
        try {
          const dec = await decryptAsync(r._encrypted, r._iv);
          return { ...dec, id: r.id, timestamp: r.timestamp };
        } catch(e) {
          return null;
        }
      }
      return r;
    }));
    return decryptedList.filter(x => x !== null).sort((a, b) => b.timestamp - a.timestamp);
  },

  /** Clear all. */
  clear() {
    return tx(S.METRICS, 'readwrite').then((s) => req2p(s.clear()));
  },
};
