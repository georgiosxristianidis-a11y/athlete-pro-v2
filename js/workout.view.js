// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view.js — barrel
   Re-exports all public API from sub-modules.
   ════════════════════════════════════════════════════════ */

import { Timer } from './timer.js';
import { RestTimer } from './rest-timer.js'; // eslint-disable-line no-unused-vars
import { State, persistSession, tryRestoreSession } from './workout.store.js';

export { renderSelect, renderActive, renderExerciseCard, renderSetRow, renderFocusMode } from './workout.view/render.js';
export { initDragNumbers } from './ui/drag-number.js';

export {
  openPlanEditor,
  _switchPlanTab,
  _switchPlanWeek,
  _setPlanSearch,
  _loadPreset,
  _closePlanEditor,
  toggleChecklist,
  _savePlanAndClose,
  _updatePlanName,
  _adjustPlan,
  _addPlanEx,
  _deletePlanEx,
  openExercisePickerModal,
  openReplaceExModal,
} from './workout.view/modals.js';

export {
  selectType,
  stepWeight,
  stepReps,
  editVal,
  commitVal,
  setRPE,
  toggleSet,
  toggleCard,
  openCustomWorkoutModal,
  _createNewCustomWorkout,
  _editCustomWorkout,
  _deleteCustomWorkout,
  _startCustomWorkout,
  _startProgram,
  _closeCustomWorkoutModal,
  addSet,
  smartCopy,
  smartCoach,
  completeSession,
  cancelSession,
  _toggleWeek,
  _addLiveExercise,
  _toggleCoreItem,
  _addCoreItem,
  _removeCoreItem,
  _openFocus,
  _closeFocus,
  _focusNext,
  _focusPrev,
  _focusStepW,
  _focusStepR,
  _focusCompleteSet,
  _initFocusLongPress,
} from './workout.view/handlers.js';

/* ════════════════════════════════════════════════════════
   INIT — orchestrator
   ════════════════════════════════════════════════════════ */
import { renderSelect, renderActive } from './workout.view/render.js';

async function init() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistSession();
  });
  window.addEventListener('beforeunload', () => persistSession());
  window.addEventListener('pagehide', () => persistSession());
  setInterval(() => {
    if (State.phase === 'active') persistSession();
  }, 8000);

  const restored = tryRestoreSession();
  if (restored) {
    Timer.restore();
    Timer.start((sec) => {
      const el = document.getElementById('session-timer-val');
      if (el) el.textContent = Timer.fmt(sec);
    });
    await renderActive();
    window.Toast?.show('Session restored', 'info');
    const { init: initAI } = await import('./workout-ai.view.js');
    initAI();
    return true;
  }
  renderSelect();
  const { init: initAI } = await import('./workout-ai.view.js');
  initAI();
  return false;
}

/* ── Public API (window.Workout) ── */
import {
  openPlanEditor, _switchPlanTab, _switchPlanWeek, _setPlanSearch, _loadPreset,
  _closePlanEditor, toggleChecklist, _savePlanAndClose, _updatePlanName, _adjustPlan,
  _addPlanEx, _deletePlanEx, openExercisePickerModal, openReplaceExModal,
} from './workout.view/modals.js';

import {
  selectType, stepWeight, stepReps, editVal, commitVal, setRPE, toggleSet, toggleCard,
  openCustomWorkoutModal, _createNewCustomWorkout, _editCustomWorkout, _deleteCustomWorkout,
  _startCustomWorkout, _closeCustomWorkoutModal, addSet, completeSession, cancelSession,
  _toggleWeek, _addLiveExercise, _toggleCoreItem, _addCoreItem, _removeCoreItem,
  _openFocus, _closeFocus, _focusNext, _focusPrev,
  _focusStepW, _focusStepR, _focusCompleteSet, _initFocusLongPress,
} from './workout.view/handlers.js';

export const Workout = {
  init,
  renderSelect,
  renderActive,
  selectType,
  openPlanEditor,
  openCustomWorkoutModal,
  _loadPreset,
  _closePlanEditor,
  _savePlanAndClose,
  _switchPlanTab,
  _switchPlanWeek,
  _setPlanSearch,
  _updatePlanName,
  _adjustPlan,
  _addPlanEx,
  _deletePlanEx,
  _createNewCustomWorkout,
  _editCustomWorkout,
  _deleteCustomWorkout,
  _startCustomWorkout,
  _startProgram,
  _closeCustomWorkoutModal,
  toggleChecklist,
  stepWeight,
  stepReps,
  editVal,
  commitVal,
  setRPE,
  toggleSet,
  toggleCard,
  addSet,
  smartCopy,
  smartCoach,
  completeSession,
  cancelSession,
  openReplaceExModal,
  _toggleWeek,
  _addLiveExercise,
  _toggleCoreItem,
  _addCoreItem,
  _removeCoreItem,
  _openFocus,
  _closeFocus,
  _focusNext,
  _focusPrev,
  _focusStepW,
  _focusStepR,
  _focusCompleteSet,
  _initFocusLongPress,
};
