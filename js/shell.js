'use strict';
import { State } from './workout.store.js';
import { haptic } from './shared/utils.js';

/* ════════════════════════════════════════════════════════
   shell.js — Athlete Pro  |  Nav + Toast as ES Module exports
   ════════════════════════════════════════════════════════ */

let _current = 's-home';
const _handlers = {};

/**
 * Register a screen init handler.
 * @param {string} id 
 * @param {Function} fn 
 */
function on(id, fn) {
  _handlers[id] = fn;
}

/**
 * Navigate to a screen by element ID, hiding the previous screen.
 * @param {string} id — screen element ID (e.g. 's-home', 's-train')
 * @param {{ force?: boolean }} [opts] — force:true re-runs the screen handler even if already on that screen (recovers blank UI / desync)
 * @returns {Promise<void>}
 */
async function go(id, opts = {}) {
  if (id === _current && !opts.force) return;
  haptic(10);

  const performNav = async () => {
    const prev = document.getElementById(_current);
    if (prev) {
      prev.classList.remove('active');
      prev.classList.add('out');
    }
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    const next = document.getElementById(id);
    if (next) {
      next.classList.remove('out');
      next.classList.add('active');
      next.scrollTop = 0;
    }
    document.querySelector(`.nav-btn[data-s="${id}"]`)?.classList.add('active');
    _current = id;
    window.dispatchEvent(new CustomEvent('ap-nav-change', { detail: { id } }));
    const fn = _handlers[id];
    if (fn) await fn();
  };

  if (!document.startViewTransition) {
    await performNav();
  } else {
    document.startViewTransition(() => performNav());
  }
}

export const Nav = { on, go, current: () => _current };

/* ════════════════════════════════════════════════
   TOAST SYSTEM (Elite v2)
   ════════════════════════════════════════════════ */

const ICONS = {
  success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

/**
 * Show a premium toast notification.
 * @param {string} msg 
 * @param {'success'|'error'|'info'} [type='info'] 
 * @param {number} [duration=3000] 
 */
function show(msg, type = 'info', duration = 3000) {
  if (type === 'error') haptic([20, 50, 20]);
  else if (type === 'success') haptic(15);
  else haptic(5);

  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `${ICONS[type] || ICONS.info}<span>${msg}</span>`;
  
  wrap.appendChild(t);

  // Auto-remove
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, duration);
}

export const Toast = { show };
