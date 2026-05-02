/* ════════════════════════════════════════════════════════
   types.d.ts — Athlete Pro global type definitions
   ────────────────────────────────────────────────────────
   Used by all `// @ts-check` enabled modules. JSDoc-style
   types referenced from .js files via `@type` and `@param`.

   This file is a TypeScript declaration file (.d.ts) but the
   project remains pure JavaScript. The types here are READ
   by the TypeScript service running on @ts-check files —
   they don't generate any runtime code.

   ▸ When adding a new domain concept:
       1. Define the type here
       2. Reference it from .js files via /** @type {Plan} */
       3. Update MODULES.md if it crosses module boundaries
   ════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────────
// Domain primitives
// ──────────────────────────────────────────────────────────

/** Day of the PPL split. */
type WorkoutDay = 'push' | 'pull' | 'legs';

/** Phase of the active workout flow (`workout.store.js > State.phase`). */
type WorkoutPhase = 'idle' | 'select' | 'active' | 'done';

/** Active week — A is default, B is the swap variant for arms (Block III). */
type WeekMode = 'A' | 'B';

/** Toast notification severity. */
type ToastType = 'success' | 'error' | 'info';

/** Sex used for Navy body-fat formula. */
type Sex = 'm' | 'f';

// ──────────────────────────────────────────────────────────
// Plan template — what `loadPlan()` returns / `savePlan()` accepts
// ──────────────────────────────────────────────────────────

/**
 * One exercise row inside a plan template.
 * `weight` is the user's PRESCRIBED working weight (not actual performed).
 */
interface PlanExercise {
  name: string;
  sets: number;          // count of sets
  reps: number;          // target reps per set
  weight: number;        // prescribed kg
  isUnilateral?: boolean; // tonnage doubles when true
}

/** Full plan template — three days each with an ordered exercise list. */
interface Plan {
  push: PlanExercise[];
  pull: PlanExercise[];
  legs: PlanExercise[];
}

/** Two-week PPL preset (arms swap between Block III on Push/Pull). */
interface PplPreset {
  weekA: Plan;
  weekB: Plan;
}

// ──────────────────────────────────────────────────────────
// Active session — what `State.plan` holds during a workout
// ──────────────────────────────────────────────────────────

/** A single set in an in-flight session. Mutates as user logs reps. */
interface Set {
  weight: number;
  reps: number;
  rpe: number | null;    // 6-10, optional
  done: boolean;
}

/** An exercise inside an active session — has actual sets being performed. */
interface SessionExercise {
  name: string;
  sets: Set[];
  isUnilateral?: boolean;
  /** AI Smart Progression auto-bumped the starting weight by +2.5kg. */
  autoBumped?: boolean;
}

/** Top-level active workout state. Persisted to localStorage as SESSION_KEY. */
interface Session {
  type: WorkoutDay | null;
  plan: SessionExercise[] | null;
  startedAt: number | null;
  phase: WorkoutPhase;
  /** Debounce map for stepper interactions, keyed by `${field}-${ei}-${si}`. */
  stepDebounce: Record<string, number>;
}

// ──────────────────────────────────────────────────────────
// IndexedDB records — what `db.js` stores and returns
// ──────────────────────────────────────────────────────────

/** A logged set as stored in DB (immutable post-completion). */
interface SetRecord {
  weight: number;
  reps: number;
  rpe: number | null;
  done: boolean;
}

/** A logged exercise inside a completed WorkoutRecord. */
interface ExerciseRecord {
  name: string;
  sets: SetRecord[];
}

/** A completed workout — single row in `bodyMetrics`-style log. */
interface WorkoutRecord {
  id: number;             // auto-increment
  type: WorkoutDay;
  timestamp: number;      // ms epoch
  duration: number;       // ms
  tonnage: number;        // kg total
  exercises: ExerciseRecord[];
}

/** One body-metrics entry. */
interface MetricsRecord {
  id: number;
  weight: number;         // kg
  height: number;         // cm
  bmi: number;
  timestamp: number;
}

/** One 1-rep-max history entry. */
interface OneRMRecord {
  id: string;             // exerciseName-derived
  value: number;          // kg
  timestamp: number;
}

// ──────────────────────────────────────────────────────────
// Exercise library — `exercises-library.json` items
// ──────────────────────────────────────────────────────────

interface ExerciseLibraryItem {
  id: string;
  name: string;
  nameRu: string;
  category: string;       // 'push' | 'pull' | 'legs' | 'core' | etc
  muscleGroup: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  mechanic: string;
  force: string;
  level: string;
  type: string;
  tags: string[];
}

// ──────────────────────────────────────────────────────────
// Settings (DB.Settings store)
// ──────────────────────────────────────────────────────────

/** Known setting keys. Add to this list when introducing a new pref. */
type SettingKey =
  | 'rest-duration'       // seconds, default 90
  | 'haptic'              // 'on' | 'off'
  | 'auto-progress'       // 'on' | 'off' — AI Smart Progress toggle
  | 'weight-unit'         // 'kg' | 'lb'
  | 'sex'                 // 'm' | 'f'
  | 'm-chest'
  | 'm-waist'
  | 'm-hips'
  | 'm-arm-l'
  | 'm-arm-r'
  | 'm-thigh-l'
  | 'm-thigh-r'
  | 'm-neck'
  | 'm-height';

// ──────────────────────────────────────────────────────────
// Core checklist (visual-only, no DB persistence beyond name list)
// ──────────────────────────────────────────────────────────

/** Per-day list of free-text core exercise names. */
type CoreChecklist = {
  [day in WorkoutDay]?: string[];
};

// ──────────────────────────────────────────────────────────
// Custom workouts (user-created templates beyond PPL)
// ──────────────────────────────────────────────────────────

interface CustomWorkout {
  id: string;
  name: string;
  type: WorkoutDay | 'custom';
  exercises: PlanExercise[];
}

// ──────────────────────────────────────────────────────────
// Recommendation / Coach
// ──────────────────────────────────────────────────────────

/**
 * Coach progression suggestion — computed from last session's top set.
 * `target = last × 1.025` rounded to 2.5 kg increment.
 */
interface CoachTarget {
  target: number;         // kg suggested
  last: number;           // kg from last session
}

/** Heat score for muscle-recovery map (0-100, higher = more fatigued). */
interface MuscleHeatScore {
  group: string;
  score: number;
  status: 'fresh' | 'warm' | 'fatigued' | 'heavy';
}

// ──────────────────────────────────────────────────────────
// Window globals (declared so @ts-check files don't complain)
// ──────────────────────────────────────────────────────────

interface Window {
  Workout?: any;
  Claude?: any;
  WorkoutAI?: any;
  Profile?: any;
  Analytics?: any;
  Dashboard?: any;
  RestTimer?: any;
  Toast?: { show: (msg: string, type?: ToastType, duration?: number) => void };
  Nav?: { go: (id: string, opts?: { force?: boolean }) => Promise<void>; current: () => string };
  bsSwitchTab?: (tab: string) => void;
  bsSetSex?: (sex: Sex) => void;
  _loadWorkout?: () => Promise<any>;
  _loadProfile?: () => Promise<any>;
  _loadBodyStats?: () => Promise<any>;
  _planSetSearch?: (q: string) => void;
  renderBodyStats?: () => void;
}
