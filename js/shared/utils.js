'use strict';

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string|null|undefined} str 
 * @returns {string}
 */
export const esc = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

let _hasInteracted = false;
if (typeof window !== 'undefined') {
  const _unlock = () => { _hasInteracted = true; window.removeEventListener('pointerdown', _unlock); };
  window.addEventListener('pointerdown', _unlock, { passive: true });
}

/**
 * Triggers a short haptic feedback (vibration) if supported.
 * @param {number|number[]} pattern 
 */
export const haptic = (pattern = 10) => {
  try {
    if (_hasInteracted && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // Ignore haptic failures
  }
};
