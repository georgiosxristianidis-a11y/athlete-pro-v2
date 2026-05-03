# Next Session Brief — Phase 2.4 done / Phase 3 pending

> Read this first when starting a new Claude session.
> Purpose: re-establish context in 60 seconds without re-reading the codebase.

---

## TL;DR

Phase 2.3 is **complete**. `workout.view.js` was split from 2296 lines into:

| File | Lines |
|---|---:|
| `js/workout.view/render.js` | 595 |
| `js/workout.view/modals.js` | 696 |
| `js/workout.view/handlers.js` | 689 |
| `js/workout.view.js` (barrel) | 142 |

Phase 2.4 (inline-handler audit) completed: 37 `onclick=` across sub-modules — all are `onclick="Workout.foo()"` globals inside template strings. Event delegation refactor deferred (frozen project, no functional benefit).

**Workspace optimization roadmap status:**
- Phase 1 ✅, 2.1 ✅, 2.2 ✅, 2.3 ✅, 2.4 ✅
- Phase 2.5 (split `claude.view.js`) — deferred, not painful yet
- Phase 3 (premium tooling: lint CI, Lighthouse CI) — pending, lower priority

**What's actually left on the branch `2026-04-14-byoi`:**
- PPL Phase 2 (UI polish) and Phase 3 (card-based render) from `2026-04-25-byoi-ppl.md`
- These are feature work, not workspace optimization

---

## Files to read first (in order)

1. **This file**
2. `.planning/phases/2026-04-25-byoi-ppl.md` — feature roadmap (PPL integration phases)
3. `.planning/codebase/MODULES.md` — updated module graph

**Don't read:**
- `js/_archive/*` (legacy)
- `.claude/worktrees/*` (excluded from grep)
- Old phase files

---

## Current module map (workout view)

```
workout.view.js (barrel, 142 lines)
  └─ workout.view/render.js (595)     renderSelect, renderActive, renderExerciseCard,
  │                                    renderSetRow, _initDrag, _coreCheckedState,
  │                                    _renderCoreSection, coach + history helpers
  ├─ workout.view/modals.js (696)     openPlanEditor (closure state machine),
  │                                    _switchPlanTab/Week, _loadPreset,
  │                                    openExercisePickerModal, openReplaceExModal
  └─ workout.view/handlers.js (689)   selectType, steppers, toggleSet, completeSession,
                                       cancelSession, openCustomWorkoutModal,
                                       addSet, _updateLiveStats, _toggleWeek,
                                       _toggleCoreItem, _addCoreItem, _removeCoreItem
```

Dependency order (acyclic): `workout.store.js` ← `render.js` ← `modals.js` ← `handlers.js` ← barrel

---

## PPL Phase 2 — UI Polish (DONE)

All items complete:
- Manrope font global
- `font-variant-numeric: tabular-nums` on all stepper/stat elements
- Hero weight: 60px / 900 / -0.04em on active set weight stepper (OBSIDIAN section, `css/workout.css`)
- State-bar 3px stripe
- Last-session reference line
- `navigator.vibrate(15)` on set check
- `[data-day]` contextual colors (push/pull/legs)

## PPL Phase 3 — UI Level 2 (bigger refactor)

- Card-based exercise rendering (`renderExerciseCard` rewrite)
- Coach pill via `claude.store.js`
- Rest timer pill (replace plate)
- Bottom nav SVG icon polish

**Files to touch:** `js/workout.view/render.js`, `css/workout.css`

---

## What NOT to touch

- `js/_archive/*` — dead code, ignore
- `claude.view.js` — Phase 2.5, deferred
- Don't refactor logic during UI polish — appearance changes only
