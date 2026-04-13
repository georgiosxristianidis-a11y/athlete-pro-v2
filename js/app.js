// @ts-check
/* ════════════════════════════════════════════════════════
   app.js — Athlete Pro entry point (ES Module)
   Imports all modules, bridges globals for onclick, boots the app
   ════════════════════════════════════════════════════════ */

import { DB, openDB } from './db.js';
import { Timer } from './timer.js';
import { Nav, Toast } from './shell.js';
import { Dashboard } from './dashboard.js';

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
  const [{ Profile }, { SupabaseCheck }] = await Promise.all([
    import('./profile.js'),
    import('./supabase-check.js'),
  ]);
  window.Profile = Profile;
  window.SupabaseCheck = SupabaseCheck;
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

/* ── Boot ── */
openDB()
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
    setTimeout(() => {
      document.getElementById('loading')?.classList.add('hidden');
    }, 350);
  });

/* ── Claude FAB (lazy-loaded) ── */
import('./claude.view.js').then(({ Claude }) => {
  window.Claude = Claude;
  Claude.renderFAB();
});

/* ── No auto plan generation — user manages plans manually ── */

/* ── Service Worker ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
