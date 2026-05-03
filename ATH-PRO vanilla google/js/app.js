// @ts-check
import { DB, openDB } from './db.js';
import { Timer } from './timer.js';
import { Nav, Toast } from './shell.js';
import { Dashboard } from './dashboard.js';
import { SyncEngine } from './sync.js';

async function _loadWorkout() {
  if (window.Workout) return window.Workout;
  const [{ Workout }, { PlateCalc }] = await Promise.all([
    import('./workout.view.js'),
    import('./plate-calc.js'),
  ]);
  window.Workout = Workout;
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

window.DB = DB;
window.Nav = Nav;
window.Toast = Toast;
window.Timer = Timer;
window.Dashboard = Dashboard;
window._loadWorkout = _loadWorkout;
window._loadProfile = _loadProfile;
window._loadBodyStats = _loadBodyStats;

const clockEl = document.getElementById('status-time');
function updateClock() {
  if(clockEl) clockEl.textContent = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
}
updateClock();
setInterval(updateClock, 30000);

const pill = document.getElementById('status-pill');
const pillText = document.getElementById('status-text');
function setOnline() { if(pill) pill.className = 'status-pill online'; if(pillText) pillText.textContent = 'Online'; }
function setOffline() { if(pill) pill.className = 'status-pill offline'; if(pillText) pillText.textContent = 'Offline'; }
window.addEventListener('online', setOnline);
window.addEventListener('offline', setOffline);
if (navigator.onLine) setOnline(); else setOffline();

SyncEngine.init();

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

import('./ai.view.js').then(({ AI }) => {
  window.AI = AI;
  AI.renderFAB();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
