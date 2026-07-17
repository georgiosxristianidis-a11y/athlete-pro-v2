// @ts-check
/**
 * sync-dot.js — pure state machine for the Dynamic Island network/sync dot.
 *
 * Kept DOM-free so it is unit-testable in isolation (the Island module pulls in
 * canvas/PiP/store deps that don't load under node --test).
 *
 * Visual mapping (see css/dynamic-island.css `.island-dot.*`):
 *   synced   → green, quiet pulse 2.4s   (cloud up, nothing pending)
 *   syncing  → cyan, fast pulse 1.2s     (push/pull in flight)
 *   error    → amber, slow pulse         (sync failed while online — actionable)
 *   offline  → red                       (no network, or sync reports offline)
 *   no-cloud → grey (--c-chrome), static (sync allowed but Supabase not set up)
 *   airgap   → grey (--c-chrome), static (privacy by design: visible neutral
 *              light, never a network colour — L3 decision 2026-07-15)
 */

/**
 * @param {Object}  s
 * @param {'cloud'|'anon'|'airgap'} s.mode            current privacy mode
 * @param {boolean} s.online                          navigator.onLine
 * @param {'idle'|'syncing'|'error'|'offline'|string} s.syncStatus  SyncManager._status
 * @param {boolean} s.cloudConfigured                 Supabase creds present
 * @returns {'airgap'|'offline'|'syncing'|'error'|'no-cloud'|'synced'}
 */
export function deriveDotState({ mode, online, syncStatus, cloudConfigured }) {
  // Privacy-first: in air-gapped mode there is no network activity to surface.
  if (mode === 'airgap') return 'airgap';
  // Connectivity loss wins over everything (also covers sync's own 'offline').
  if (!online || syncStatus === 'offline') return 'offline';
  if (syncStatus === 'syncing') return 'syncing';
  if (syncStatus === 'error') return 'error';
  // Sync is permitted but the backend was never configured (no creds / stub).
  if (!cloudConfigured) return 'no-cloud';
  return 'synced';
}
