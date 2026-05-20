// @ts-check
/* ════════════════════════════════════════════════════════
   drag-number.js
   Attaches vertical-drag + tap behaviour to .stepper-val[data-type].

   Weight  (.stepper-val[data-type="w"]):
     drag up/down  → ±2.5 kg per 8 px
     tap           → open direct input

   Reps    (.stepper-val[data-type="r"]):
     drag up/down  → ±1 rep per 14 px
     single tap    → +1
     double tap    → open direct input
     long press    → copy reps from previous set
   ════════════════════════════════════════════════════════ */

const PX_PER_WEIGHT = 8;   // pixels of drag per 2.5 kg step
const PX_PER_REPS   = 14;  // pixels of drag per 1 rep step
const DBL_TAP_MS    = 280; // double-tap window
const LONG_PRESS_MS = 600;

function _haptic(pattern) {
  if (!navigator.vibrate) return;
  navigator.vibrate(pattern);
}

export function initDragNumbers() {
  document.querySelectorAll('.stepper-val[data-type]').forEach(el => {
    if (el._dragInit) return;
    el._dragInit = true;
    _attach(el);
  });
}

function _attach(el) {
  const type  = el.dataset.type;          // 'w' | 'r'
  const ei    = parseInt(el.dataset.ei);
  const si    = parseInt(el.dataset.si);
  const step  = type === 'w' ? 2.5 : 1;
  const pxPer = type === 'w' ? PX_PER_WEIGHT : PX_PER_REPS;

  let startY        = 0;
  let stepsApplied  = 0;
  let moved         = false;
  let active        = false;
  let lastTap       = 0;
  let longTimer     = null;

  el.addEventListener('pointerdown', e => {
    startY       = e.clientY;
    stepsApplied = 0;
    moved        = false;
    active       = true;
    el.setPointerCapture(e.pointerId);

    if (type === 'r' && si > 0) {
      longTimer = setTimeout(() => {
        const prevEl = document.getElementById(`srv-${ei}-${si - 1}`);
        if (!prevEl) return;
        const prevReps = parseInt(prevEl.textContent) || 0;
        const curReps  = parseInt(el.textContent) || 0;
        const diff = prevReps - curReps;
        if (diff !== 0) window.Workout?.stepReps(ei, si, diff, true);
        _haptic([10, 30, 10]);
      }, LONG_PRESS_MS);
    }
  });

  el.addEventListener('pointermove', e => {
    if (!active) return;
    const dy = startY - e.clientY; // up = positive = increase

    if (!moved && Math.abs(dy) < 5) return; // dead zone
    if (!moved) {
      moved = true;
      clearTimeout(longTimer);
      el.classList.add('drag-active');
    }

    const total    = Math.floor(dy / pxPer);
    const newSteps = total - stepsApplied;
    if (newSteps === 0) return;

    stepsApplied = total;
    const delta = newSteps * step;

    // Haptic: deeper on round numbers (weight only)
    if (type === 'w') {
      const next = (parseFloat(el.textContent) || 0) + delta;
      _haptic(next > 0 && next % 10 === 0 ? 15 : 5);
      window.Workout?.stepWeight(ei, si, delta, true);
    } else {
      _haptic(5);
      window.Workout?.stepReps(ei, si, newSteps, true);
    }
  });

  el.addEventListener('pointerup', () => {
    clearTimeout(longTimer);
    active = false;
    el.classList.remove('drag-active');

    if (moved) return; // was a real drag — no tap action

    const now = Date.now();

    if (type === 'r') {
      if (now - lastTap < DBL_TAP_MS) {
        // Double tap: undo the +1 from the first tap, open input
        window.Workout?.stepReps(ei, si, -1, true);
        window.Workout?.editVal('r', ei, si);
      } else {
        // Single tap: +1 immediately
        _haptic(10);
        window.Workout?.stepReps(ei, si, 1);
      }
    } else {
      // Weight: tap opens direct input
      window.Workout?.editVal('w', ei, si);
    }

    lastTap = now;
  });

  el.addEventListener('pointercancel', () => {
    clearTimeout(longTimer);
    active = false;
    el.classList.remove('drag-active');
  });
}
