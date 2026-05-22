// @ts-check
/* ════════════════════════════════════════════════════════
   app.js — Athlete Pro entry point (ES Module)
   Imports all modules, bridges globals for onclick, boots the app
   ════════════════════════════════════════════════════════ */

import { DB, openDB } from './db.js';
import { Timer } from './timer.js';
import { Nav, Toast } from './shell.js';
import { Dashboard } from './dashboard.js';
import { initPrivacy, getPrivacyMode, onPrivacyChange } from './privacy.store.js';
import { Privacy } from './privacy.view.js';

/* ── Lazy-loaded modules ── */
async function _loadWorkout() {
  if (window.Workout) return window.Workout;
  const [{ Workout }, { RestTimer }, { PlateCalc }] = await Promise.all([
    import('./workout.view.js'),
    import('./rest-timer.js'),
    import('./plate-calc.js'),
  ]);
  window.Workout = Workout;
  window.RestTimer = RestTimer;
  window.PlateCalc = PlateCalc;
  return Workout;
}

async function _loadProfile() {
  if (window.Profile) return window.Profile;
  const [{ Profile }, { SupabaseCheck }, { renderProfile }] = await Promise.all([
    import('./profile.js'),
    import('./supabase-check.js'),
    import('./profile.view.js'),
  ]);
  window.Profile = Profile;
  window.SupabaseCheck = SupabaseCheck;
  window.ProfileView = { renderProfile };
  return Profile;
}

async function _loadBodyStats() {
  if (window.renderBodyStats) return window.renderBodyStats;
  const { renderBodyStats } = await import('./body-stats.js');
  window.renderBodyStats = renderBodyStats;
  return renderBodyStats;
}

/* ── Bridge: expose to window for onclick="" handlers ── */
window.DB = DB;
window.Nav = Nav;
window.Toast = Toast;
window.Timer = Timer;
window.Dashboard = Dashboard;
window.Privacy = Privacy;
window._loadWorkout = _loadWorkout;
window._loadProfile = _loadProfile;
window._loadBodyStats = _loadBodyStats;

/* ── Clock ── */
const clockEl = document.getElementById('status-time');
function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString('en', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
updateClock();
setInterval(updateClock, 30000);

/* ── Network status ── */
const pill = document.getElementById('status-pill');
const pillText = document.getElementById('status-text');
function setOnline() { pill.className = 'status-pill online'; pillText.textContent = 'Online'; }
function setOffline() { pill.className = 'status-pill offline'; pillText.textContent = 'Offline'; }
window.addEventListener('online', setOnline);
window.addEventListener('offline', setOffline);
if (navigator.onLine) setOnline(); else setOffline();

/* ── Nuke stale service workers & caches (dev-only) ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
}

/* ── Boot — always hides loading screen within 5s ── */
let booted = false;
function hideLoading() {
  if (booted) return;
  booted = true;
  setTimeout(() => {
    document.getElementById('loading')?.classList.add('hidden');
  }, 350);
}

// Force-hide loading after 5s no matter what
const bootTimeout = setTimeout(hideLoading, 5000);

/* ── Privacy indicator wiring ── */
function _renderPrivacyIndicator() {
  const el = document.getElementById('privacy-indicator');
  if (!el) return;
  const mode = getPrivacyMode();
  el.classList.remove('mode-cloud', 'mode-anon', 'mode-airgap');
  el.classList.add('mode-' + mode);
  if (mode === 'cloud') {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const paths = mode === 'anon'
    ? '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/><line x1="3" y1="3" x2="21" y2="21"/>'
    : '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    width="11" height="11">${paths}</svg>`;
  el.title = mode === 'airgap' ? 'Air-Gapped — no network' : 'Anonymous — identifiers stripped';
}

openDB()
  .then(initPrivacy)
  .then(() => {
    _renderPrivacyIndicator();
    onPrivacyChange(_renderPrivacyIndicator);
  })
  .then(async () => {
    const { needsOnboarding, showOnboarding } = await import('./onboarding.js');
    if (await needsOnboarding()) await showOnboarding();
  })
  .then(async () => {
    const hasSession = localStorage.getItem('ap-active-session');
    if (hasSession) {
      const Workout = await _loadWorkout();
      const restored = await Workout.init();
      if (restored) {
        await Nav.go('s-train');
        return;
      }
    }
    Dashboard.load();
  })
  .catch((err) => {
    console.error('[boot] DB failed', err);
    Toast.show('Storage unavailable', 'error');
  })
  .finally(() => {
    clearTimeout(bootTimeout);
    hideLoading();
  });

/* ── Claude FAB (lazy-loaded) ── */
import('./claude.view.js').then(({ Claude }) => {
  window.Claude = Claude;
  Claude.renderFAB();
});

/* ── No auto plan generation — user manages plans manually ── */

/* ── Error boundary — F3 ─────────────────────────────────────────────────── */
window.onerror = (_msg, _src, _line, _col, err) => {
  console.error('[error]', err);
  Toast.show('Something went wrong', 'error');
  return false; // let default error reporting proceed
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason);
  Toast.show('Something went wrong', 'error');
});

/* ── Modal focus trap — F6 ───────────────────────────────────────────────── */
// Selectors for keyboard-reachable elements
const _FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function _trapFocus(overlay) {
  // Store previously focused element for restoration on close
  overlay._prevFocus = document.activeElement;

  // Move focus into the modal on next frame (after DOM paint)
  requestAnimationFrame(() => {
    const els = [...overlay.querySelectorAll(_FOCUSABLE)];
    if (els.length) els[0].focus();
  });

  overlay.addEventListener('keydown', (e) => {
    // Esc closes any modal — consistent UX
    if (e.key === 'Escape') {
      overlay.remove();
      return;
    }
    if (e.key !== 'Tab') return;

    const els = [...overlay.querySelectorAll(_FOCUSABLE)];
    if (!els.length) return;
    const first = els[0];
    const last  = els[els.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  });
}

// Watch document.body for modal-overlay additions / removals
new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (node.nodeType === 1 && node.classList?.contains('modal-overlay')) {
        _trapFocus(node);
      }
    }
    for (const node of mut.removedNodes) {
      if (node.nodeType === 1 && node.classList?.contains('modal-overlay')) {
        node._prevFocus?.focus?.();
      }
    }
  }
}).observe(document.body, { childList: true });

/* ── Service Worker — disabled in development ── */
// To enable for production PWA, uncomment:
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('sw.js').catch(() => {});
// }
