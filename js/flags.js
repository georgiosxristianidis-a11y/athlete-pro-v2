// @ts-check
/* ════════════════════════════════════════════════════════
   flags.js — Feature flags (Strangler-Fig safety switch)
   ────────────────────────────────────────────────────────
   Hide in-progress / risky code paths behind a switch so a broken
   rewrite is a one-line flip, never a desperate `git reset --hard`.

   Pattern (Strangler-Fig):
     import { flag } from './flags.js';
     if (flag('v2-workout-view')) renderWorkoutV2();
     else                         renderWorkoutLegacy();   // 100% working

   Defaults below are the source of truth (ship OFF for unfinished work).
   Per-DEVICE override without a deploy — flip from DevTools console:
     Flags.setFlag('v2-workout-view', true)   // try it
     Flags.setFlag('v2-workout-view', false)  // kill switch if it breaks
     Flags.allFlags()                          // inspect
   Override is stored in localStorage('ap-flag-<name>') = '1' | '0'.
   ════════════════════════════════════════════════════════ */

/** @type {Record<string, boolean>} New v2 paths default OFF until released. */
const DEFAULTS = {
  // Add forward flags here, e.g.:
  // 'v2-workout-view': false,

  // PERF-DRUM: set-logger drums render a ~15-item window around the current
  // value instead of the full range (was 86% of the workout screen's DOM).
  // Kill switch on device: Flags.setFlag('drum-virtual', false)
  // 2026-07-09: default OFF — matches prod 1.21.1. The e4b2df6 scrollTop↔index
  // math fix proved insufficient in the field (weight still zeroed), so we fall
  // back to the proven kill-switch until virtualization is reworked.
  'drum-virtual': false,

  // DRUM-PERF-2 (flag 'drum-window'): set-logger drums render a ±20-item
  // window around the current value (DOM cap, fresh nodes each rebuild — no
  // recycling). Unlike 'drum-virtual', the window is NEVER rebuilt mid-scroll:
  // only at rest (scrollend commit / programmatic seek), so mandatory
  // scroll-snap cannot yank the position during a gesture — the exact
  // drum-virtual field-failure mode. Default OFF until Gio's field check.
  // Kill switch on device: Flags.setFlag('drum-window', false)
  'drum-window': false,

  // ISL-PROFILE: Dynamic Island layout profiles. ON exposes the profile
  // system (Minimal-DHL default + Apple legacy), chosen in Island Settings
  // and persisted in island-profile.store.js. Kill switch → island reverts
  // to the proven Apple-2-state path: Flags.setFlag('island-profiles', false)
  'island-profiles': true,
};

/** @param {string} name @returns {boolean} */
export function flag(name) {
  try {
    const ls = localStorage.getItem('ap-flag-' + name);
    if (ls === '1') return true;
    if (ls === '0') return false;
  } catch { /* SSR / private mode — fall through to default */ }
  return !!DEFAULTS[name];
}

/** @param {string} name @param {boolean} on */
export function setFlag(name, on) {
  try { localStorage.setItem('ap-flag-' + name, on ? '1' : '0'); } catch { /* ignore */ }
}

/** @returns {Record<string, boolean>} effective value of every known flag */
export function allFlags() {
  return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, flag(k)]));
}

// Console handle for live toggling during testing.
if (typeof window !== 'undefined') window.Flags = { flag, setFlag, allFlags };
