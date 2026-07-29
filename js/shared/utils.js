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

class RawString {
  constructor(value) {
    this.value = String(value ?? '');
  }
}

/**
 * Wraps a string to bypass HTML escaping in html tagged templates.
 * @param {any} value
 * @returns {RawString}
 */
export const raw = (value) => new RawString(value);

/**
 * Tagged template literal for safe-by-default HTML rendering.
 * Automatically escapes interpolated variables unless wrapped with raw().
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {string}
 */
export const html = (strings, ...values) => {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val instanceof RawString) {
      result += val.value;
    } else if (Array.isArray(val)) {
      result += val.map(item => item instanceof RawString ? item.value : esc(item)).join('');
    } else {
      result += esc(val);
    }
    result += strings[i + 1];
  }
  return result;
};

let _hasInteracted = false;
if (typeof window !== 'undefined') {
  const _unlock = () => { _hasInteracted = true; window.removeEventListener('pointerdown', _unlock); };
  window.addEventListener('pointerdown', _unlock, { passive: true });
}

/**
 * Triggers a short haptic feedback (vibration) if supported.
 * Falls back to a visual pulse (iOS).
 * @param {number|number[]} pattern 
 * @param {HTMLElement} [elementToPulse=null]
 */
export const haptic = (pattern = 10, elementToPulse = null) => {
  let vibrated = false;
  try {
    if (_hasInteracted && typeof navigator !== 'undefined' && navigator.vibrate) {
      vibrated = navigator.vibrate(pattern);
    }
  } catch (e) {
    // Ignore haptic failures
  }

  // iOS Fallback or if vibrate returned false
  if (!vibrated && _hasInteracted) {
    const el = elementToPulse || document.activeElement || document.body;
    if (el && el !== document) {
      el.classList.remove('ios-haptic-pulse');
      // Trigger reflow
      void el.offsetWidth;
      el.classList.add('ios-haptic-pulse');
      setTimeout(() => el.classList.remove('ios-haptic-pulse'), 150);
    }
  }
};

/**
 * Renders a design-system date-of-birth picker (year/month/day selects) in place of native `<input type="date">`,
 * whose Android UI renders in the system locale regardless of app language.
 * @param {string} dob YYYY-MM-DD or empty
 * @param {boolean} ru
 * @param {string} idPrefix DOM id prefix for the three selects
 * @returns {string}
 */
export const dobSelectsHtml = (dob, ru, idPrefix) => {
  const [y, m, d] = dob ? dob.split('-') : ['', '', ''];
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);
  const months = ru
    ? ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const selStyle = 'height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-weight:700;';
  return `
    <div style="display:grid; grid-template-columns: 1.2fr 1fr 1fr; gap:10px">
      <select id="${idPrefix}-y" style="${selStyle} padding:0 12px;">
        <option value="">${ru ? 'Год' : 'Year'}</option>
        ${years.map(year => `<option value="${year}" ${y === String(year) ? 'selected' : ''}>${year}</option>`).join('')}
      </select>
      <select id="${idPrefix}-m" style="${selStyle} padding:0 8px;">
        <option value="">${ru ? 'Мес' : 'Month'}</option>
        ${months.map((name, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${m === String(i + 1).padStart(2, '0') ? 'selected' : ''}>${name}</option>`).join('')}
      </select>
      <select id="${idPrefix}-d" style="${selStyle} padding:0 12px;">
        <option value="">${ru ? 'День' : 'Day'}</option>
        ${Array.from({ length: 31 }, (_, i) => {
          const val = String(i + 1).padStart(2, '0');
          return `<option value="${val}" ${d === val ? 'selected' : ''}>${i + 1}</option>`;
        }).join('')}
      </select>
    </div>
  `;
};

/**
 * Reads the YYYY-MM-DD value assembled by {@link dobSelectsHtml}. Empty string if all parts unset.
 * @param {string} idPrefix
 * @returns {string}
 */
export const readDobFromSelects = (idPrefix) => {
  const y = /** @type {HTMLSelectElement} */ (document.getElementById(`${idPrefix}-y`))?.value || '';
  const m = /** @type {HTMLSelectElement} */ (document.getElementById(`${idPrefix}-m`))?.value || '';
  const d = /** @type {HTMLSelectElement} */ (document.getElementById(`${idPrefix}-d`))?.value || '';
  if (!y && !m && !d) return '';
  return `${y}-${m}-${d}`;
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
