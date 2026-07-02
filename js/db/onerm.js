// @ts-check
/* ════════════════════════════════════════════════════════
   db/onerm.js — ONE-REP MAX  (Epley: 1RM = w × (1 + r/30))
   ════════════════════════════════════════════════════════ */

import { S, tx, req2p, req2pSafe, withMeta, _triggerSync, getAll } from './core.js';

export const OneRM = {
  /**
   * Epley formula: estimated 1RM from working weight and reps.
   * @param {number} weight
   * @param {number} reps
   * @returns {number}
   */
  epley(weight, reps) {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  },

  /**
   * Update 1RM for an exercise if new value is higher.
   * @param {string} name
   * @param {number} weight
   * @param {number} reps
   * @returns {Promise<void>}
   */
  update(exerciseName, weight, reps) {
    const value = this.epley(weight, reps);
    return tx(S.ORM, 'readwrite').then((s) => {
      return req2p(s.get(exerciseName)).then((existing) => {
        if (!existing || value > existing.value) {
          const record = withMeta({ id: exerciseName, value, timestamp: Date.now() });
          return req2pSafe(s.put(record), s.transaction).then(() => {
            _triggerSync(S.ORM, record);
          });
        }
      });
    });
  },

  /**
   * Get 1RM for one exercise.
   * @param {string} name
   * @returns {Promise<OneRMRecord|undefined>}
   */
  get(exerciseName) {
    return tx(S.ORM).then((s) => req2p(s.get(exerciseName)));
  },

  /**
   * Get all 1RMs.
   * @returns {Promise<OneRMRecord[]>}
   */
  getAll() {
    return getAll(S.ORM);
  },

  /** Clear all. */
  clear() {
    return tx(S.ORM, 'readwrite').then((s) => req2p(s.clear()));
  },
};
