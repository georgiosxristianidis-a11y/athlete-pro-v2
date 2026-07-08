// @ts-check
/* ════════════════════════════════════════════════════════
   island-profile.store.js — persisted Dynamic Island layout profile
   ────────────────────────────────────────────────────────
   Which visual profile the Dynamic Island renders (ISL-PROFILE):
     'minimal' — Minimal-DHL (default): chamber-navigation strip,
                 near-black + hairline, air over panel.
     'apple'   — Apple-2-state (legacy ISL-REDESIGN) kept as an option.

   Persisted per-device in localStorage('ap-island-profile'). The whole
   profile system is gated by flag('island-profiles') in js/flags.js —
   flag off → the island always renders the proven 'apple' path.
   Chosen from the Island Settings screen (island-settings.view.js).
   ════════════════════════════════════════════════════════ */

const KEY = 'ap-island-profile';
/** @type {ReadonlyArray<'minimal'|'apple'>} */
export const ISLAND_PROFILES = ['minimal', 'apple'];

/** @returns {'minimal'|'apple'} */
export function getIslandProfile() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'minimal' || v === 'apple') return v;
  } catch { /* SSR / private mode — fall through to default */ }
  return 'minimal';
}

/** @param {string} p */
export function setIslandProfile(p) {
  if (p !== 'minimal' && p !== 'apple') return;
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('ap-island-profile', { detail: { profile: p } }));
  } catch { /* no window (tests) */ }
}
