// @ts-check
/* ════════════════════════════════════════════════════════
   lww.js — Last-Write-Wins conflict resolution (pure)
   Deterministic across devices: timestamp first, deviceId
   as tiebreak so two replicas always agree on the winner.
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {{ updatedAt?: number, timestamp?: number, deviceId?: string }} LwwMeta
 */

/**
 * Decide whether the local record wins over the remote one.
 * Symmetric and deterministic: lwwWins(a, b) === !lwwWins(b, a)
 * whenever a and b differ in timestamp or deviceId.
 * @param {LwwMeta} local
 * @param {LwwMeta} remote
 * @returns {boolean} true if local should overwrite remote
 */
export function lwwWins(local, remote) {
  const lt = local.updatedAt ?? local.timestamp ?? 0;
  const rt = remote.updatedAt ?? remote.timestamp ?? 0;
  if (lt !== rt) return lt > rt;
  return String(local.deviceId ?? '') > String(remote.deviceId ?? '');
}
