// @ts-check
/* ════════════════════════════════════════════════════════
   hlc.js — Hybrid Logical Clock (HLC) Engine
   Guarantees causality and monotonic timestamp ordering across
   distributed devices regardless of physical clock skew.
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {{ l: number, c: number, node: string }} HLCTimestamp
 */

let stateL = 0;
let stateC = 0;

/**
 * Generate a new HLC timestamp for local write event.
 * @param {string} nodeId - Unique identifier for the local node/device.
 * @returns {HLCTimestamp}
 */
export function hlcNow(nodeId) {
  const pt = Date.now();
  if (pt > stateL) {
    stateL = pt;
    stateC = 0;
  } else {
    stateC += 1;
  }
  return {
    l: stateL,
    c: stateC,
    node: String(nodeId || 'unknown')
  };
}

/**
 * Advance local HLC state upon receiving a remote HLC timestamp.
 * Ensures future local writes strictly succeed the remote timestamp.
 * @param {Partial<HLCTimestamp> | { updatedAt?: number, timestamp?: number, deviceId?: string } | null | undefined} remoteHlc
 * @param {string} nodeId - Unique identifier for the local node/device.
 * @returns {HLCTimestamp}
 */
export function hlcReceive(remoteHlc, nodeId) {
  const remoteL = Number(remoteHlc?.l ?? remoteHlc?.updatedAt ?? remoteHlc?.timestamp ?? 0);
  const remoteC = Number(remoteHlc?.c ?? 0);

  const pt = Date.now();
  const lNext = Math.max(stateL, pt, remoteL);

  if (lNext === stateL && lNext === remoteL) {
    stateC = Math.max(stateC, remoteC) + 1;
  } else if (lNext === stateL) {
    stateC = stateC + 1;
  } else if (lNext === remoteL) {
    stateC = remoteC + 1;
  } else {
    stateC = 0;
  }

  stateL = lNext;

  return {
    l: stateL,
    c: stateC,
    node: String(nodeId || 'unknown')
  };
}

/**
 * Compare two HLC timestamps (or legacy metadata objects).
 * Symmetric and deterministic comparator.
 * @param {Partial<HLCTimestamp> | { updatedAt?: number, timestamp?: number, deviceId?: string } | null | undefined} a
 * @param {Partial<HLCTimestamp> | { updatedAt?: number, timestamp?: number, deviceId?: string } | null | undefined} b
 * @returns {number} positive if a > b, negative if a < b, 0 if equal
 */
export function hlcCompare(a, b) {
  const aL = Number(a?.l ?? a?.updatedAt ?? a?.timestamp ?? 0);
  const aC = Number(a?.c ?? 0);
  const aNode = String(a?.node ?? a?.deviceId ?? '');

  const bL = Number(b?.l ?? b?.updatedAt ?? b?.timestamp ?? 0);
  const bC = Number(b?.c ?? 0);
  const bNode = String(b?.node ?? b?.deviceId ?? '');

  if (aL !== bL) return aL - bL;
  if (aC !== bC) return aC - bC;
  if (aNode !== bNode) return aNode > bNode ? 1 : -1;
  return 0;
}

/**
 * Reset local HLC state (primarily for test suite isolation).
 * @param {number} [l=0]
 * @param {number} [c=0]
 */
export function resetHLCState(l = 0, c = 0) {
  stateL = l;
  stateC = c;
}
