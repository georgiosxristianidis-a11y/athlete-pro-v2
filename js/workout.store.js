// @ts-check
/* ════════════════════════════════════════════════════════
   workout.store.js — Workout state & plan management
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { getProgram } from './workout-plans.js';

export const SESSION_KEY = 'ap-active-session';
export const PLAN_KEY = 'ap-custom-plan';        // legacy — migrated → PLAN_KEY_A on first load
export const PLAN_KEY_A = 'ap-custom-plan-A';
export const PLAN_KEY_B = 'ap-custom-plan-B';
export const WEEK_MODE_KEY = 'ap-week-mode';     // 'A' | 'B'
export const CORE_KEY = 'ap-core-checklist';     // { push:[{name}], pull:[...], legs:[...] }
export const CUSTOM_WORKOUTS_KEY = 'ap-custom-workouts';
export const ACTIVE_PLAN_KEY = 'ap-active-plan'; // { id: string, type: 'ppl'|'5x5'|'gzclp', startedAt: number, currentWeek: number, currentDay: number, config: {} }

/* ════════════════════════════════════════════════════════
   ACTIVE PLAN MANAGEMENT
   ════════════════════════════════════════════════════════ */

/**
 * Get currently active training program/cycle.
 * @returns {Object|null}
 */
export function getActivePlan() {
  try {
    const raw = localStorage.getItem(ACTIVE_PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Set a new active program/cycle.
 * @param {Object} plan
 */
export function setActivePlan(plan) {
  localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify({
    ...plan,
    startedAt: plan.startedAt || Date.now()
  }));
}

/**
 * Clear the active program and return to free training.
 */
export function resetActivePlan() {
  localStorage.removeItem(ACTIVE_PLAN_KEY);
}

/**
 * PPL | GIO preset — Week A/B variants. Block I + II identical; Block III (arms) swaps.
 * Core block is separate (CORE_PRESET) — checklist-only, not in main plan.
 * Legs identical in A/B (no arms in Block III for legs).
 * @type {{ weekA: Object, weekB: Object }}
 */
export const PPL_GIO_PLAN = {
  weekA: {
    push: [
      { name: 'Flat Barbell Bench Press',     sets: 3, reps: 8,  weight: 0, block: 'power' },
      { name: 'Incline Dumbbell Press',        sets: 3, reps: 10, weight: 0, block: 'power', isUnilateral: true },
      { name: 'Butterfly Machine',             sets: 3, reps: 12, weight: 0, block: 'shape' },
      { name: 'Dips (Chest Focus)',            sets: 3, reps: 10, weight: 0, block: 'shape', isBW: true },
      { name: 'Dumbbell Pullover',             sets: 3, reps: 12, weight: 0, block: 'shape', isUnilateral: true },
      // Block III — Biceps focus (Week A swap)
      { name: 'Alternating Dumbbell Curls',    sets: 3, reps: 10, weight: 0, block: 'arms', isUnilateral: true },
      { name: 'Hammer Curls',                  sets: 3, reps: 10, weight: 0, block: 'arms', isUnilateral: true },
      { name: 'Preacher Curls',                sets: 3, reps: 12, weight: 0, block: 'arms' },
      // Block IV — Core
      { name: 'Hanging Leg Raises',            sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
      { name: 'Hyperextensions',               sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
    ],
    pull: [
      { name: 'Pull-ups (Weighted)',           sets: 3, reps: 8,  weight: 0, block: 'width', isBW: true },
      { name: 'Lat Pulldown',                  sets: 3, reps: 10, weight: 0, block: 'width' },
      { name: 'Chest-Supported T-Bar Row',     sets: 3, reps: 8,  weight: 0, block: 'thickness' },
      { name: 'Low Block Cable Row',           sets: 3, reps: 10, weight: 0, block: 'thickness' },
      { name: 'Iso-Lateral Seated Row',        sets: 3, reps: 12, weight: 0, block: 'thickness', isUnilateral: true },
      // Block III — Triceps focus (Week A swap)
      { name: 'Triceps Rope Pushdown',         sets: 3, reps: 12, weight: 0, block: 'arms' },
      { name: 'Overhead Cable Extension',      sets: 3, reps: 12, weight: 0, block: 'arms' },
      { name: 'Dumbbell Shrugs',               sets: 3, reps: 12, weight: 0, block: 'arms', isUnilateral: true },
      // Block IV — Core
      { name: 'Hanging Leg Raises',            sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
      { name: 'Hyperextensions',               sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
    ],
    legs: [
      { name: 'Leg Press',                     sets: 3, reps: 10, weight: 0, block: 'heavy' },
      { name: 'Barbell Hip Thrust',            sets: 3, reps: 10, weight: 0, block: 'heavy' },
      { name: 'Leg Extensions',                sets: 3, reps: 12, weight: 0, block: 'iso' },
      { name: 'Lying Leg Curls',               sets: 3, reps: 10, weight: 0, block: 'iso' },
      { name: 'Standing Calf Raises',          sets: 3, reps: 15, weight: 0, block: 'iso' },
      { name: 'Machine Lateral Raises',        sets: 3, reps: 12, weight: 0, block: 'shoulders', isUnilateral: true },
      { name: 'Wide-Grip Upright Row',         sets: 3, reps: 10, weight: 0, block: 'shoulders' },
      { name: 'Reverse Pec Deck',              sets: 3, reps: 12, weight: 0, block: 'shoulders' },
      // Block IV — Alignment
      { name: 'Dead Bug',                      sets: 3, reps: 10, weight: 0, block: 'align', noDb: true, isUnilateral: true, isBW: true },
      { name: 'Plank',                         sets: 1, reps: 60, weight: 0, block: 'align', noDb: true, isBW: true },
    ],
  },
  weekB: {
    push: [
      { name: 'Flat Barbell Bench Press',     sets: 3, reps: 8,  weight: 0, block: 'power' },
      { name: 'Incline Dumbbell Press',        sets: 3, reps: 10, weight: 0, block: 'power', isUnilateral: true },
      { name: 'Butterfly Machine',             sets: 3, reps: 12, weight: 0, block: 'shape' },
      { name: 'Dips (Chest Focus)',            sets: 3, reps: 10, weight: 0, block: 'shape', isBW: true },
      { name: 'Dumbbell Pullover',             sets: 3, reps: 12, weight: 0, block: 'shape', isUnilateral: true },
      // Block III — Triceps focus (Week B swap)
      { name: 'Triceps Rope Pushdown',         sets: 3, reps: 12, weight: 0, block: 'arms' },
      { name: 'Overhead Cable Extension',      sets: 3, reps: 12, weight: 0, block: 'arms' },
      { name: 'Close-Grip Bench Press',        sets: 3, reps: 10, weight: 0, block: 'arms' },
      // Block IV — Core
      { name: 'Hanging Leg Raises',            sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
      { name: 'Hyperextensions',               sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
    ],
    pull: [
      { name: 'Pull-ups (Weighted)',           sets: 3, reps: 8,  weight: 0, block: 'width', isBW: true },
      { name: 'Lat Pulldown',                  sets: 3, reps: 10, weight: 0, block: 'width' },
      { name: 'Chest-Supported T-Bar Row',     sets: 3, reps: 8,  weight: 0, block: 'thickness' },
      { name: 'Low Block Cable Row',           sets: 3, reps: 10, weight: 0, block: 'thickness' },
      { name: 'Iso-Lateral Seated Row',        sets: 3, reps: 12, weight: 0, block: 'thickness', isUnilateral: true },
      // Block III — Biceps focus (Week B swap)
      { name: 'Alternating Dumbbell Curls',    sets: 3, reps: 10, weight: 0, block: 'arms', isUnilateral: true },
      { name: 'Hammer Curls',                  sets: 3, reps: 10, weight: 0, block: 'arms', isUnilateral: true },
      { name: 'Preacher Curls',                sets: 3, reps: 12, weight: 0, block: 'arms' },
      { name: 'Dumbbell Shrugs',               sets: 3, reps: 12, weight: 0, block: 'arms', isUnilateral: true },
      // Block IV — Core
      { name: 'Hanging Leg Raises',            sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
      { name: 'Hyperextensions',               sets: 3, reps: 15, weight: 0, block: 'core', noDb: true, isBW: true },
    ],
    legs: [
      { name: 'Leg Press',                     sets: 3, reps: 10, weight: 0, block: 'heavy' },
      { name: 'Barbell Hip Thrust',            sets: 3, reps: 10, weight: 0, block: 'heavy' },
      // Block II — Isolation Swap
      { name: 'Hip Adductor Machine',          sets: 3, reps: 15, weight: 0, block: 'iso' },
      { name: 'Hip Abductor Machine',          sets: 3, reps: 15, weight: 0, block: 'iso' },
      { name: 'Standing Calf Raises',          sets: 3, reps: 15, weight: 0, block: 'iso' },
      { name: 'Machine Lateral Raises',        sets: 3, reps: 12, weight: 0, block: 'shoulders', isUnilateral: true },
      { name: 'Wide-Grip Upright Row',         sets: 3, reps: 10, weight: 0, block: 'shoulders' },
      { name: 'Reverse Pec Deck',              sets: 3, reps: 12, weight: 0, block: 'shoulders' },
      // Block IV — Alignment
      { name: 'Dead Bug',                      sets: 3, reps: 10, weight: 0, block: 'align', noDb: true, isUnilateral: true, isBW: true },
      { name: 'Plank',                         sets: 1, reps: 60, weight: 0, block: 'align', noDb: true, isBW: true },
    ],
  },
};

/**
 * Default Core checklist seeded when user loads PPL preset or first opens Train screen.
 * Visual-only — no weight/reps/tonnage.
 * @type {{ push: string[], pull: string[], legs: string[] }}
 */
export const CORE_PRESET = {
  push: ['Hanging Leg Raises', 'Hyperextensions'],
  pull: ['Hanging Leg Raises', 'Hyperextensions'],
  legs: ['Dead Bug', 'Plank'],
};

/** @type {Object<string, Array<{name: string, sets: number, reps: number, weight: number}>>} */
export const DEFAULT_PLAN = {
  push: [
    // Chest ×3
    { name: 'Bench Press', sets: 4, reps: 8, weight: 80 },
    { name: 'Incline DB Press', sets: 3, reps: 12, weight: 30 },
    { name: 'Cable Fly', sets: 3, reps: 15, weight: 20 },
    // Shoulders ×2
    { name: 'Overhead Press', sets: 3, reps: 10, weight: 50 },
    { name: 'Lateral Raise', sets: 3, reps: 15, weight: 12 },
    // Arms / Triceps ×2
    { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: 25 },
    { name: 'Overhead Tricep Ext.', sets: 3, reps: 12, weight: 20 },
  ],
  pull: [
    // Back ×4
    { name: 'Deadlift', sets: 4, reps: 5, weight: 120 },
    { name: 'Pull-up', sets: 3, reps: 8, weight: 0 },
    { name: 'Barbell Row', sets: 3, reps: 10, weight: 70 },
    { name: 'Cable Row', sets: 3, reps: 12, weight: 55 },
    { name: 'Face Pull', sets: 3, reps: 15, weight: 20 },
    // Arms / Biceps ×2
    { name: 'Bicep Curl', sets: 3, reps: 12, weight: 18 },
    { name: 'Hammer Curl', sets: 3, reps: 12, weight: 16 },
  ],
  legs: [
    // Legs ×6
    { name: 'Squat', sets: 4, reps: 6, weight: 100 },
    { name: 'Romanian Deadlift', sets: 3, reps: 10, weight: 80 },
    { name: 'Leg Press', sets: 3, reps: 12, weight: 140 },
    { name: 'Walking Lunge', sets: 3, reps: 12, weight: 20 },
    { name: 'Leg Curl', sets: 3, reps: 12, weight: 40 },
    { name: 'Calf Raise', sets: 4, reps: 15, weight: 60 },
    // Core ×2
    { name: 'Plank', sets: 3, reps: 60, weight: 0 },
    { name: 'Hanging Leg Raise', sets: 3, reps: 12, weight: 0 },
  ],
};

/**
 * Exercise library item structure
 * @typedef {{ id: string, name: string, nameRu: string, category: string, muscleGroup: string, primaryMuscles: string[], secondaryMuscles: string[], equipment: string, mechanic: string, force: string, level: string, type: string, tags: string[] }} ExerciseItem
 */

/** @type {ExerciseItem[]} */
let _exerciseLibrary = null;

const LIBRARY_CACHE_KEY = 'exerciseLibraryCache';

/**
 * Fetch library from network. Returns { exercises, etag } or throws.
 * @param {string|null} ifNoneMatch — ETag for conditional GET; null = unconditional
 * @returns {Promise<{ exercises: ExerciseItem[], etag: string|null, notModified: boolean }>}
 */
async function _fetchLibrary(ifNoneMatch) {
  const headers = ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {};
  const response = await fetch('exercises-library.json', { headers });
  if (response.status === 304) {
    return { exercises: [], etag: ifNoneMatch, notModified: true };
  }
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  return {
    exercises: data.exercises || [],
    etag: response.headers.get('ETag'),
    notModified: false,
  };
}

/**
 * Background revalidation — fire-and-forget. Updates IDB + in-memory if server
 * has a newer version (ETag mismatch). Failures are silent.
 * @param {string|null} etag
 */
function _revalidateLibrary(etag) {
  _fetchLibrary(etag)
    .then(({ exercises, etag: newEtag, notModified }) => {
      if (notModified) return;
      _exerciseLibrary = exercises;
      return DB.Settings.set(LIBRARY_CACHE_KEY, {
        exercises,
        etag: newEtag,
        fetchedAt: Date.now(),
      });
    })
    .catch(() => { /* network blip — keep cached copy */ });
}

/**
 * Get exercise library. Order: in-memory → IDB cache (+ bg revalidate) → network → hardcoded fallback.
 * @returns {Promise<ExerciseItem[]>}
 */
export async function getExerciseLibrary() {
  if (_exerciseLibrary) return _exerciseLibrary;

  // Try IDB cache first — survives page reload, avoids 85KB JSON parse on hot path
  try {
    const cached = await DB.Settings.get(LIBRARY_CACHE_KEY);
    if (cached && Array.isArray(cached.exercises) && cached.exercises.length) {
      _exerciseLibrary = cached.exercises;
      _revalidateLibrary(cached.etag || null);
      return _exerciseLibrary;
    }
  } catch { /* IDB unavailable — fall through to network */ }

  try {
    const { exercises, etag } = await _fetchLibrary(null);
    _exerciseLibrary = exercises;
    DB.Settings.set(LIBRARY_CACHE_KEY, {
      exercises,
      etag,
      fetchedAt: Date.now(),
    }).catch(() => { /* IDB write failure non-fatal */ });
    return _exerciseLibrary;
  } catch (err) {
    console.warn('[getExerciseLibrary] Failed to load JSON, using fallback:', err.message);
    // Fallback to hardcoded names
    _exerciseLibrary = HARDCODED_LIBRARY.map(name => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      nameRu: '',
      category: 'push',
      muscleGroup: 'unknown',
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: 'other',
      mechanic: 'unknown',
      force: 'unknown',
      level: 'beginner',
      type: 'strength',
      tags: []
    }));
    return _exerciseLibrary;
  }
}

/**
 * Filter exercises by category, muscle group, equipment.
 * @param {Object} filters — { category?, muscleGroup?, equipment?, query? }
 * @returns {Promise<ExerciseItem[]>}
 */
export async function filterExercises(filters = {}) {
  const library = await getExerciseLibrary();
  const { category, muscleGroup, equipment, query } = filters;

  return library.filter(ex => {
    if (category && ex.category !== category) return false;
    if (muscleGroup && ex.muscleGroup !== muscleGroup) return false;
    if (equipment && ex.equipment !== equipment) return false;
    if (query) {
      const q = query.toLowerCase();
      const nameMatch = ex.name.toLowerCase().includes(q);
      const tagsMatch = ex.tags.some(t => t.toLowerCase().includes(q));
      const musclesMatch = ex.primaryMuscles.some(m => m.toLowerCase().includes(q)) ||
                          ex.secondaryMuscles.some(m => m.toLowerCase().includes(q));
      if (!nameMatch && !tagsMatch && !musclesMatch) return false;
    }
    return true;
  });
}

/**
 * Get unique values for a field across all exercises.
 * @param {'category'|'muscleGroup'|'equipment'|'level'|'type'} field
 * @returns {Promise<string[]>}
 */
export async function getUniqueValues(field) {
  const library = await getExerciseLibrary();
  const values = new Set(library.map(ex => ex[field]));
  return Array.from(values).sort();
}

/**
 * Get exercise by name.
 * @param {string} name
 * @returns {Promise<ExerciseItem|undefined>}
 */
export async function getExerciseByName(name) {
  const library = await getExerciseLibrary();
  return library.find(ex => ex.name.toLowerCase() === name.toLowerCase());
}

/** @type {string[]} — Hardcoded fallback library */
const HARDCODED_LIBRARY = [
  // Push — Chest
  'Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Incline DB Press',
  'DB Fly', 'Cable Fly', 'Pec Deck', 'Machine Chest Press',
  // Push — Shoulders
  'Overhead Press', 'DB Shoulder Press', 'Arnold Press', 'Lateral Raise',
  'Front Raise', 'Cable Lateral Raise', 'Upright Row',
  // Push — Triceps
  'Tricep Pushdown', 'Overhead Tricep Ext.', 'Skull Crusher', 'Tricep Dip',
  'Close-Grip Bench', 'Cable Overhead Ext.',
  // Pull — Back
  'Deadlift', 'Romanian Deadlift', 'Stiff-Leg Deadlift', 'Pull-up', 'Chin-up',
  'Lat Pulldown', 'Barbell Row', 'DB Row', 'Cable Row', 'T-Bar Row', 'Seal Row', 'Meadows Row',
  // Pull — Rear delt / traps
  'Face Pull', 'Rear Delt Fly', 'Shrug', 'Cable Shrug',
  // Pull — Biceps
  'Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl',
  'Incline DB Curl', 'Concentration Curl', 'Spider Curl',
  // Legs
  'Squat', 'Front Squat', 'Hack Squat', 'Smith Machine Squat', 'Leg Press',
  'Bulgarian Split Squat', 'Walking Lunge', 'Step-Up', 'Romanian Deadlift',
  'Sumo Deadlift', 'Leg Curl', 'Leg Extension', 'Calf Raise', 'Seated Calf Raise',
  'Hip Thrust', 'Glute Bridge',
  // Core
  'Plank', 'Side Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Russian Twist',
  'Ab Wheel', 'Decline Crunch', 'Mountain Climber', 'Dragon Flag', 'Toes-to-Bar',
].sort();

/**
 * @typedef {'idle'|'select'|'active'|'done'} WorkoutPhase
 */

/**
 * Active workout state. blockTimings tracks per-block startedAt/endedAt as
 * timestamps (Phase W-2-A) — NOT accumulated ms, so it survives page reloads
 * and lines up with the CRDT LWW semantics (memory:
 * design-2026-06-20-chambers-and-cool-steel.md).
 * @type {{ phase: WorkoutPhase, type: string|null, plan: Array|null, startedAt: number|null, blockTimings: Object<string, {startedAt:number, endedAt:number}>, stepDebounce: Object }}
 */
export const State = {
  phase: 'select',
  type: null,
  plan: null,
  startedAt: null,
  blockTimings: {},
  stepDebounce: {},
  /** @type {Record<string, boolean>} Core-item checked state, keyed by "day:name" */
  coreChecked: {},
};

/**
 * Pure helper — record a "set just became done" event against a block.
 * First call sets startedAt; every subsequent call advances endedAt. When the
 * user moves on to the next block, this block's endedAt naturally freezes at
 * its last set's timestamp. The helper mutates the passed object in place AND
 * returns it for chaining/testability. No-op when blockId is falsy (e.g.
 * exercises without a block id, such as live-added customs).
 *
 * @param {Object<string, {startedAt:number, endedAt:number}>} blockTimings
 * @param {string|null|undefined} blockId
 * @param {number} now  epoch-ms
 * @returns {typeof blockTimings}
 */
export function recordBlockTiming(blockTimings, blockId, now) {
  if (!blockId) return blockTimings;
  const entry = blockTimings[blockId];
  if (!entry) {
    blockTimings[blockId] = { startedAt: now, endedAt: now };
  } else {
    entry.endedAt = now;
  }
  return blockTimings;
}

/**
 * Get current week mode ('A' | 'B'). Defaults to 'A'.
 * @returns {'A'|'B'}
 */
export function getWeekMode() {
  const m = localStorage.getItem(WEEK_MODE_KEY);
  return m === 'B' ? 'B' : 'A';
}

/**
 * Set current week mode.
 * @param {'A'|'B'} mode
 * @returns {void}
 */
export function setWeekMode(mode) {
  localStorage.setItem(WEEK_MODE_KEY, mode === 'B' ? 'B' : 'A');
}

/**
 * One-time migration: legacy PLAN_KEY → PLAN_KEY_A. Idempotent.
 * @returns {void}
 */
function _migrateLegacyPlan() {
  try {
    const hasA = localStorage.getItem(PLAN_KEY_A);
    const legacy = localStorage.getItem(PLAN_KEY);
    if (!hasA && legacy) {
      localStorage.setItem(PLAN_KEY_A, legacy);
    }
  } catch { /* localStorage unavailable */ }
}

/**
 * Load plan for given week ('A' default). Migrates legacy key on first call.
 * Falls back to the PPL | GIO preset (blocked → live 4-chamber DHL out of the
 * box) when no stored plan exists or data is corrupt. Legacy flat DEFAULT_PLAN
 * is no longer the fallback; blockless saved plans are chamber-classified at
 * buildSession via classifyChamber().
 * @param {'A'|'B'} [week] — defaults to current week mode
 * @returns {Object<string, Array<{name: string, sets: number, reps: number, weight: number, isUnilateral?: boolean, block?: string}>>}
 */
export function loadPlan(week) {
  _migrateLegacyPlan();
  const w = week || getWeekMode();
  const key = w === 'B' ? PLAN_KEY_B : PLAN_KEY_A;
  const preset = () => JSON.parse(JSON.stringify(w === 'B' ? PPL_GIO_PLAN.weekB : PPL_GIO_PLAN.weekA));
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : preset();
  } catch {
    return preset();
  }
}

/**
 * Save plan for given week ('A' default).
 * @param {Object} plan
 * @param {'A'|'B'} [week] — defaults to current week mode
 * @returns {void}
 */
export function savePlan(plan, week) {
  const w = week || getWeekMode();
  const key = w === 'B' ? PLAN_KEY_B : PLAN_KEY_A;
  localStorage.setItem(key, JSON.stringify(plan));
}

/* ── Core checklist (visual-only, no DB, no tonnage) ── */

/**
 * Load Core checklist for a given day. Seeds CORE_PRESET on first read.
 * @param {'push'|'pull'|'legs'} day
 * @returns {string[]}
 */
export function loadCoreChecklist(day) {
  try {
    const raw = localStorage.getItem(CORE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (!all[day]) {
      all[day] = [...(CORE_PRESET[day] || [])];
      localStorage.setItem(CORE_KEY, JSON.stringify(all));
    }
    return all[day];
  } catch {
    return [...(CORE_PRESET[day] || [])];
  }
}

/**
 * Save Core checklist for a given day.
 * @param {'push'|'pull'|'legs'} day
 * @param {string[]} items
 * @returns {void}
 */
export function saveCoreChecklist(day, items) {
  try {
    const raw = localStorage.getItem(CORE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[day] = items;
    localStorage.setItem(CORE_KEY, JSON.stringify(all));
  } catch { /* storage full or unavailable */ }
}

/**
 * Smart-progression rule: if last session's TOP set hit target reps with ≥1 rep
 * in reserve (rpe ≤ 8) — bump weight by 2.5kg next time.
 * Falls back to last weight if no progression conditions met.
 * @param {{weight:number,reps:number,rpe:number|null,done:boolean}[]} lastSets
 * @param {number} targetReps — the plan's prescribed reps
 * @returns {{weight:number, autoBumped:boolean}|null}
 */
function _smartNextWeight(lastSets, targetReps) {
  const completed = lastSets.filter(s => s.done && s.weight > 0);
  if (!completed.length) return null;
  // Top set = highest weight set that was completed
  const top = completed.reduce((a, b) => (b.weight > a.weight ? b : a));
  const hitTarget = top.reps >= targetReps;
  const easyEffort = top.rpe == null ? hitTarget : top.rpe <= 8;
  if (hitTarget && easyEffort) {
    return { weight: Math.round((top.weight + 2.5) * 10) / 10, autoBumped: true };
  }
  // Otherwise repeat last weight
  return { weight: top.weight, autoBumped: false };
}

/**
 * Fallback chamber classifier for plan exercises that carry no explicit
 * `block` (legacy flat plans, blockless program templates). Maps a lift to one
 * of the four canonical chambers so the DHL tracker / summary never collapse
 * into a single "custom" blob. An explicit `ex.block` always wins upstream, and
 * live-added exercises keep their deliberate 'custom' block (a distinct chamber).
 * Design lock 2026-06-20: chambers are geometric — Heavy ▣ / Shape ▥ / Accent ◆ / Core ○.
 * @param {{name?: string, noDb?: boolean}} ex
 * @returns {'heavy'|'shape'|'arms'|'core'}
 */
export function classifyChamber(ex) {
  const name = String(ex?.name || '').toLowerCase();
  // ○ Core / alignment — flagged noDb, or unmistakable core-move names.
  if (ex?.noDb || /plank|dead ?bug|hollow|pallof|crunch|sit.?up|russian twist|ab wheel|leg raise|hyperext/.test(name)) return 'core';
  // ◆ Accent — single-joint isolation for arms / delts / calves.
  if (/curl|pushdown|tricep|lateral raise|face pull|calf|shrug|kickback|rear delt|preacher|upright row/.test(name)) return 'arms';
  // ▣ Heavy — the big multi-joint barbell / machine compounds.
  if (/squat|deadlift|bench|press|\brow\b|pull.?up|chin.?up|pulldown|leg press|hip thrust|lunge|dip/.test(name)) return 'heavy';
  // ▥ Shape — default hypertrophy bucket (flys, pullovers, machine shaping).
  return 'shape';
}

/**
 * Build an active workout session.
 * Switches between 'ActivePlan' cycle logic or fallback 'Free Training' PPL.
 * @param {string} [type] — 'push'|'pull'|'legs' for free training; ignored for ActivePlan
 * @param {{ workouts?: Array, autoProgress?: boolean }} [opts]
 * @returns {Array<{name: string, sets: Array<{weight: number, reps: number, done: boolean}>}>}
 */
export function buildSession(type, opts = {}) {
  const activePlan = getActivePlan();
  const workouts = opts.workouts || [];
  const autoProgress = opts.autoProgress !== false;

  // Case 1: Structured Active Plan (5x5, Cycle, etc.)
  if (activePlan) {
    const prog = getProgram(activePlan.id);
    if (prog) {
      const dayKey = prog.days[activePlan.currentDay % prog.days.length];
      const template = prog.templates[dayKey];
      
      return template.map(ex => {
        // Find last completion of this specific exercise IN THIS PROGRAM
        const lastSession = [...workouts].reverse().find(w => 
          w.planId === activePlan.id && (w.exercises || []).some(e => e.name === ex.name)
        );
        const lastEx = lastSession?.exercises?.find(e => e.name === ex.name);
        
        const progression = prog.getProgression(ex, lastEx);
        return {
          name: ex.name,
          block: ex.block || classifyChamber(ex),
          noDb: ex.noDb || false,
          isUnilateral: ex.isUnilateral || false,
          autoBumped: progression.autoBumped || false,
          sets: Array.from({ length: progression.sets }, () => ({
            weight: progression.weight,
            reps: progression.reps,
            done: false
          }))
        };
      });
    }
  }

  // Case 2: Fallback / Free Training (User's Default PPL)
  const plan = loadPlan();
  const t = type || 'push';
  return (plan[t] || []).map((ex) => {
    let weight = ex.weight;
    let bumped = false;
    if (workouts.length) {
      const last = [...workouts].reverse().find(w => (w.exercises || []).some(e => e.name === ex.name));
      const lastEx = last?.exercises?.find(e => e.name === ex.name);
      if (lastEx?.sets?.length) {
        const next = _smartNextWeight(lastEx.sets, ex.reps);
        if (next) {
          weight = next.weight;
          bumped = autoProgress && next.autoBumped;
        }
      }
    }
    return {
      name: ex.name,
      block: ex.block || classifyChamber(ex),
      noDb: ex.noDb || false,
      isUnilateral: ex.isUnilateral || false,
      autoBumped: bumped,
      sets: Array.from({ length: ex.sets }, () => ({
        weight: autoProgress ? weight : (workouts.length ? weight : ex.weight),
        reps: ex.reps,
        done: false,
      })),
    };
  });
}

/**
 * Start a new training program.
 * @param {string} programId
 */
export function startPlan(programId) {
  const prog = getProgram(programId);
  if (!prog) return;
  setActivePlan({
    id: programId,
    type: prog.type,
    startedAt: Date.now(),
    currentWeek: 1,
    currentDay: 0,
    config: {}
  });
}

/**
 * Advance active plan to next day/week.
 */
export function advancePlan() {
  const plan = getActivePlan();
  if (!plan) return;
  const prog = getProgram(plan.id);
  if (!prog) return;

  plan.currentDay++;
  if (plan.currentDay >= prog.days.length) {
    plan.currentDay = 0;
    plan.currentWeek++;
  }
  setActivePlan(plan);
}

/**
 * Get display info for current plan progress.
 */
export function getPlanStats() {
  const plan = getActivePlan();
  if (!plan) return null;
  const prog = getProgram(plan.id);
  return {
    name: prog?.name || 'Unknown',
    week: plan.currentWeek,
    day: (plan.currentDay % (prog?.days.length || 1)) + 1,
    totalDays: prog?.days.length || 0,
    progress: Math.round((plan.currentWeek / (prog?.durationWeeks || 1)) * 100)
  };
}

/**
 * Persist the current active session to localStorage for crash recovery.
 * No-op if State.phase is not 'active'.
 * @param {boolean} [force=false] — persist even if phase is not active
 * @returns {void}
 */
export function persistSession() {
  if (State.phase !== 'active') return;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      type: State.type,
      plan: State.plan,
      startedAt: State.startedAt,
      blockTimings: State.blockTimings || {},
      savedAt: Date.now(),
    })
  );
}

/**
 * Check if user needs program generation (new user without custom plan).
 * @returns {boolean}
 */
export function needsProgramGeneration() {
  const hasCustomPlan = localStorage.getItem(PLAN_KEY);
  return !hasCustomPlan;
}

/**
 * Fetch AI-generated program from /api/generate-plan.
 * @param {Object} options — { workoutHistory, oneRMs, goals, experience }
 * @returns {Promise<Object>} — { push:[], pull:[], legs:[] }
 */
export async function fetchGeneratedPlan(options = {}) {
  const { safeFetch } = await import('./privacy.store.js');
  const response = await safeFetch('/api/coach/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workoutHistory: options.workoutHistory || [],
      oneRMs: options.oneRMs || [],
      goals: options.goals || 'strength',
      experience: options.experience || 'intermediate'
    })
  }, 'ai');

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.plan;
}

/**
 * Try to restore an interrupted workout session from localStorage.
 * Returns the restored session data if found, null otherwise.
 * DOES NOT call Nav or Toast — caller handles navigation and notifications.
 * Sessions older than 4 hours are discarded automatically.
 * @param {number} [maxAgeMs=14400000] — maximum session age in milliseconds (default 4h)
 * @returns {{ type: string, plan: Array, startedAt: number }|null}
 */
export function tryRestoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Only restore if saved < 4 hours ago
    if (Date.now() - s.savedAt > 4 * 3600000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    State.type = s.type;
    State.plan = s.plan;
    State.startedAt = s.startedAt;
    State.blockTimings = s.blockTimings || {};
    State.phase = 'active';
    return { type: s.type, plan: s.plan, startedAt: s.startedAt };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/* ── Public API ── */

/* ════════════════════════════════════════════════════════
   CUSTOM WORKOUTS — User-created workout templates
   ════════════════════════════════════════════════════════ */
/**
 * Get all custom workouts from localStorage.
 * @returns {Array<{ id: string, name: string, type: 'push'|'pull'|'legs'|'custom', exercises: Array<{name: string, sets: number, reps: number, weight: number}> }>}
 */
export function getCustomWorkouts() {
  try {
    const raw = localStorage.getItem(CUSTOM_WORKOUTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save a new custom workout or update existing.
 * @param {{ id: string, name: string, type: string, exercises: Array }} workout
 * @returns {void}
 */
export function saveCustomWorkout(workout) {
  const workouts = getCustomWorkouts();
  const existingIndex = workouts.findIndex(w => w.id === workout.id);
  if (existingIndex >= 0) {
    workouts[existingIndex] = workout;
  } else {
    workouts.push(workout);
  }
  localStorage.setItem(CUSTOM_WORKOUTS_KEY, JSON.stringify(workouts));
}

/**
 * Delete a custom workout by id.
 * @param {string} id
 * @returns {void}
 */
export function deleteCustomWorkout(id) {
  const workouts = getCustomWorkouts();
  const filtered = workouts.filter(w => w.id !== id);
  localStorage.setItem(CUSTOM_WORKOUTS_KEY, JSON.stringify(filtered));
}

/* ════════════════════════════════════════════════════════
   POST-SESSION SUMMARY (Phase W-2-B)
   Pure computation: takes State → returns the summaryData shape that
   workout.view/summary.js renders. Closes BUG-1 by lifting the data
   shape out of the view layer so the view does string assembly only.
   ════════════════════════════════════════════════════════ */

/** Block id → uppercase semantic label. Single source of truth. */
export const BLOCK_LABEL = {
  power:     'POWER',
  shape:     'SHAPE',
  width:     'WIDTH',
  thickness: 'THICKNESS',
  heavy:     'HEAVY',
  iso:       'ISO',
  arms:      'ARMS',
  shoulders: 'SHOULDERS',
  core:      'CORE',
  align:     'ALIGN',
};

/**
 * Build the post-session summary data for the W-2-C report sheet.
 *
 * Engineering constraints honoured (from the PPL | GIO blueprint, locked in
 * memory: design-2026-06-20-chambers-and-cool-steel.md):
 *   • isUnilateral:true exercises double weight × reps in tonnage
 *     (Iso-Lateral Row otherwise reports half the real volume).
 *   • Camera 4 (noDb:true — Core / Body Alignment) is shown in the block
 *     list with its exercises so the user sees what was checked, but its
 *     tonnage stays at 0 and it never contributes to totals — prevents
 *     zero-weight sets from skewing aggregate analytics.
 *   • PR detection: new estimated 1RM (Epley) per exercise compared to the
 *     stored 1RM; PR fires when strictly greater (or when no 1RM exists
 *     yet — first-ever lift).
 *   • Block timings (Phase W-2-A) read from `state.blockTimings`; absent
 *     entries leave `durationStr` null and the view renders a dash.
 *
 * The oneRMLookup is injectable so unit tests can run without IDB; in
 * production it defaults to DB.OneRM.get via a lazy dynamic import (so
 * importing this module from tests doesn't pull the DB layer in).
 *
 * @param {object} state                            current workout State
 * @param {number} durationMs                       wall-clock session length
 * @param {object} [opts]
 * @param {(name:string)=>Promise<{value:number}|undefined>} [opts.oneRMLookup]
 * @returns {Promise<object>} summaryData per the contract in workout.view/summary.js
 */
export async function buildSessionSummary(state, durationMs, opts = {}) {
  const oneRMLookup = opts.oneRMLookup || (async (name) => {
    const { DB } = await import('./db.js');
    return DB.OneRM.get(name);
  });

  // Duration string — matches the existing format used by completeSession.
  const mins = Math.max(0, Math.floor((durationMs || 0) / 60000));
  const hrs = Math.floor(mins / 60);
  const timeStr = hrs > 0 ? `${hrs}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;

  // Single pass over State.plan, preserving insertion order via blockOrder.
  const blockOrder = [];
  const blockMap = new Map();
  let totalTonnage = 0;
  let totalReps = 0;
  /** @type {Array<{name:string,weight:number,reps:number,estimate:number}>} */
  const prCandidates = [];

  for (const ex of (state.plan || [])) {
    const id = ex.block || 'custom';
    if (!blockMap.has(id)) {
      blockMap.set(id, { tonnage: 0, exercises: [] });
      blockOrder.push(id);
    }
    const blk = blockMap.get(id);

    const doneSets = ex.sets.filter((s) => s.done).length;
    const totalSets = ex.sets.length;
    const mul = ex.isUnilateral ? 2 : 1;

    let exTonnage = 0;
    for (const s of ex.sets) {
      if (s.done) {
        exTonnage += (s.weight || 0) * (s.reps || 0) * mul;
        totalReps += (s.reps || 0);
      }
    }
    if (!ex.noDb) {
      blk.tonnage += exTonnage;
      totalTonnage += exTonnage;
    }

    const completed = ex.sets.filter((s) => s.done && s.weight && s.reps);
    const bestSet = completed.sort((a, b) => b.weight - a.weight)[0];
    const weightStr = bestSet
      ? (ex.isBW ? `BW${bestSet.weight ? '+' + bestSet.weight : ''}` : `${bestSet.weight} kg`)
      : (ex.isBW ? 'BW' : '—');

    blk.exercises.push({
      name: ex.name,
      doneSets,
      totalSets,
      weightStr,
      noDb: !!ex.noDb,
    });

    // Camera 4 never updates 1RM and can't earn PRs.
    if (!ex.noDb && bestSet) {
      // Epley inline — kept in lockstep with DB.OneRM.epley to avoid any
      // estimator drift between PR detection and the eventual store update.
      const estimate = bestSet.reps === 1
        ? bestSet.weight
        : Math.round(bestSet.weight * (1 + bestSet.reps / 30));
      prCandidates.push({ name: ex.name, weight: bestSet.weight, reps: bestSet.reps, estimate });
    }
  }

  // PR detection — single lookup per exercise.
  const prs = [];
  for (const c of prCandidates) {
    const existing = await oneRMLookup(c.name);
    if (!existing || c.estimate > existing.value) {
      prs.push({ name: c.name, weight: c.weight, reps: c.reps });
    }
  }

  // Block list with optional timings from State.blockTimings (W-2-A).
  const blocks = blockOrder.map((id) => {
    const blk = blockMap.get(id);
    let durationStr = null;
    const t = state.blockTimings && state.blockTimings[id];
    if (t && t.startedAt && t.endedAt && t.endedAt > t.startedAt) {
      const blkMin = Math.round((t.endedAt - t.startedAt) / 60000);
      if (blkMin > 0) durationStr = `${blkMin}m`;
    }
    return {
      id,
      label: (BLOCK_LABEL[id] || id).toUpperCase(),
      durationStr,
      tonnage: blk.tonnage,
      exercises: blk.exercises,
    };
  });

  return { type: state.type, timeStr, totalTonnage, totalReps, blocks, prs };
}
