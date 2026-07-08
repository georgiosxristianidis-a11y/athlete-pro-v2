// @ts-check
/* ════════════════════════════════════════════════════════
   app.js — Athlete Pro entry point (ES Module)
   Imports all modules, bridges globals for onclick, boots the app
   ════════════════════════════════════════════════════════ */

import './events.js'; // global event-delegation dispatcher (CSP: no inline on*)
import { on } from './events.js';
import { DB, openDB } from './db.js';
import { Timer } from './timer.js';
import { Nav, Toast } from './shell.js';
import { Dashboard } from './dashboard.js';
import { initPrivacy, getPrivacyMode, setPrivacyMode, onPrivacyChange } from './privacy.store.js';
import { Privacy } from './privacy.view.js';
import { DynamicIsland } from './shared/dynamic-island.js';
import { AthleteRoom } from './shared/athlete-room.js';
import { Integrity } from './shared/integrity.js';
import { haptic } from './shared/utils.js';
import { initLocale } from './locale.store.js';

/* ── Lazy-loaded modules ── */
async function _loadWorkout() {
  if (window.Workout) return window.Workout;
  const [WorkoutMod, { RestTimer }, { PlateCalc }] = await Promise.all([
    import('./workout.view.js'),
    import('./rest-timer.js'),
    import('./plate-calc.js'),
  ]);
  const W = WorkoutMod.Workout || WorkoutMod.default || WorkoutMod;
  window.Workout = W;
  window.RestTimer = RestTimer;
  window.PlateCalc = PlateCalc;
  return W;
}

async function _loadProfile() {
  if (window.Profile) return window.Profile;
  const [ProfileMod, { SupabaseCheck }, { renderProfile }] = await Promise.all([
    import('./profile.js'),
    import('./supabase-check.js'),
    import('./profile.view.js'),
  ]);
  const P = ProfileMod.Profile || ProfileMod.default || ProfileMod;
  window.Profile = P;
  window.SupabaseCheck = SupabaseCheck;
  window.ProfileView = { renderProfile };
  return P;
}

async function _loadBodyStats() {
  const mod = await import('./body-stats.js');
  const fn = mod.renderBodyStats || mod.default || mod;
  window.renderBodyStats = fn;
  return fn;
}

async function _loadIntel() {
  if (window.IntelView) return window.IntelView;
  const { IntelView } = await import('./intel.view.js');
  window.IntelView = IntelView;
  return IntelView;
}

/* ── Bridge: expose to window for legacy global handlers + delegation ── */
window.DB = DB;
window.Nav = Nav;
window.Toast = Toast;
window.Timer = Timer;
window.Dashboard = Dashboard;
window.Privacy = Privacy;
window.DynamicIsland = DynamicIsland;
window.AthleteRoom = AthleteRoom;
window._loadWorkout = _loadWorkout;
window._loadProfile = _loadProfile;
window._loadBodyStats = _loadBodyStats;
window._loadIntel = _loadIntel;

/* ── Static-shell delegation (bottom nav + avatar in index.html) ── */
on('nav:go', (el) => window.Nav.go(el.dataset.s, el.dataset.force ? { force: true } : undefined));

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
window.addEventListener('online', () => document.getElementById('di-dot')?.classList.replace('offline', 'online'));
window.addEventListener('offline', () => document.getElementById('di-dot')?.classList.replace('online', 'offline'));


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
  
  // Logic Fix: Indicator is always visible and clickable to open Privacy Menu
  el.style.cursor = 'pointer';
  el.removeAttribute('hidden');
  el.onclick = () => window.Nav.go('s-island-settings');
  el.onpointerdown = (e) => window.PrivacyRapid?.startLongPress(e);
  el.onpointerup = () => window.PrivacyRapid?.cancelLongPress();
  el.onpointerleave = () => window.PrivacyRapid?.cancelLongPress();

  el.classList.remove('mode-cloud', 'mode-anon', 'mode-airgap');
  el.classList.add('mode-' + mode);

  let paths = '';
  if (mode === 'cloud') {
    // Cloud icon (Unlocked / Cloud)
    paths = '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';
  } else if (mode === 'anon') {
    // Anonymous icon (Incognito)
    paths = '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/><line x1="3" y1="3" x2="21" y2="21"/>';
  } else {
    // Air-gap icon (Locked)
    paths = '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
  }

  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    width="11" height="11">${paths}</svg>`;
  
  el.title = mode === 'airgap' ? 'Air-Gapped' : (mode === 'anon' ? 'Anonymous' : 'Cloud Enabled');
}

openDB()
  .then(initPrivacy)
  .then(initLocale)
  .then(() => {
    // Initial UI Setup (Synchronous)
    _renderPrivacyIndicator();
    onPrivacyChange(_renderPrivacyIndicator);

    // Defer non-critical logic to improve boot performance
    const defer = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    defer(() => {
      DynamicIsland.init();
      AthleteRoom.initAvatar().catch(() => {});
      
      /* ── Claude FAB (lazy-loaded) ── */
      import('./claude.view.js').then(({ Claude }) => {
        window.Claude = Claude;
        Claude.renderFAB();
      });
    });
  })
  .then(async () => {
    const { needsOnboarding, showOnboarding } = await import('./onboarding.js');
    if (await needsOnboarding()) await showOnboarding();
  })
  .then(async () => {
    const hasSession = localStorage.getItem('ap-active-session');
    if (hasSession) {
      // Nav.on('s-train') already loads the Workout module and calls
      // Workout.load() — don't call it here too, it double-runs setInterval/
      // event listeners and fires two overlapping view transitions on boot.
      await Nav.go('s-train');
      return;
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

/* ── Navigation Handlers ── */
Nav.on('s-home', () => Dashboard.load());
Nav.on('s-train', async () => {
  const Workout = await _loadWorkout();
  await Workout.load();
});
Nav.on('s-stats', async () => {
  const { Analytics } = await import('./analytics.view.js');
  window.Analytics = Analytics;
  await Analytics.load();
});
Nav.on('s-body', async () => {
  const renderBodyStats = await _loadBodyStats();
  renderBodyStats();
});
Nav.on('s-profile', async () => {
  const Profile = await _loadProfile();
  await Profile.load();
});
Nav.on('s-intel', async () => {
  const IntelView = await _loadIntel();
  await IntelView.load();
});
Nav.on('s-island-settings', async () => {
  const { loadIslandSettings } = await import('./island-settings.view.js');
  loadIslandSettings();
});

on('nav:back', () => history.back());

/* ── Error boundary — F3 ─────────────────────────────────────────────────── */
window.onerror = (_msg, _src, _line, _col, err) => {
  console.error('[error]', err);
  Toast.show('Something went wrong', 'error');
  return false; // let default error reporting proceed
};
// Expected, non-fatal rejections we must NOT surface as user-facing errors:
//  · View Transition aborts (a skipped/interrupted transition rejects with
//    InvalidStateError "Transition was aborted…" — benign by design).
//  · AbortError — cancelled fetches/animations/operations.
//  · Cloud-only modules (sync/supabase) failing to import in air-gapped mode.
function _isBenignRejection(reason) {
  if (!reason) return false;
  const name = reason.name || '';
  const msg = String(reason.message || reason);
  if (name === 'AbortError') return true;
  if (name === 'InvalidStateError' && /transition was aborted/i.test(msg)) return true;
  if (/Failed to fetch dynamically imported module/i.test(msg) &&
      /(sync|supabase)/i.test(msg)) return true;
  return false;
}
window.addEventListener('unhandledrejection', (e) => {
  if (_isBenignRejection(e.reason)) {
    e.preventDefault();                       // keep console + UI clean
    console.debug('[rejection:benign]', e.reason?.name || e.reason);
    return;
  }
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

/* ════════════════════════════════════════════════
   RAPID PRIVACY SWITCHING
   ════════════════════════════════════════════════ */
const PrivacyRapid = (() => {
  let _timer = null;

  async function toggle() {
    haptic([30, 50, 30]);
    window.Nav?.go('s-island-settings');
  }

  function startLongPress(e) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
      toggle();
      _timer = null;
    }, 3000);
  }

  function cancelLongPress() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
  }

  return { toggle, startLongPress, cancelLongPress };
})();
window.PrivacyRapid = PrivacyRapid;

/* ── Service Worker ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // When a new SW takes control, reload once so fresh code/CSS is applied
  // without the user having to clear storage from the Application tab.
  let _swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swReloaded) return;
    _swReloaded = true;
    window.location.reload();
  });
}

/* ── Storage Persistence (Phase 5) ── */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (granted) console.log('[Storage] Persistence granted (Anti-Eviction active)');
  });
}

/* ── Scroll FPS Optimization (Phase 5) ── */
let _scrollTimer;
window.addEventListener('scroll', () => {
  if (!document.body.classList.contains('is-scrolling')) {
    document.body.classList.add('is-scrolling');
  }
  clearTimeout(_scrollTimer);
  _scrollTimer = setTimeout(() => {
    document.body.classList.remove('is-scrolling');
  }, 150);
}, { passive: true, capture: true });
