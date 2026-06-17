// @ts-check
/* ════════════════════════════════════════════════════════
   sync-merge.js — pure merge primitives shared by push + pull
   No IDB, no network, no DOM → unit-testable in isolation.
   ════════════════════════════════════════════════════════ */

import { lwwWins } from './lww.js';

/**
 * Set-level deep merge for a workout's exercises, so a set logged on one device
 * is never lost when another device's copy syncs. Starts from the remote
 * exercises; for each local exercise:
 *   - new exercise (remote-absent) → added,
 *   - shared exercise → sets merged index-by-index: a remote-missing slot takes
 *     the local set; a slot present on both takes the local set only when
 *     `localWins` (otherwise remote is kept).
 * @template {{ name: string, sets?: any[] }} Ex
 * @param {Ex[]} [localEx]
 * @param {Ex[]} [remoteEx]
 * @param {boolean} [localWins] whether the local replica is the LWW winner
 * @returns {Ex[]} merged exercises
 */
export function mergeWorkoutExercises(localEx = [], remoteEx = [], localWins = false) {
  /** @type {Map<string, Ex>} */
  const merged = new Map();
  for (const ex of remoteEx) merged.set(ex.name, { ...ex });
  for (const ex of localEx) {
    if (merged.has(ex.name)) {
      const rEx = merged.get(ex.name);
      const sets = [...(rEx.sets || [])];
      const lSets = ex.sets || [];
      for (let i = 0; i < lSets.length; i++) {
        if (!sets[i]) sets[i] = lSets[i];          // remote missing this set → keep local
        else if (localWins) sets[i] = lSets[i];    // both present → local wins only if newer
      }
      merged.set(ex.name, { ...ex, sets });
    } else {
      merged.set(ex.name, ex);                     // exercise only seen locally
    }
  }
  return Array.from(merged.values());
}

/**
 * Decide which replica of a record wins, via the deterministic LWW resolver.
 * Tolerates legacy rows that carry `timestamp` instead of `updatedAt`.
 * @param {{ updatedAt?: number, timestamp?: number, deviceId?: string }} localRow
 * @param {{ updatedAt?: number, timestamp?: number, deviceId?: string }} remoteRow
 * @returns {'local'|'remote'}
 */
export function pickWinner(localRow, remoteRow) {
  const local = { updatedAt: localRow.updatedAt ?? localRow.timestamp, deviceId: localRow.deviceId };
  const remote = { updatedAt: remoteRow.updatedAt ?? remoteRow.timestamp, deviceId: remoteRow.deviceId };
  return lwwWins(local, remote) ? 'local' : 'remote';
}
