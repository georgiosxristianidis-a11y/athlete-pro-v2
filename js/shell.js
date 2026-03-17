// @ts-check
/* ════════════════════════════════════════════════════════
   shell.js — Athlete Pro  |  Nav + Toast as ES Module exports
   ════════════════════════════════════════════════════════ */

/* ── Navigation ── */
let _current = 's-home';
const _handlers = {
  's-home':    () => window.Dashboard.load(),
  's-train':   () => window.Workout.renderSelect(),
  's-stats':   () => window.Analytics.load(),
  's-body':    () => window.renderBodyStats(),
  's-profile': () => window.Profile.load(),
};

/**
 * Navigate to a screen by element ID, hiding the previous screen.
 * @param {string} id — screen element ID (e.g. 's-home', 's-train')
 * @returns {void}
 */
function go(id) {
  if (id === _current) return;
  document.getElementById(_current)?.classList.remove('active');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.querySelector(`.nav-btn[data-s="${id}"]`)?.classList.add('active');
  _current = id;
  document.getElementById(id).scrollTop = 0;
  _handlers[id]?.();
}

/**
 * Get the currently active screen ID.
 * @returns {string}
 */
function current() {
  return _current;
}

export const Nav = { go, current };

/* ── Toast ── */
const ICONS = {
  success: '<path d="M20 6L9 17l-5-5"/>',
  error:
    '<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>',
};

/**
 * Show a toast notification message.
 * @param {string} msg — message text to display
 * @param {'success'|'error'|'info'} [type='info'] — toast type controls icon and color
 * @param {number} [duration=2800] — display duration in milliseconds
 * @returns {void}
 */
function show(msg, type = 'info', duration = 2800) {
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${ICONS[type] || ICONS.info}</svg>${msg}`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, duration);
}

export const Toast = { show };
