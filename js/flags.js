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
  'drum-virtual': true,
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
