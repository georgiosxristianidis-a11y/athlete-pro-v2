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
      if (Workout.init()) {
        document.getElementById('s-home')?.classList.remove('active');
        document.getElementById('s-train')?.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.nav-btn[data-s="s-train"]')?.classList.add('active');
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
import('./claude.view.js').then(({ Claude, renderRegenerateButton }) => {
  window.Claude = Claude;
  Claude.renderFAB();
  // Render regenerate button (hidden by default, shown when plan exists)
  if (renderRegenerateButton) {
    renderRegenerateButton();
  }
});

/* ── New User Onboarding — AI Program Generation ── */
(async function _checkNewUserOnboarding() {
  const workoutStore = await import('./workout.store.js');
  const claudeStore = await import('./claude.store.js');
  const claudeView = await import('./claude.view.js');

  // Check if user needs plan generation
  if (!workoutStore.needsProgramGeneration()) {
    return;
  }

  // Load context from DB
  const [workoutHistory, oneRMs] = await Promise.all([
    DB.Workouts.getAll(),
    DB.OneRM.getAll()
  ]);

  // Generate plan silently in background
  try {
    const plan = await workoutStore.fetchGeneratedPlan({
      workoutHistory: workoutHistory.slice(0, 10),
      oneRMs: oneRMs.slice(0, 5)
    });

    // Auto-accept for new users (no history)
    if (!workoutHistory.length) {
      workoutStore.savePlan(plan);
      Toast.show('🎉 Welcome! Your personalized PPL plan is ready', 'success');
      // Update regenerate button visibility
      if (claudeView.updateRegenerateButton) claudeView.updateRegenerateButton();
    } else {
      // Show preview for users with history
      claudeStore.ClaudeState.generatedPlan = plan;
      claudeView.showPlanPreview(plan);
    }
  } catch (err) {
    console.warn('[_checkNewUserOnboarding] Generation failed:', err);
    // Silently use DEFAULT_PLAN
    workoutStore.savePlan(workoutStore.DEFAULT_PLAN);
  }
})();

/* ── Service Worker ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
