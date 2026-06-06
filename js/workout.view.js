// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view.js — barrel
   Re-exports all public API from sub-modules.
   ════════════════════════════════════════════════════════ */

import { Timer } from './timer.js';
import { RestTimer } from './rest-timer.js'; // eslint-disable-line no-unused-vars
import { State, persistSession, tryRestoreSession } from './workout.store.js';

import { 
  renderSelect, renderActive, renderExerciseCard, renderSetRow, renderFocusMode 
} from './workout.view/render.js';

import { initDragNumbers } from './ui/drag-number.js';

import {
  openPlanEditor, _switchPlanTab, _switchPlanWeek, _setPlanSearch, _loadPreset,
  _closePlanEditor, toggleChecklist, _savePlanAndClose, _updatePlanName, _adjustPlan,
  _addPlanEx, _deletePlanEx, openExercisePickerModal, openReplaceExModal,
} from './workout.view/modals.js';

import {
  selectType, stepWeight, stepReps, editVal, commitVal, setRPE, toggleSet, toggleCard,
  openCustomWorkoutModal, _createNewCustomWorkout, _editCustomWorkout, _deleteCustomWorkout,
  _startCustomWorkout, _startProgram, _closeCustomWorkoutModal, addSet, smartCopy, smartCoach,
  completeSession, cancelSession, _toggleWeek, _addLiveExercise, _toggleCoreItem, _addCoreItem,
  _removeCoreItem, _openFocus, _closeFocus, _focusNext, _focusPrev,
  _focusStepW, _focusStepR, _focusCompleteSet, _initFocusLongPress,
} from './workout.view/handlers.js';

/* ── Public API (window.Workout) ── */

/**
 * Initialize the workout view.
 * @returns {Promise<boolean>} — true if a session was restored
 */
export async function init() {
  console.log('Workout.init() called');
  const screen = document.getElementById('s-train');
  if (!screen) return false;

  // Global error handler for workout screen
  window.addEventListener('unhandledrejection', (event) => {
    if (screen.style.display === 'block') {
      console.warn('Workout Error:', event.reason);
    }
  });

  // Background cleanup
  setInterval(() => {
    if (State.phase === 'active' && Date.now() - (State.startedAt || 0) > 12 * 3600000) {
      console.log('Stale session cleanup');
      cancelSession();
    }
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
  await renderSelect();
  const { init: initAI } = await import('./workout-ai.view.js');
  initAI();
  return false;
}

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

// Expose to window
// @ts-ignore
window.Workout = Workout;

// Named re-exports for module users
export {
  renderSelect, renderActive, renderExerciseCard, renderSetRow, renderFocusMode,
  initDragNumbers,
  openPlanEditor, _switchPlanTab, _switchPlanWeek, _setPlanSearch, _loadPreset,
  _closePlanEditor, toggleChecklist, _savePlanAndClose, _updatePlanName, _adjustPlan,
  _addPlanEx, _deletePlanEx, openExercisePickerModal, openReplaceExModal,
  selectType, stepWeight, stepReps, editVal, commitVal, setRPE, toggleSet, toggleCard,
  openCustomWorkoutModal, _createNewCustomWorkout, _editCustomWorkout, _deleteCustomWorkout,
  _startCustomWorkout, _startProgram, _closeCustomWorkoutModal, addSet, smartCopy, smartCoach,
  completeSession, cancelSession, _toggleWeek, _addLiveExercise, _toggleCoreItem, _addCoreItem,
  _removeCoreItem, _openFocus, _closeFocus, _focusNext, _focusPrev,
  _focusStepW, _focusStepR, _focusCompleteSet, _initFocusLongPress
};
