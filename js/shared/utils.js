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

/**
 * Safely merges two objects to prevent Prototype Pollution.
 * @param {Object} target 
 * @param {Object} source 
 * @returns {Object}
 */
export const safeDeepMerge = (target, source) => {
  if (typeof target !== 'object' || target === null) return target;
  if (typeof source !== 'object' || source === null) return target;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue; // Block prototype pollution vectors
      }
      if (typeof source[key] === 'object' && source[key] !== null) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = Array.isArray(source[key]) ? [] : {};
        }
        safeDeepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
};
