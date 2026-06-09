// @ts-check
import { Toast } from '../shell.js';

/**
 * #GIO: Elite Integrity Guard
 * Performs runtime self-diagnostics to ensure module methods are intact when loaded.
 */
export const Integrity = (() => {
  const CONTRACTS = {
    Workout: [
      'load', 'renderSelect', 'renderActive', 'selectType', 'showExerciseMenu', 
      'openCustomWorkoutModal', 'completeSession', 'cancelSession', 'toggleSet'
    ],
    Claude: [
      'renderFAB', 'open', 'close', 'dismissFAB'
    ],
    AthleteRoom: [
      'open', 'close', 'switchTab', 'saveStat', 'saveName', 'initAvatar'
    ],
    Analytics: [
      'load', 'calPrev', 'calNext', 'calDayClick'
    ]
  };

  /**
   * Validate all module contracts that are currently present.
   * Skip lazy-loaded modules that haven't been fetched yet.
   * @returns {boolean} - True if all present systems nominal.
   */
  function check() {
    let errors = [];

    for (const [moduleName, methods] of Object.entries(CONTRACTS)) {
      const target = window[moduleName];
      
      // If module isn't loaded yet (lazy), skip it for now. 
      // It will be checked again upon usage or if strictly required.
      if (!target) continue;

      methods.forEach(method => {
        if (typeof target[method] !== 'function') {
          errors.push(`Method [${moduleName}.${method}] is missing or not a function.`);
        }
      });
    }

    if (errors.length > 0) {
      console.error('❌ #GIO: INTEGRITY BREACHED:', errors);
      Toast.show('Integrity error detected in console.', 'error');
      return false;
    }

    return true;
  }

  return { check };
})();
