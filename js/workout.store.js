// @ts-check
/* ════════════════════════════════════════════════════════
   workout.store.js — Workout state & plan management
   ════════════════════════════════════════════════════════ */

export const SESSION_KEY = 'ap-active-session';
export const PLAN_KEY = 'ap-custom-plan';        // legacy — migrated → PLAN_KEY_A on first load
export const PLAN_KEY_A = 'ap-custom-plan-A';
export const PLAN_KEY_B = 'ap-custom-plan-B';
export const WEEK_MODE_KEY = 'ap-week-mode';     // 'A' | 'B'
export const CORE_KEY = 'ap-core-checklist';     // { push:[{name}], pull:[...], legs:[...] }
export const CUSTOM_WORKOUTS_KEY = 'ap-custom-workouts';

/**
 * PPL | GIO preset — Week A/B variants. Block I + II identical; Block III (arms) swaps.
 * Core block is separate (CORE_PRESET) — checklist-only, not in main plan.
 * Legs identical in A/B (no arms in Block III for legs).
 * @type {{ weekA: Object, weekB: Object }}
 */
export const PPL_GIO_PLAN = {
  weekA: {
    push: [
      // Block I — Chest Power
      { name: 'Flat Barbell Bench Press',     sets: 3, reps: 8,  weight: 0 },
      { name: 'Incline Dumbbell Press',        sets: 3, reps: 10, weight: 0 },
      // Block II — Chest Shape
      { name: 'Butterfly Machine',             sets: 3, reps: 12, weight: 0 },
      { name: 'Dips',                          sets: 3, reps: 10, weight: 0 },
      { name: 'Dumbbell Pullover',             sets: 3, reps: 12, weight: 0 },
      // Block III — Biceps (Week A)
      { name: 'Alternating Dumbbell Curls',    sets: 3, reps: 10, weight: 0 },
      { name: 'Hammer Curls',                  sets: 3, reps: 10, weight: 0 },
      { name: 'Preacher Curls',                sets: 3, reps: 12, weight: 0 },
    ],
    pull: [
      // Block I — Back Width
      { name: 'Pull-ups (Weighted)',           sets: 3, reps: 8,  weight: 0 },
      { name: 'Lat Pulldown',                  sets: 3, reps: 10, weight: 0 },
      // Block II — Back Thickness
      { name: 'Chest-Supported T-Bar Row',     sets: 3, reps: 8,  weight: 0 },
      { name: 'Low Block Cable Row',           sets: 3, reps: 10, weight: 0 },
      { name: 'Iso-Lateral Seated Row',        sets: 3, reps: 12, weight: 0, isUnilateral: true },
      // Block III — Triceps + Traps (Week A)
      { name: 'Triceps Rope Pushdown',         sets: 3, reps: 12, weight: 0 },
      { name: 'Overhead Cable Extension',      sets: 3, reps: 12, weight: 0 },
      { name: 'Dumbbell Shrugs',               sets: 3, reps: 12, weight: 0 },
    ],
    legs: [
      // Block I — Heavy
      { name: 'Leg Press',                     sets: 3, reps: 10, weight: 0 },
      { name: 'Barbell Hip Thrust',            sets: 3, reps: 10, weight: 0 },
      // Block II — Isolation
      { name: 'Leg Extensions',                sets: 3, reps: 12, weight: 0 },
      { name: 'Lying Leg Curls',               sets: 3, reps: 10, weight: 0 },
      { name: 'Hip Adductor Machine',          sets: 3, reps: 15, weight: 0 },
      { name: 'Hip Abductor Machine',          sets: 3, reps: 15, weight: 0 },
      { name: 'Standing Calf Raises',          sets: 3, reps: 15, weight: 0 },
      // Block III — Shoulders
      { name: 'Machine Lateral Raises',        sets: 3, reps: 12, weight: 0 },
      { name: 'Wide-Grip Upright Row',         sets: 3, reps: 10, weight: 0 },
      { name: 'Reverse Pec Deck',              sets: 3, reps: 12, weight: 0 },
    ],
  },
  weekB: {
    push: [
      // Block I — Chest Power (same as A)
      { name: 'Flat Barbell Bench Press',     sets: 3, reps: 8,  weight: 0 },
      { name: 'Incline Dumbbell Press',        sets: 3, reps: 10, weight: 0 },
      // Block II — Chest Shape (same as A)
      { name: 'Butterfly Machine',             sets: 3, reps: 12, weight: 0 },
      { name: 'Dips',                          sets: 3, reps: 10, weight: 0 },
      { name: 'Dumbbell Pullover',             sets: 3, reps: 12, weight: 0 },
      // Block III — Triceps focus (Week B swap)
      { name: 'Triceps Rope Pushdown',         sets: 3, reps: 12, weight: 0 },
      { name: 'Overhead Cable Extension',      sets: 3, reps: 12, weight: 0 },
      { name: 'Close-Grip Bench Press',        sets: 3, reps: 10, weight: 0 },
    ],
    pull: [
      // Block I — Back Width (same as A)
      { name: 'Pull-ups (Weighted)',           sets: 3, reps: 8,  weight: 0 },
      { name: 'Lat Pulldown',                  sets: 3, reps: 10, weight: 0 },
      // Block II — Back Thickness (same as A)
      { name: 'Chest-Supported T-Bar Row',     sets: 3, reps: 8,  weight: 0 },
      { name: 'Low Block Cable Row',           sets: 3, reps: 10, weight: 0 },
      { name: 'Iso-Lateral Seated Row',        sets: 3, reps: 12, weight: 0, isUnilateral: true },
      // Block III — Biceps focus + Shrugs stay (Week B swap)
      { name: 'Alternating Dumbbell Curls',    sets: 3, reps: 10, weight: 0 },
      { name: 'Hammer Curls',                  sets: 3, reps: 10, weight: 0 },
      { name: 'Preacher Curls',                sets: 3, reps: 12, weight: 0 },
      { name: 'Dumbbell Shrugs',               sets: 3, reps: 12, weight: 0 },
    ],
    legs: [
      // Identical to Week A — no arms in legs Block III
      { name: 'Leg Press',                     sets: 3, reps: 10, weight: 0 },
      { name: 'Barbell Hip Thrust',            sets: 3, reps: 10, weight: 0 },
      { name: 'Leg Extensions',                sets: 3, reps: 12, weight: 0 },
      { name: 'Lying Leg Curls',               sets: 3, reps: 10, weight: 0 },
      { name: 'Hip Adductor Machine',          sets: 3, reps: 15, weight: 0 },
      { name: 'Hip Abductor Machine',          sets: 3, reps: 15, weight: 0 },
      { name: 'Standing Calf Raises',          sets: 3, reps: 15, weight: 0 },
      { name: 'Machine Lateral Raises',        sets: 3, reps: 12, weight: 0 },
      { name: 'Wide-Grip Upright Row',         sets: 3, reps: 10, weight: 0 },
      { name: 'Reverse Pec Deck',              sets: 3, reps: 12, weight: 0 },
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

/**
 * Get exercise library — loads from exercises-library.json on first call.
 * Falls back to hardcoded list if JSON fails to load.
 * @returns {Promise<ExerciseItem[]>}
 */
export async function getExerciseLibrary() {
  if (_exerciseLibrary) return _exerciseLibrary;

  try {
    const response = await fetch('exercises-library.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    _exerciseLibrary = data.exercises || [];
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
 * Active workout state.
 * @type {{ phase: WorkoutPhase, type: string|null, plan: Array|null, startedAt: number|null, stepDebounce: Object }}
 */
export const State = {
  phase: 'select',
  type: null,
  plan: null,
  startedAt: null,
  stepDebounce: {},
};

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
 * Falls back to DEFAULT_PLAN if no stored plan or data is corrupt.
 * @param {'A'|'B'} [week] — defaults to current week mode
 * @returns {Object<string, Array<{name: string, sets: number, reps: number, weight: number, isUnilateral?: boolean}>>}
 */
export function loadPlan(week) {
  _migrateLegacyPlan();
  const w = week || getWeekMode();
  const key = w === 'B' ? PLAN_KEY_B : PLAN_KEY_A;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_PLAN));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PLAN));
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
 * Build an active workout session from a plan template.
 * Smart-fill: prefills weight from last session for each exercise.
 * If `auto-progress` setting is ON — auto-bumps weight by 2.5kg when conditions are met.
 * @param {'push'|'pull'|'legs'} type
 * @param {{ workouts?: Array, autoProgress?: boolean }} [opts] — pre-fetched history + flag (avoid async DB call)
 * @returns {Array<{name: string, sets: Array<{weight: number, reps: number, rpe: null, done: boolean}>}>}
 */
export function buildSession(type, opts = {}) {
  const plan = loadPlan();
  const workouts = opts.workouts || [];
  const autoProgress = opts.autoProgress !== false; // default ON
  return (plan[type] || []).map((ex) => {
    let weight = ex.weight;
    let bumped = false;
    // Find last completed session of this exercise
    if (workouts.length) {
      const last = [...workouts].reverse().find(w =>
        (w.exercises || []).some(e => e.name === ex.name)
      );
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
      isUnilateral: ex.isUnilateral || false,
      autoBumped: bumped,
      sets: Array.from({ length: ex.sets }, () => ({
        weight: autoProgress ? weight : (workouts.length ? weight : ex.weight),
        reps: ex.reps,
        rpe: null,
        done: false,
      })),
    };
  });
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
  const response = await safeFetch('/api/generate-plan', {
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
