// @ts-check
import { hlcCompare } from './hlc.js';

/* ════════════════════════════════════════════════════════
   lww.js — Last-Write-Wins conflict resolution (pure)
   Deterministic across devices: HLC timestamp comparison (l, c, node)
   so two replicas always agree on the winner.
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {{ hlc?: { l: number, c: number, node: string }, updatedAt?: number, timestamp?: number, deviceId?: string }} LwwMeta
 */

/**
 * Decide whether the local record wins over the remote one.
 * Symmetric and deterministic using HLC comparison:
 * lwwWins(a, b) === !lwwWins(b, a) whenever a and b differ.
 * @param {LwwMeta} local
 * @param {LwwMeta} remote
 * @returns {boolean} true if local should overwrite remote
 */
export function lwwWins(local, remote) {
  if (!local && !remote) return false;
  if (local && !remote) return true;
  if (!local && remote) return false;

  const localHlc = local.hlc || {
    l: local.updatedAt ?? local.timestamp ?? 0,
    c: 0,
    node: local.deviceId ?? ''
  };

  const remoteHlc = remote.hlc || {
    l: remote.updatedAt ?? remote.timestamp ?? 0,
    c: 0,
    node: remote.deviceId ?? ''
  };

  return hlcCompare(localHlc, remoteHlc) > 0;
}

