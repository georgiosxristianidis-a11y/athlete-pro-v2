// @ts-check
/* ════════════════════════════════════════════════════════
   shared/hint-resolve.js — чистая логика подсказки техники (HINT-1, флаг exercise-hint)
   Ни DOM, ни IDB: данные подсказок, библиотека и история приходят аргументами.
   ════════════════════════════════════════════════════════ */

import { canonicalKey } from './exercise-identity.js';
import { muscleZones } from './body-map.js';

/** Полоса сама скрывается после стольких сессий с упражнением. */
export const HINT_HIDE_AFTER = 3;

const low = (/** @type {unknown} */ s) => String(s ?? '').trim().toLowerCase();

/**
 * @typedef {Object} ResolvedHint
 * @property {string} name     имя карточки (англ.)
 * @property {string} nameRu   имя из библиотеки, '' если нет
 * @property {string} eq       снаряд: eq подсказки или equipment библиотеки
 * @property {string} cat      категория библиотеки (push/pull/legs/core/…)
 * @property {string} line     строка техники, '' — подсказки нет (только силуэт)
 * @property {string[]} tips
 * @property {{primary: string[], secondary: string[]}} zones
 */

/**
 * Подсказка для имени карточки: сперва запись HINTS (ключ — имя плана, `same` — алиас),
 * мышцы — из библиотеки по `lib`; иначе точное имя в библиотеке — силуэт без строки техники.
 * @param {string} name
 * @param {Record<string, any>} hints
 * @param {Array<any>} library
 * @param {'ru'|'en'|'el'} lang
 * @returns {ResolvedHint|null} null — ни подсказки, ни упражнения в библиотеке
 */
export function resolveHint(name, hints, library, lang) {
  const key = Object.keys(hints).find((k) => low(k) === low(name));
  let h = key ? hints[key] : null;
  if (h?.same) h = hints[h.same] || null;
  const lib = h?.lib
    ? (library || []).find((e) => e.id === h.lib)
    : (library || []).find((e) => low(e.name) === low(name));
  if (!h && !lib) return null;
  const text = h ? h[lang] || h.en : null;
  return {
    name: String(name),
    nameRu: lib?.nameRu || '',
    eq: h?.eq || lib?.equipment || '',
    cat: lib?.category || '',
    line: text?.line || '',
    tips: text?.tips || [],
    zones: muscleZones(lib),
  };
}

/**
 * Сколько сессий истории засчитали упражнение: закрыт хотя бы один подход
 * (`done !== false`, `reps > 0` — как у lastWorkingWeight). Имя сравнивается по canonicalKey.
 * @param {Array<{exercises?: Array<{name?: string, sets?: Array<{done?: boolean, reps?: number}>}>}>} workouts
 * @param {string} name
 * @returns {number}
 */
export function sessionsDone(workouts, name) {
  const key = canonicalKey(name);
  let n = 0;
  for (const w of workouts || []) {
    const hit = (w.exercises || []).some(
      (e) => canonicalKey(e.name || '') === key && (e.sets || []).some((s) => s && s.done !== false && Number(s.reps) > 0),
    );
    if (hit) n++;
  }
  return n;
}
