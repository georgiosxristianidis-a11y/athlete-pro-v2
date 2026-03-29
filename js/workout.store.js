// @ts-check
/* ════════════════════════════════════════════════════════
   workout.store.js — Workout state & plan management
   ════════════════════════════════════════════════════════ */

export const SESSION_KEY = 'ap-active-session';
export const PLAN_KEY = 'ap-custom-plan';

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

/** @type {string[]} */
export const EXERCISE_LIBRARY = [
  // Push — Chest
  'Bench Press',
  'Incline Bench Press',
  'Decline Bench Press',
  'Incline DB Press',
  'DB Fly',
  'Cable Fly',
  'Pec Deck',
  'Machine Chest Press',
  // Push — Shoulders
  'Overhead Press',
  'DB Shoulder Press',
  'Arnold Press',
  'Lateral Raise',
  'Front Raise',
  'Cable Lateral Raise',
  'Upright Row',
  // Push — Triceps
  'Tricep Pushdown',
  'Overhead Tricep Ext.',
  'Skull Crusher',
  'Tricep Dip',
  'Close-Grip Bench',
  'Cable Overhead Ext.',
  // Pull — Back
  'Deadlift',
  'Romanian Deadlift',
  'Stiff-Leg Deadlift',
  'Pull-up',
  'Chin-up',
  'Lat Pulldown',
  'Barbell Row',
  'DB Row',
  'Cable Row',
  'T-Bar Row',
  'Seal Row',
  'Meadows Row',
  // Pull — Rear delt / traps
  'Face Pull',
  'Rear Delt Fly',
  'Shrug',
  'Cable Shrug',
  // Pull — Biceps
  'Bicep Curl',
  'Hammer Curl',
  'Preacher Curl',
  'Cable Curl',
  'Incline DB Curl',
  'Concentration Curl',
  'Spider Curl',
  // Legs
  'Squat',
  'Front Squat',
  'Hack Squat',
  'Smith Machine Squat',
  'Leg Press',
  'Bulgarian Split Squat',
  'Walking Lunge',
  'Step-Up',
  'Romanian Deadlift',
  'Sumo Deadlift',
  'Leg Curl',
  'Leg Extension',
  'Calf Raise',
  'Seated Calf Raise',
  'Hip Thrust',
  'Glute Bridge',
  // Core
  'Plank',
  'Side Plank',
  'Hanging Leg Raise',
  'Cable Crunch',
  'Russian Twist',
  'Ab Wheel',
  'Decline Crunch',
  'Mountain Climber',
  'Dragon Flag',
  'Toes-to-Bar',
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
 * Load the user's custom plan from localStorage, or return DEFAULT_PLAN.
 * Falls back to DEFAULT_PLAN if localStorage is unavailable or data is corrupt.
 * @param {boolean} [deepCopy=true] — whether to deep-copy the result to prevent mutation
 * @returns {Object<string, Array<{name: string, sets: number, reps: number, weight: number}>>}
 */
export function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_PLAN));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PLAN));
  }
}

/**
 * Save a custom plan to localStorage.
 * @param {Object<string, Array<{name: string, sets: number, reps: number, weight: number}>>} plan
 * @returns {void}
 */
export function savePlan(plan) {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

/**
 * Build an active workout session from a plan template.
 * @param {'push'|'pull'|'legs'} type
 * @returns {Array<{name: string, sets: Array<{weight: number, reps: number, rpe: null, done: boolean}>}>}
 */
export function buildSession(type) {
  const plan = loadPlan();
  return (plan[type] || []).map((ex) => ({
    name: ex.name,
    sets: Array.from({ length: ex.sets }, () => ({
      weight: ex.weight,
      reps: ex.reps,
      rpe: null,
      done: false,
    })),
  }));
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
  const response = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workoutHistory: options.workoutHistory || [],
      oneRMs: options.oneRMs || [],
      goals: options.goals || 'strength',
      experience: options.experience || 'intermediate'
    })
  });

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
