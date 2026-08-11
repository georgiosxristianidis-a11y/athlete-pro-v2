// @ts-check
/**
 * exercise-shorthand.js — pure word-level abbreviation for exercise names.
 *
 * Kept DOM-free so it is unit-testable in isolation (dynamic-island.js pulls in
 * canvas/PiP/store deps that don't load under node --test, see sync-dot.js).
 *
 * Display-only transform: never touches ex.name, alias, or history lookup.
 * Long equipment words eat the Island compact strip's width budget — swapped
 * for their gym-standard short forms. CSS ellipsis (island-min-label) is the
 * safety net for whatever's still too long after this.
 */

export const SHORT_WORDS = { dumbbell: 'DB', barbell: 'BB', machine: 'Mach', kettlebell: 'KB', overhead: 'OH' };

/**
 * @param {string} name
 * @returns {string}
 */
export function shortenExerciseName(name) {
  if (!name) return '';
  return name.replace(/\b(dumbbell|barbell|machine|kettlebell|overhead)\b/gi, (w) => SHORT_WORDS[w.toLowerCase()] || w);
}

/**
 * ABBR-1 п.2 — Island-only display label for an exercise. `ex.tag` is a
 * user-set override (Edit Plan), never derived from `name`/`alias`, so it
 * carries no history-lookup meaning — display concern only.
 * Precedence: manual tag > (compact: auto-shortened word swap) > raw name.
 * @param {{name?: string, tag?: string}|null|undefined} ex
 * @param {{compact?: boolean}} [opts]
 * @returns {string}
 */
export function islandLabel(ex, { compact = false } = {}) {
  if (!ex) return '';
  if (ex.tag) return ex.tag;
  return compact ? shortenExerciseName(ex.name) : (ex.name || '');
}
