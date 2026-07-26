'use strict';
import { State } from './workout.store.js';
import { haptic } from './shared/utils.js';

/* ════════════════════════════════════════════════════════
   shell.js — Athlete Pro  |  Nav + Toast as ES Module exports
   ════════════════════════════════════════════════════════ */

let _current = 's-home';
const _handlers = {};
let _transitionQueue = Promise.resolve();

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
 * @param {{ force?: boolean, fromPop?: boolean }} [opts] — force:true re-runs the screen handler even if already on that screen (recovers blank UI / desync); fromPop:true = triggered by popstate, must not push a new history entry
 * @returns {Promise<void>}
 */
async function go(id, opts = {}) {
  if (id === _current && !opts.force) return;
  haptic(10);
  if (!opts.fromPop && history.state?.screen !== id) {
    history.pushState({ screen: id }, '');
  }

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

  // Serialize transitions: startViewTransition aborts if a previous one is
  // still running, which desyncs .out/.active classes across screens on
  // rapid/overlapping go() calls (e.g. boot-time navigation chains).
  const run = () => {
    if (!document.startViewTransition) return performNav();
    const transition = document.startViewTransition(() => performNav());
    return transition.finished.catch(() => {});
  };
  _transitionQueue = _transitionQueue.then(run, run);
  await _transitionQueue;
}

export const Nav = { on, go, current: () => _current };

/* Системная «назад» (Android back / iOS edge-swipe): каждый переход кладёт
   запись в history, popstate возвращает на предыдущий экран вместо выхода
   из PWA. Корневая запись — replaceState, поэтому «назад» на s-home
   закрывает приложение (ожидаемое поведение). */
if (!history.state?.screen) {
  history.replaceState({ screen: _current }, '');
}
window.addEventListener('popstate', (e) => {
  const screen = e.state?.screen;
  if (screen && document.getElementById(screen)) {
    go(screen, { fromPop: true });
  }
});

/* ════════════════════════════════════════════════
   TOAST SYSTEM (Elite v2)
   ════════════════════════════════════════════════ */

const ICONS = {
  success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

const MAX_TOASTS = 3; // never stack more than this over the content (0-4)
const escHtml = (s) => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _live = (wrap) => [...wrap.children].filter(el => !el._dismissing);

function _dismiss(t) {
  if (!t || t._dismissing) return;
  t._dismissing = true;
  clearTimeout(t._toastTimer);
  t.classList.add('out');
  setTimeout(() => t.remove(), 400);
}

/**
 * Show a premium toast notification. De-duplicates an identical message that is
 * still on screen (restarts its timer instead of stacking) and caps the visible
 * stack at MAX_TOASTS, dismissing the oldest beyond that.
 * @param {string} msg
 * @param {'success'|'error'|'info'} [type='info']
 * @param {number} [duration=3000]
 * @param {{action?: {label: string, onClick: Function}}} [opts]
 */
function show(msg, type = 'info', duration = 3000, opts = {}) {
  const text = String(msg);

  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }

  // Dedup: same type+message already up → just restart its dismissal timer.
  const key = `${type} ${text}`;
  const dup = _live(wrap).find(el => el._toastKey === key);
  if (dup) {
    if (!opts.action) {
      clearTimeout(dup._toastTimer);
      dup.classList.remove('out');
      dup._toastTimer = setTimeout(() => _dismiss(dup), duration);
    }
    haptic(5);
    return;
  }

  if (type === 'error') haptic([20, 50, 20]);
  else if (type === 'success') haptic(15);
  else haptic(5);

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t._toastKey = key;
  t.innerHTML = `<span class="toast-chip">${ICONS[type] || ICONS.info}</span><span class="toast-msg">${escHtml(text)}</span>`;
  if (opts.action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', () => {
      opts.action.onClick();
      _dismiss(t);
    });
    t.appendChild(btn);
  }
  wrap.appendChild(t);

  // Cap the visible stack — push out the oldest beyond the limit.
  const live = _live(wrap);
  for (let i = 0; i < live.length - MAX_TOASTS; i++) _dismiss(live[i]);

  // duration 0 = persists until tapped (update prompts must not vanish);
  // any positive duration auto-dismisses, action button or not — soft
  // nudges (backup reminder) should leave on their own.
  if (duration > 0) {
    t._toastTimer = setTimeout(() => _dismiss(t), duration);
  }
}

export const Toast = { show };
