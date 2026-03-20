// @ts-check
/* ════════════════════════════════════════════════════════
   app.js — Athlete Pro entry point (ES Module)
   Imports all modules, bridges globals for onclick, boots the app
   ════════════════════════════════════════════════════════ */

import { DB, openDB } from './db.js';
import { Timer } from './timer.js';
import { Nav, Toast } from './shell.js';
import { Dashboard } from './dashboard.js';
import { Workout } from './workout.view.js';
import { RestTimer } from './rest-timer.js';
import { Profile } from './profile.js';
import { Claude } from './claude.view.js';
import { MUSCLE_MAP, Heatmap } from './claude.store.js';
import { renderBodyStats } from './body-stats.js';
import { PlateCalc } from './plate-calc.js';
import { SupabaseCheck } from './supabase-check.js';

/* ── Bridge: expose to window for onclick="" handlers ── */
window.DB = DB;
window.Nav = Nav;
window.Toast = Toast;
window.Timer = Timer;
window.Dashboard = Dashboard;
window.Workout = Workout;
window.RestTimer = RestTimer;
window.Profile = Profile;
window.Claude = Claude;
window.renderBodyStats = renderBodyStats;
window.PlateCalc = PlateCalc;
window.SupabaseCheck = SupabaseCheck;

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
  .then(() => {
    if (Workout.init()) {
      // Session restored — activate train screen without triggering renderSelect via Nav handler
      document.getElementById('s-home')?.classList.remove('active');
      document.getElementById('s-train')?.classList.add('active');
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.nav-btn[data-s="s-train"]')?.classList.add('active');
    } else {
      Dashboard.load();
    }
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

/* ── Claude FAB ── */
Claude.renderFAB();

/* ── Service Worker ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
