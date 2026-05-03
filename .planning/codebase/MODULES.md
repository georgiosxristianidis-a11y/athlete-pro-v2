# Module Dependency Graph

**Generated:** 2026-05-02 (Phase 2.3 — workout.view split)
**Purpose:** Visualize who imports whom. Used by AI assistants and humans to navigate the codebase without reading every file.

---

## Quick reference

- **22 active JS modules** in `js/` (20 from Phase 1 + 3 sub-modules from Phase 2.3 split)
- **Entry point:** `js/app.js` (loaded by `index.html`)
- **Shell:** `js/shell.js` (Nav + Toast)
- **Pattern:** Store/View split — each domain has `*.store.js` (logic) + `*.view.js` (DOM)

---

## Dependency graph

```
index.html
  └─ js/app.js  (entry)
       ├─ db.js  (IndexedDB layer — bottom of stack)
       ├─ timer.js
       ├─ shell.js  (Nav + Toast)
       │    └─ workout.store.js
       └─ dashboard.js
            ├─ db.js
            └─ claude.store.js

  Lazy-loaded by shell.js Nav handlers (dynamic import):
       ├─ workout.view.js  (s-train screen — barrel, ~142 lines)
       │    ├─ timer.js
       │    ├─ rest-timer.js
       │    ├─ workout.store.js
       │    ├─ workout.view/render.js  (renderSelect, renderActive, renderExerciseCard, etc.)
       │    │    ├─ db.js
       │    │    ├─ timer.js
       │    │    ├─ shell.js
       │    │    └─ workout.store.js
       │    ├─ workout.view/modals.js  (openPlanEditor, exercise picker, replace modal)
       │    │    ├─ shell.js
       │    │    ├─ workout.store.js
       │    │    └─ workout.view/render.js
       │    └─ workout.view/handlers.js  (steppers, toggleSet, completeSession, etc.)
       │         ├─ db.js
       │         ├─ timer.js
       │         ├─ shell.js
       │         ├─ workout.store.js
       │         ├─ claude.store.js
       │         ├─ workout.view/render.js
       │         └─ workout.view/modals.js
       ├─ analytics.view.js  (s-stats screen)
       │    └─ db.js
       │    + analytics.store.js  (computation)
       │         └─ db.js
       ├─ body-stats.js  (s-body screen)
       │    └─ db.js
       ├─ profile.js  (s-profile screen)
       │    └─ db.js
       └─ claude.view.js  (Coach overlay)
            ├─ db.js
            └─ claude.store.js

  Helpers (imported as needed):
       ├─ workout-ai.view.js  (in-workout AI bubble)
       │    ├─ claude.store.js
       │    ├─ workout.store.js
       │    └─ db.js
       ├─ progressive-overload.js
       │    └─ db.js
       ├─ rest-timer.js  (no internal deps)
       ├─ plate-calc.js  (no internal deps)
       ├─ supabase.js  (optional cloud sync)
       └─ supabase-check.js
```

---

## Per-module summary

### Foundation layer (no internal deps)

| Module | Lines | Purpose |
|---|---:|---|
| `db.js` | ~530 | IndexedDB wrapper. Stores: Workouts, OneRM, Metrics, Settings, Events. Backup. |
| `timer.js` | ~30 | Session timer (start, restore, fmt) |
| `rest-timer.js` | 180 | Per-set rest countdown with floating bar + modal |
| `plate-calc.js` | 170 | Barbell plate calculator (helper, not yet wired) |
| `supabase-check.js` | 184 | Optional Supabase health check |

### Store layer (state + business logic)

| Module | Lines | Imports |
|---|---:|---|
| `workout.store.js` | ~540 | (foundation only) |
| `claude.store.js` | ~500 | `db.js` |
| `analytics.store.js` | ? | `db.js` |

### View layer (DOM + handlers)

| Module | Lines | Imports |
|---|---:|---|
| `workout.view.js` | 142 (barrel) | re-exports sub-modules + `init()` |
| `workout.view/render.js` | 595 | renderSelect, renderActive, renderExerciseCard, renderSetRow, _initDrag |
| `workout.view/modals.js` | 696 | openPlanEditor (+ closure state machine), exercise picker, replace modal |
| `workout.view/handlers.js` | 689 | steppers, toggleSet, completeSession, cancelSession, core, week toggle |
| `claude.view.js` | ~700 | `db, claude.store` |
| `analytics.view.js` | ~760 | `db` |
| `dashboard.js` | ~600 | `db, claude.store` |
| `body-stats.js` | ~640 | `db` |
| `profile.js` | ~480 | `db` |
| `workout-ai.view.js` | ~400 | `claude.store, workout.store, db` |

> Phase 2.3 complete: `workout.view.js` split into 3 focused sub-modules (no file > 700 lines).

### Special

| Module | Purpose |
|---|---|
| `app.js` | Bootstrap: openDB, restore session, load Dashboard |
| `shell.js` | Navigation router + Toast notifications. Single source of truth for `Nav.go()` |
| `progressive-overload.js` | Progression suggestion logic (currently NOT called — was removed from set-row in Phase 1 polish) |

---

## TS-check coverage audit

> `// @ts-check` on the first line gives JSDoc-based type checking. AI assistants get type hints, IDE catches obvious errors.

**Status: 19 / 19 files covered** ✅ (after Phase 2.1, 2026-04-25)

(Note: `analytics.js`, `claude.js`, `workout.js`, `db-firebase.js` — archived, no longer relevant.)

## Global types — `js/types.d.ts`

Created in Phase 2.2 (2026-04-25). Single declaration file with all domain primitives consumed by `@ts-check`-enabled `.js` files via JSDoc.

**Defined types** (high-level inventory — see file for full):

| Category | Types |
|---|---|
| **Domain primitives** | `WorkoutDay`, `WorkoutPhase`, `WeekMode`, `ToastType`, `Sex` |
| **Plan template** | `PlanExercise`, `Plan`, `PplPreset` |
| **Active session** | `Set`, `SessionExercise`, `Session` |
| **DB records** | `SetRecord`, `ExerciseRecord`, `WorkoutRecord`, `MetricsRecord`, `OneRMRecord` |
| **Library** | `ExerciseLibraryItem` |
| **Settings** | `SettingKey` (string-literal union of all known prefs) |
| **Core checklist** | `CoreChecklist` |
| **Custom workouts** | `CustomWorkout` |
| **Coach** | `CoachTarget`, `MuscleHeatScore` |
| **Window globals** | augmented `Window` interface for inline-handler globals |

**How to reference from `.js`:**
```js
// @ts-check
/** @type {Plan} */
const myPlan = loadPlan();

/** @param {SessionExercise} ex */
function renderCard(ex) { ... }
```

**Maintenance rule:** when adding new domain concept, add to `types.d.ts` first, then reference from `.js`. AI agents reading this graph won't need to grep for types.

---

## Public APIs

> What each module **exports**. Used to know what's safe to call from outside.

### `workout.store.js`
- `State` (mutable global)
- `SESSION_KEY`, `PLAN_KEY`, `PLAN_KEY_A`, `PLAN_KEY_B`, `WEEK_MODE_KEY`, `CORE_KEY`, `CUSTOM_WORKOUTS_KEY`
- `loadPlan(week?)`, `savePlan(plan, week?)`
- `buildSession(type, opts?)`, `persistSession()`, `tryRestoreSession()`
- `getWeekMode()`, `setWeekMode(mode)`
- `loadCoreChecklist(day)`, `saveCoreChecklist(day, items)`
- `getExerciseLibrary()`, `filterExercises(filters)`, `getUniqueValues(field)`, `getExerciseByName(name)`
- `getCustomWorkouts()`, `saveCustomWorkout(w)`, `deleteCustomWorkout(id)`
- `needsProgramGeneration()`, `fetchGeneratedPlan(opts)`
- `PPL_GIO_PLAN`, `CORE_PRESET`, `DEFAULT_PLAN`

### `workout.view.js` → `Workout`
- `init`, `renderSelect`, `renderActive`, `selectType`
- `openPlanEditor`, `openCustomWorkoutModal`, `openReplaceExModal`
- `_loadPreset`, `_savePlanAndClose`, `_switchPlanTab`, `_switchPlanWeek`, `_setPlanSearch`
- `_updatePlanName`, `_adjustPlan`, `_addPlanEx`, `_deletePlanEx`
- `stepWeight`, `stepReps`, `editVal`, `commitVal`, `setRPE`, `toggleSet`, `toggleCard`, `addSet`
- `completeSession`, `cancelSession`
- `_toggleWeek`, `_addLiveExercise`
- `_toggleCoreItem`, `_addCoreItem`, `_removeCoreItem`

### `shell.js`
- `Nav` (`go(id, opts?)`, `current()`)
- `Toast` (`show(msg, type?, duration?)`)

### `claude.view.js` → `Claude`
- `renderFAB`, `open`, `close`, `_sendChat` (private but exposed for onclick)

### `db.js` → `DB`
- `Workouts`, `OneRM`, `Metrics`, `Settings`, `Events`, `Backup`
- `clearAll()`, `openDB()`

---

## Globals on `window` (used by inline `onclick=`)

> Inline handlers need globals. Refactor candidate (Phase 3+).

```
window.Workout         (workout.view.js)
window.Claude          (claude.view.js)
window.WorkoutAI       (workout-ai.view.js)
window.Profile         (profile.js)
window.Analytics       (analytics.view.js)
window.Dashboard       (dashboard.js)
window.bsSwitchTab     (body-stats.js)
window.bsSetSex        (body-stats.js)
window._loadWorkout    (lazy import helper)
window._loadProfile
window._loadBodyStats
window.RestTimer       (rest-timer.js)
window.Toast           (shell.js)
window.Nav             (shell.js)
```

---

## Maintenance rules

1. **Adding a new module?** Update this file's graph + per-module summary in same commit.
2. **Removing/archiving?** Move to `js/_archive/` with a note in `_archive/README.md` — never delete.
3. **Renaming exports?** Update "Public APIs" section.
4. **AI assistants:** read this file first when asked "where is X?" — saves 5-10k tokens vs grep'ing the codebase.

---

Last updated: 2026-04-25 (after Phase 1 cleanup)
