'use strict';
import { State } from './workout.store.js';
import { haptic, listenerGroup } from './shared/utils.js';
import { ensureScreenCss } from './shared/lazy-css.js';

/* ════════════════════════════════════════════════════════
   shell.js — Athlete Pro  |  Nav + Toast as ES Module exports
   ════════════════════════════════════════════════════════ */

let _current = 's-home';
const _handlers = {};
let _transitionQueue = Promise.resolve();

/** Реджект пропущенной view-transition — не ошибка; всё остальное показываем. */
function _swallowSkippedTransition(err) {
  if (err?.name === 'InvalidStateError' || err?.name === 'AbortError') return;
  console.error('[nav] view transition failed', err);
}

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

  // Стили экрана — ДО показа, иначе экран моргнёт нестилизованным (LOAD-1).
  // Здесь, а не внутри performNav: startViewTransition снимает снимок
  // страницы сразу, ждать загрузку внутри колбэка уже поздно.
  await ensureScreenCss(id);

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
    // Браузер вправе пропустить анимацию (страница скрыта, предыдущая транзиция
    // ещё жива на boot-цепочке) — тогда ready/finished реджектятся
    // InvalidStateError/AbortError. DOM при этом обновляется, экран переключается,
    // так что это ожидаемый шум, а не ошибка навигации. Гасим только его; всё
    // прочее остаётся видимым в консоли. Настоящие падения performNav() приходят
    // из updateCallbackDone и пробрасываются вызывающему.
    transition.ready.catch(_swallowSkippedTransition);
    return Promise.all([
      transition.updateCallbackDone,
      transition.finished.catch(_swallowSkippedTransition)
    ]).then(() => {});
  };
  _transitionQueue = _transitionQueue.then(run, run);
  await _transitionQueue;
}

/**
 * Реестр полноэкранных оверлеев. Back/Escape закрывают верхний, который
 * реально перекрывает вьюпорт (elementFromPoint), а не листают экран под ним.
 * В этой карточке подключается только Athlete Room; остальные оверлеи — своими.
 * @typedef {{ id: string, el: Element, close: () => void }} OverlayEntry
 * @type {OverlayEntry[]}
 */
const _overlays = [];
let _popClosing = false;

function _coversViewport(el) {
  if (!el || el.isConnected === false) return false;
  const r = el.getBoundingClientRect?.();
  if (!r || r.width < 1 || r.height < 1) return false;
  const hit = document.elementFromPoint?.(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit) return false;
  return hit === el || (typeof el.contains === 'function' && el.contains(hit));
}

function _topCovering() {
  for (let i = _overlays.length - 1; i >= 0; i--) {
    if (_coversViewport(_overlays[i].el)) return _overlays[i];
  }
  return null;
}

function _dismissCoveringOverlay() {
  const top = _topCovering();
  if (!top) return false;
  _popClosing = true;
  try {
    const i = _overlays.lastIndexOf(top);
    if (i >= 0) _overlays.splice(i, 1);
    top.close();
  } finally {
    _popClosing = false;
  }
  return true;
}

/**
 * Зарегистрировать открытый оверлей: кладёт запись в history, чтобы Back на
 * корневом экране закрыл слой, а не приложение.
 * @param {OverlayEntry} entry
 */
function registerOverlay(entry) {
  if (!entry?.id || !entry.el || typeof entry.close !== 'function') return;
  if (_overlays.some((o) => o.id === entry.id)) return;
  _overlays.push(entry);
  if (history.state?.overlay !== entry.id) {
    history.pushState({ screen: _current, overlay: entry.id }, '');
  }
}

/**
 * Снять оверлей из реестра. Если закрыли не через popstate (кнопка внутри) —
 * pop-аем лишнюю запись, чтобы следующий Back ушёл на предыдущий экран.
 * @param {string} id
 */
function unregisterOverlay(id) {
  const i = _overlays.findLastIndex((o) => o.id === id);
  if (i < 0) return;
  _overlays.splice(i, 1);
  if (!_popClosing && history.state?.overlay === id) history.back();
}

export const Nav = { on, go, current: () => _current, registerOverlay, unregisterOverlay };

/* Системная «назад» (Android back / iOS edge-swipe): каждый переход кладёт
   запись в history, popstate возвращает на предыдущий экран вместо выхода
   из PWA. Корневая запись — replaceState, поэтому «назад» на s-home
   закрывает приложение (ожидаемое поведение). Оверлей в history — отдельная
   запись: первый Back закрывает его, экран под ним не трогает. */
if (!history.state?.screen) {
  history.replaceState({ screen: _current }, '');
}
window.addEventListener('popstate', (e) => {
  if (_dismissCoveringOverlay()) return;
  const screen = e.state?.screen;
  if (screen && document.getElementById(screen)) {
    go(screen, { fromPop: true });
  }
});

/* Escape = тот же первый Back: закрыть перекрывающий оверлей. listenerGroup,
   а не сырой window.addEventListener — иначе краснеет потолок LEAK-1. */
listenerGroup().add('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!_topCovering()) return;
  e.preventDefault();
  history.back();
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
