// @ts-check
/* ════════════════════════════════════════════════════════
   gravity-submit.js
   Swipe a set-row downward to mark it done (toggleSet).

   Threshold : 52 px
   Hint      : haptic at 30 px so user feels the "click point"
   Commit    : haptic [10,30,10] + gravity-snap animation + toggleSet
   Cancel    : spring back to y=0
   ════════════════════════════════════════════════════════ */

const THRESHOLD  = 52;
const HINT_PX    = 30;

function _haptic(p) { if (navigator.vibrate) navigator.vibrate(p); }

// Elements that own their own touch handling — skip gravity on them
const SKIP_SELECTOR = '.stepper-val, .stepper-btn, .set-check, input, button';

export function initGravitySubmit() {
  document.querySelectorAll('.set-row:not([data-gravity])').forEach(row => {
    row.setAttribute('data-gravity', '1');
    _attachRow(row);
  });
}

function _attachRow(row) {
  const match = row.id.match(/^set-row-(\d+)-(\d+)$/);
  if (!match) return;
  const ei = parseInt(match[1]);
  const si = parseInt(match[2]);

  let startY    = 0;
  let hintFired = false;
  let active    = false;

  row.addEventListener('pointerdown', e => {
    if (e.target.closest(SKIP_SELECTOR)) return;
    // Skip already-done rows — swipe would just undo, keep checkmark for that
    if (row.classList.contains('set-done')) return;
    startY    = e.clientY;
    hintFired = false;
    active    = true;
    row.setPointerCapture(e.pointerId);
  });

  row.addEventListener('pointermove', e => {
    if (!active) return;
    const dy = Math.max(0, e.clientY - startY); // downward only

    row.style.transform   = `translateY(${Math.min(dy, THRESHOLD + 12)}px)`;
    row.style.opacity     = String(1 - dy / (THRESHOLD * 3));
    row.style.transition  = 'none';

    if (!hintFired && dy >= HINT_PX) {
      hintFired = true;
      _haptic(6);
    }
  });

  row.addEventListener('pointerup', e => {
    if (!active) return;
    active = false;

    const dy = Math.max(0, e.clientY - startY);

    if (dy >= THRESHOLD) {
      _commit(row, ei, si);
    } else {
      _snapBack(row);
    }
  });

  row.addEventListener('pointercancel', () => {
    if (!active) return;
    active = false;
    _snapBack(row);
  });
}

function _commit(row, ei, si) {
  _haptic([10, 30, 10]);
  row.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
  row.style.transform  = 'translateY(64px)';
  row.style.opacity    = '0';

  setTimeout(() => {
    row.style.transition = '';
    row.style.transform  = '';
    row.style.opacity    = '';
    window.Workout?.toggleSet(ei, si);
  }, 180);
}

function _snapBack(row) {
  row.style.transition = 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease';
  row.style.transform  = 'translateY(0)';
  row.style.opacity    = '1';

  setTimeout(() => {
    row.style.transition = '';
    row.style.transform  = '';
    row.style.opacity    = '';
  }, 220);
}
