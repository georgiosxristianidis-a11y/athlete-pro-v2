// @ts-check
/**
 * exercise-label.js — RU display name for an exercise (EX-RU-1).
 *
 * Display-only: never touches `ex.name`, the canonical identifier used by
 * plan/history/1RM. Pure — no store import, no DOM — so `workout.store.js`
 * can stay the single source of truth for the exercise library without a
 * cycle back into this file.
 *
 * Seed plan names (`PPL_GIO_PLAN`/`PPL_HYBRID_PLAN`) diverge from the
 * library's own wording the same way they do for `resolveMuscleGroup` in
 * `workout.store.js` — some resolve by exact/substring match, some need a
 * manual name override because there's no textual overlap at all
 * ("Butterfly Machine" vs "Pec Deck Fly").
 */

const NAME_OVERRIDES = {
  'incline db press': 'incline dumbbell bench press',
  'butterfly machine': 'pec deck fly',
  'dips (chest focus)': 'chest dip',
  'hyperextensions': 'back extension (hyperextension)',
  'overhead tricep ext.': 'overhead tricep extension',
  'wide-grip upright row': 'barbell upright row',
  'hip adductor machine': 'hip adduction machine',
  'hip abductor machine': 'hip abduction machine',
  'iso-lateral seated row': 'machine row (chest-supported)',
};

/** @param {string} s */
function normalizeAbbr(s) {
  return s.replace(/\bdb\b/gi, 'dumbbell');
}

/**
 * @param {string} name
 * @param {Array<{name?: string, nameRu?: string}>} library
 * @returns {{name?: string, nameRu?: string}|null}
 */
export function findLibraryExercise(name, library) {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw || !Array.isArray(library)) return null;

  const overrideTarget = NAME_OVERRIDES[raw];
  if (overrideTarget) {
    const hit = library.find((ex) => String(ex?.name || '').trim().toLowerCase() === overrideTarget);
    if (hit) return hit;
  }

  const exact = library.find((ex) => {
    const n = String(ex?.name || '').trim().toLowerCase();
    const nRu = String(ex?.nameRu || '').trim().toLowerCase();
    return n === raw || (nRu && nRu === raw);
  });
  if (exact) return exact;

  const clean = normalizeAbbr(raw);
  return (
    library.find((ex) => {
      const n = normalizeAbbr(String(ex?.name || '').trim().toLowerCase());
      if (!n) return false;
      return n.includes(clean) || clean.includes(n);
    }) || null
  );
}

/**
 * @param {string} name — canonical `ex.name` (or already-RU text, passed through)
 * @param {{library?: Array<{name?: string, nameRu?: string}>, lang?: string}} opts
 * @returns {string}
 */
export function exerciseLabel(name, { library, lang } = {}) {
  if (lang !== 'ru') return name || '';
  const match = findLibraryExercise(name, library);
  const nameRu = match?.nameRu ? String(match.nameRu).trim() : '';
  return nameRu || name || '';
}
