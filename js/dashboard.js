// @ts-check
/* ════════════════════════════════════════════════
   dashboard.js — Athlete Pro  |  Dashboard home screen
   ════════════════════════════════════════════════ */

import { DB, weeklyVolumeFrom, monthlyVolumeFrom, weeklyCountFrom, pplTonnageFrom } from './db.js';
import { getRecommendations } from './claude.store.js';

export const Dashboard = (() => {
  const TYPE_COLOR = {
    push: 'var(--c-accent)',
    pull: 'var(--c-purple)',
    legs: 'var(--c-blue)',
  };

  /**
   * Return a time-of-day greeting string.
   * @returns {string}
   */
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /**
   * Format a volume value for compact display (e.g. 1500 → '1.5k').
   * @param {number} kg — volume in kilograms
   * @returns {string}
   */
  function fmtVol(kg) {
    if (kg >= 1000) return (kg / 1000).toFixed(1) + 'k';
    return Math.round(kg).toString();
  }

  /**
   * Compute estimated 1RM deltas for top lifts between current 30d and prior 30d.
   * Returns a map of exerciseName → delta (kg). Only populated when both periods have data.
   * @param {Array<{timestamp: number, exercises: Array}>} allWorkouts
   * @param {Set<string>} liftNames
   * @returns {Object<string, number>}
   */
  function computeLiftDeltas(allWorkouts, liftNames) {
    const now  = Date.now();
    const d30  = now - 30 * 86400000;
    const d60  = now - 60 * 86400000;
    const epley = (w, r) => r === 1 ? w : Math.round(w * (1 + r / 30));

    function bestInPeriod(workouts) {
      const map = {};
      for (const workout of workouts) {
        for (const ex of (workout.exercises || [])) {
          if (!liftNames.has(ex.name)) continue;
          for (const set of (ex.sets || [])) {
            if (!set.done || !set.weight || !set.reps) continue;
            const orm = epley(set.weight, set.reps);
            if (map[ex.name] === undefined || orm > map[ex.name]) map[ex.name] = orm;
          }
        }
      }
      return map;
    }

    const recent     = allWorkouts.filter(w => w.timestamp >= d30);
    const prior      = allWorkouts.filter(w => w.timestamp >= d60 && w.timestamp < d30);
    const recentBest = bestInPeriod(recent);
    const priorBest  = bestInPeriod(prior);

    const deltas = {};
    for (const name of liftNames) {
      if (recentBest[name] !== undefined && priorBest[name] !== undefined) {
        deltas[name] = recentBest[name] - priorBest[name];
      }
    }
    return deltas;
  }

  /**
   * Build the full HTML template for the dashboard screen.
   * @returns {string} — HTML string
   */
  function _buildTemplate() {
    return `
      <!-- Hero -->
      <div class="dash-hero">
        <div>
          <div class="dash-hero-label">Today</div>
          <div class="dash-hero-title" id="dash-greeting-label">${greeting()}</div>
          <div class="dash-hero-date" id="dash-date"></div>
        </div>
        <button class="dash-cta" onclick="Nav.go('s-train',{force:true})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Start
        </button>
      </div>

      <!-- Stat chips -->
      <div class="stat-row">
        <div class="stat-chip">
          <div class="stat-chip-label">Week</div>
          <div class="stat-chip-val sk" id="dash-vol-week">&nbsp;&nbsp;&nbsp;&nbsp;</div>
        </div>
        <div class="stat-chip stat-chip-purple">
          <div class="stat-chip-label">Month</div>
          <div class="stat-chip-val sk" id="dash-vol-month">&nbsp;&nbsp;&nbsp;&nbsp;</div>
        </div>
        <div class="stat-chip stat-chip-blue">
          <div class="stat-chip-label">Sess / wk</div>
          <div class="stat-chip-val sk" id="dash-sessions">&nbsp;&nbsp;</div>
        </div>
      </div>

      <!-- Weekly Summary Chip -->
      <div class="stat-chip weekly-summary-chip" onclick="window.Dashboard.showWeeklySummary()" style="cursor:pointer;margin-top:var(--sp-2)">
        <div class="stat-chip-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div class="stat-chip-content">
          <div class="stat-chip-label">This Week</div>
          <div class="stat-chip-val" id="weekly-summary-value">--</div>
        </div>
      </div>

      <!-- Streak card -->
      <div class="streak-card">
        <div class="streak-header">
          <span class="section-label">This Week</span>
          <span class="streak-count" id="streak-count"></span>
        </div>
        <div class="streak-strip" id="streak-strip"></div>
      </div>

      <!-- PPL split -->
      <div class="section-header">
        <span class="section-label">PPL Split</span>
        <span class="badge badge-accent" id="dash-total"></span>
      </div>
      <div class="ppl-row">
        <div class="ppl-chip">
          <div class="ppl-chip-top">
            <span class="ppl-chip-label">Push</span>
            <span class="ppl-chip-val" id="ppl-push-val">0</span>
          </div>
          <div class="ppl-bar">
            <div class="ppl-bar-fill" id="ppl-push-bar"
                 style="width:0%;background:var(--c-accent)"></div>
          </div>
        </div>
        <div class="ppl-chip">
          <div class="ppl-chip-top">
            <span class="ppl-chip-label">Pull</span>
            <span class="ppl-chip-val" id="ppl-pull-val">0</span>
          </div>
          <div class="ppl-bar">
            <div class="ppl-bar-fill" id="ppl-pull-bar"
                 style="width:0%;background:var(--c-purple)"></div>
          </div>
        </div>
        <div class="ppl-chip">
          <div class="ppl-chip-top">
            <span class="ppl-chip-label">Legs</span>
            <span class="ppl-chip-val" id="ppl-legs-val">0</span>
          </div>
          <div class="ppl-bar">
            <div class="ppl-bar-fill" id="ppl-legs-bar"
                 style="width:0%;background:var(--c-blue)"></div>
          </div>
        </div>
      </div>

      <!-- Top Lifts -->
      <div class="section-header">
        <span class="section-label">Top Lifts</span>
        <span class="badge badge-purple">Estimated 1RM</span>
      </div>
      <div id="dash-orm-list"></div>

      <!-- Recommendations -->
      <div id="recommendations-section" style="display:none;margin-top:var(--sp-2)"></div>

      <!-- Recent sessions -->
      <div class="section-header">
        <span class="section-label">Recent</span>
      </div>
      <div id="recent-list"></div>
    `;
  }

  function _buildEmptyState(showMascot = true) {
    return `
      <div class="empty-dashboard">
        ${showMascot ? `
        <div class="empty-dash-mascot-wrap" id="mascot-draggable">
          <button class="mascot-close-btn" onclick="window.Dashboard.closeMascot()" title="Close mascot">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div class="empty-dash-mascot">
            <video src="assets/panda-idle.mp4" autoplay loop muted playsinline></video>
          </div>
        </div>` : ''}
        <div class="empty-dash-title">Ready to crush it?</div>
        <div class="empty-dash-sub">Your training log is empty. Time to fix that.</div>
        <button class="btn-start-workout" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Start First Workout
        </button>
      </div>`;
  }

  /**
   * Initialize dragging for the mascot.
   */
  function _initMascotDrag() {
    const el = document.getElementById('mascot-draggable');
    if (!el) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mascot-close-btn')) return;
      isDragging = true;
      startX = e.clientX - currentX;
      startY = e.clientY - currentY;
      el.style.transition = 'none';
      el.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      el.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    window.addEventListener('pointerup', () => {
      if (!isDragging) return;
      isDragging = false;
      el.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    });
  }

  /**
   * Close the mascot and persist the setting.
   */
  async function closeMascot() {
    const el = document.getElementById('mascot-draggable');
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.8)';
      setTimeout(() => el.remove(), 400);
    }
    await DB.Settings.set('show-mascot', 'off');
    window.Toast?.show('Mascot hidden', 'info');
  }

  /**
   * Render the 7-day workout streak strip and streak count label.
   * @param {Array<{timestamp: number, type: string}>} workouts — all recorded workouts
   * @returns {void}
   */
  function renderStreak(workouts) {
    const strip = document.getElementById('streak-strip');
    if (!strip) return;

    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cells = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      cells.push(d);
    }

    const workedDays = {};
    workouts.forEach((w) => {
      const d = new Date(w.timestamp);
      d.setHours(0, 0, 0, 0);
      workedDays[d.getTime()] = w.type;
    });

    let streak = 0;
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);
      if (workedDays[d.getTime()]) streak++;
      else if (i > 0) break;
    }

    const el = document.getElementById('streak-count');
    if (el) el.textContent = streak === 1 ? '1 day streak' : `${streak} day streak`;

    strip.innerHTML = cells
      .map((d) => {
        const isToday = d.getTime() === today.getTime();
        const type = workedDays[d.getTime()];
        const hasWork = !!type;
        const color = TYPE_COLOR[type] || '';
        const dayName = days[(d.getDay() + 6) % 7];
        const dotStyle = hasWork ? `background:${color};opacity:0.9` : '';
        const dotClass = ['streak-dot', hasWork ? 'has-workout' : '', isToday ? 'today' : ''].join(
          ' '
        );

        const check = hasWork
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="#000"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="20 6 9 17 4 12"/>
           </svg>`
          : isToday
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)"
               stroke-width="1.5" stroke-linecap="round">
             <circle cx="12" cy="12" r="3"/>
           </svg>`
            : '';

        return `
        <div class="streak-day">
          <span class="streak-day-label">${dayName}</span>
          <div class="${dotClass}" style="${dotStyle}">${check}</div>
        </div>`;
      })
      .join('');
  }

  /**
   * Render the Push/Pull/Legs volume bars with animation.
   * @param {{push: number, pull: number, legs: number}} ppl — tonnage per type
   * @returns {void}
   */
  function renderPPL(ppl) {
    const max = Math.max(ppl.push, ppl.pull, ppl.legs, 1);
    ['push', 'pull', 'legs'].forEach((t) => {
      const val = document.getElementById(`ppl-${t}-val`);
      const bar = document.getElementById(`ppl-${t}-bar`);
      if (val) val.textContent = fmtVol(ppl[t]);
      if (bar) {
        bar.style.width = '0%';
        requestAnimationFrame(() => {
          bar.style.width = Math.round((ppl[t] / max) * 100) + '%';
        });
      }
    });
    const total = document.getElementById('dash-total');
    if (total) {
      const sum = ppl.push + ppl.pull + ppl.legs;
      total.textContent = fmtVol(sum) + ' kg';
    }
  }

  /**
   * Render the top 5 estimated 1RM lifts list with 30-day progress deltas.
   * @param {Array<{id: string, value: number}>} orms — 1RM estimates
   * @param {Array} allWorkouts — full workout history for delta computation
   * @returns {void}
   */
  function renderTopLifts(orms, allWorkouts = []) {
    const el = document.getElementById('dash-orm-list');
    if (!el) return;
    if (!orms.length) {
      el.innerHTML = `<div style="text-align:center;padding:var(--sp-2);
        color:var(--c-text-3);font-size:12px">Complete sets to see 1RM estimates</div>`;
      return;
    }
    const top = [...orms].sort((a, b) => b.value - a.value).slice(0, 5);
    const max = top[0].value;
    const liftNames = new Set(top.map(o => o.id));
    const deltas = computeLiftDeltas(allWorkouts, liftNames);
    el.innerHTML = top
      .map(
        (o, i) => {
          const delta = deltas[o.id];
          const deltaHtml = delta != null
            ? `<span class="orm-delta ${delta >= 0 ? 'orm-delta-up' : 'orm-delta-down'}">${delta >= 0 ? '+' : ''}${delta}kg</span>`
            : '';
          return `
      <div class="orm-row">
        <div class="orm-name">
          <span style="font-size:10px;font-weight:700;color:var(--c-text-3);
            margin-right:6px;font-variant-numeric:tabular-nums">#${i + 1}</span>${o.id}
        </div>
        <div class="orm-val">${o.value}<span class="orm-unit">kg</span>${deltaHtml}</div>
        <div class="orm-bar-wrap">
          <div class="orm-bar-fill" style="width:${Math.round((o.value / max) * 100)}%;
            background:var(--c-purple)"></div>
        </div>
      </div>`;
        }
      )
      .join('');
  }

  /**
   * Render the most recent workout sessions list (up to 5).
   * @param {Array<{timestamp: number, type: string, duration?: number, tonnage: number}>} workouts
   * @returns {void}
   */
  function renderRecent(workouts) {
    const el = document.getElementById('recent-list');
    if (!el) return;

    if (!workouts.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round">
              <circle cx="7" cy="12" r="2.4"/>
              <circle cx="17" cy="12" r="2.4"/>
              <rect x="4.6" y="10.6" width="4.8" height="2.8" rx="1.2"/>
              <rect x="14.6" y="10.6" width="4.8" height="2.8" rx="1.2"/>
              <line x1="9.4" y1="12" x2="14.6" y2="12"/>
              <rect x="11" y="9" width="2" height="6" rx="0.8"/>
            </svg>
          </div>
          <div class="empty-title">No sessions yet</div>
          <div class="empty-desc">Complete your first workout<br>to see it here</div>
        </div>`;
      return;
    }

    el.innerHTML = workouts
      .slice(0, 5)
      .map((w) => {
        const dot = TYPE_COLOR[w.type] || 'var(--c-text-3)';
        const date = new Date(w.timestamp).toLocaleDateString('en', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const dur = w.duration ? ` · ${Math.round(w.duration / 60)}m` : '';
        const type = w.type.charAt(0).toUpperCase() + w.type.slice(1);
        return `
        <div class="session-item">
          <div class="session-dot" style="background:${dot}"></div>
          <div class="session-info">
            <div class="session-title">${type} Day</div>
            <div class="session-meta">${date}${dur}</div>
          </div>
          <div class="session-vol">${fmtVol(w.tonnage)} kg</div>
        </div>`;
      })
      .join('');
  }

  /**
   * Load and render the dashboard home screen.
   * Fetches recent workouts, volume stats, streak data, and renders all sections.
   * @returns {Promise<void>}
   */
  async function load() {
    const screen = document.getElementById('s-home');
    if (!screen) return;

    // Fetch data in parallel — single workouts transaction, derive stats in-memory
    const [allWorkouts, orms, showMascotSetting] = await Promise.all([
      DB.Workouts.getAll(),
      DB.OneRM.getAll(),
      DB.Settings.get('show-mascot').catch(() => 'on'),
    ]);
    const showMascot = showMascotSetting !== 'off';

    // Empty state — first-time user
    if (!allWorkouts.length) {
      screen.innerHTML = _buildEmptyState(showMascot);
      _initMascotDrag();
      screen.querySelector('.btn-start-workout')?.addEventListener('click', () => {
        navigator.vibrate?.([15, 50, 15]);
        window.Toast.show("Let's go!", 'success');
        window.Nav.go('s-train', { force: true });
      });
      return;
    }

    // Build full dashboard if needed
    if (!document.getElementById('dash-greeting-label')) {
      screen.innerHTML = _buildTemplate();
    }

    // Static text
    const greet = document.getElementById('dash-greeting-label');
    if (greet) greet.textContent = greeting();
    const dateEl = document.getElementById('dash-date');
    if (dateEl)
      dateEl.textContent = new Date().toLocaleDateString('en', {
        weekday: 'long', month: 'long', day: 'numeric',
      });

    const weekVol    = weeklyVolumeFrom(allWorkouts);
    const monthVol   = monthlyVolumeFrom(allWorkouts);
    const weekCount  = weeklyCountFrom(allWorkouts);
    const ppl        = pplTonnageFrom(allWorkouts);

    // Stats — remove skeleton class before populating
    const wv = document.getElementById('dash-vol-week');
    const mv = document.getElementById('dash-vol-month');
    const sc = document.getElementById('dash-sessions');
    if (wv) { wv.classList.remove('sk'); wv.innerHTML = fmtVol(weekVol) + '<span class="stat-chip-unit">kg</span>'; }
    if (mv) { mv.classList.remove('sk'); mv.innerHTML = fmtVol(monthVol) + '<span class="stat-chip-unit">kg</span>'; }
    if (sc) { sc.classList.remove('sk'); sc.textContent = weekCount; }

    // Render sections
    renderStreak(allWorkouts);
    renderPPL(ppl);
    renderTopLifts(orms, allWorkouts);
    renderRecent(allWorkouts);
    renderRecommendations();

    // Load weekly summary
    loadWeeklySummary();
  }

  /**
   * Render recommendations card for next session.
   * @returns {void}
   */
  function renderRecommendations() {
    const container = document.getElementById('recommendations-section');
    if (!container) return;

    // Determine next session type based on last workout
    const lastType = localStorage.getItem('ap-last-workout-type');
    if (!lastType) {
      container.style.display = 'none';
      return;
    }

    const nextType = { push: 'pull', pull: 'legs', legs: 'push' }[lastType];
    const recs = getRecommendations(nextType);

    if (!recs || !recs.exercises?.length) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    const progressingExercises = recs.exercises.filter(
      (ex) => ex.recommendedWeight > ex.currentWeight
    );

    if (!progressingExercises.length) {
      container.style.display = 'none';
      return;
    }

    const nextTypeLabel = nextType.charAt(0).toUpperCase() + nextType.slice(1);

    container.innerHTML = `
      <div class="section-header">
        <span class="section-label">Next ${nextTypeLabel} Session</span>
        <span class="badge badge-green">AI Powered</span>
      </div>
      <div class="recommendations-card">
        ${progressingExercises.slice(0, 4).map((ex) => `
          <div class="rec-item">
            <div class="rec-dot" style="background: var(--c-accent)"></div>
            <div class="rec-info">
              <span class="rec-name">${ex.name}</span>
              <span class="rec-reason">${ex.reason}</span>
            </div>
            <div class="rec-weights">
              <span class="rec-old">${ex.currentWeight}kg</span>
              <span class="rec-arrow">→</span>
              <span class="rec-new">${ex.recommendedWeight}kg</span>
            </div>
          </div>
        `).join('')}
        ${progressingExercises.length > 4 ? `<div class="rec-more">+${progressingExercises.length - 4} more</div>` : ''}
      </div>
    `;
  }

  return { load, renderRecommendations, showWeeklySummary, loadWeeklySummary, closeMascot, _initMascotDrag };
})();

/* ══════════════════════════════════════════════
   WEEKLY SUMMARY
   ══════════════════════════════════════════════ */

/**
 * Load and display weekly summary.
 */
async function loadWeeklySummary() {
  const { generateWeeklySummary } = await import('./progressive-overload.js');
  const workouts = await DB.Workouts.getAll();
  const { summary, plateauAlerts, prs } = await generateWeeklySummary(workouts);

  // Update chip
  const chipValue = document.getElementById('weekly-summary-value');
  if (chipValue) {
    if (prs.length > 0) {
      chipValue.textContent = `${prs.length} PR${prs.length > 1 ? 's' : ''}`;
      chipValue.style.color = '#00e676';
    } else if (plateauAlerts.length > 0) {
      chipValue.textContent = `${plateauAlerts.length} plateau${plateauAlerts.length > 1 ? 's' : ''}`;
      chipValue.style.color = '#ff4757';
    } else {
      const since = Date.now() - 7 * 24 * 3600000;
      const count = workouts.filter(w => w.timestamp >= since).length;
      chipValue.textContent = `${count} workout${count !== 1 ? 's' : ''}`;
      chipValue.style.color = 'var(--c-text-1)';
    }
  }

  // Store for modal
  window._weeklySummary = { summary, plateauAlerts, prs };
}

/**
 * Show weekly summary modal.
 */
async function showWeeklySummary() {
  const { summary, plateauAlerts, prs } = window._weeklySummary || {};
  if (!summary) {
    await loadWeeklySummary();
  }

  const data = window._weeklySummary;
  if (!data) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '5000';

  overlay.innerHTML = `
    <div class="modal-sheet" style="max-width:520px;margin:auto;border-radius:var(--r-xl)">
      <div class="modal-handle"></div>

      <div class="section-header">
        <span class="section-label">Weekly Summary</span>
      </div>

      <div class="weekly-summary-content" style="padding:var(--sp-3)">
        <div class="summary-section">
          <h3 style="font-size:0.95rem;color:var(--c-text-2);margin-bottom:var(--sp-2)">Overview</h3>
          <p style="color:var(--c-text-1);line-height:1.5">${data.summary.replace(/\n/g, '<br>')}</p>
        </div>

        ${data.prs.length > 0 ? `
          <div class="summary-section pr-section" style="margin-top:var(--sp-3)">
            <h3 style="font-size:0.95rem;color:#00e676;margin-bottom:var(--sp-2)">Personal Records</h3>
            <ul style="list-style:none;padding:0">
              ${data.prs.map(pr => `<li style="padding:var(--sp-2);background:rgba(0,230,118,0.1);border-radius:var(--r-s);color:#00e676;margin-bottom:var(--sp-2)"><strong>${pr.exercise}</strong>: ${pr.weight}kg</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${data.plateauAlerts.length > 0 ? `
          <div class="summary-section plateau-section" style="margin-top:var(--sp-3)">
            <h3 style="font-size:0.95rem;color:#ff4757;margin-bottom:var(--sp-2)">Plateau Alerts</h3>
            ${data.plateauAlerts.map(alert => `
              <div class="plateau-alert" style="padding:var(--sp-3);background:rgba(255,71,87,0.1);border-radius:var(--r-m);border-left:3px solid #ff4757;margin-bottom:var(--sp-2)">
                <strong style="color:var(--c-text-1);display:block;margin-bottom:4px">${alert.exercise}</strong>
                <p style="color:var(--c-text-2);font-size:0.9rem;margin-bottom:4px">${alert.suggestion}</p>
                <small style="color:var(--c-text-3);font-size:0.8rem">${alert.weeks} weeks since last progress</small>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <div class="modal-footer" style="padding:var(--sp-2) var(--sp-3);display:flex;gap:var(--sp-2);justify-content:flex-end">
        <button class="btn-icon-nav" onclick="window.Dashboard.askAIAboutSummary()" style="align-self:center">Ask Coach</button>
        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

/**
 * Ask AI about weekly summary.
 */
async function askAIAboutSummary() {
  const { summary, plateauAlerts, prs } = window._weeklySummary || {};

  // Open Claude panel with context
  const message = `Analyze my week: ${summary}. ${plateauAlerts.length > 0 ? 'Plateaus: ' + plateauAlerts.map(a => a.exercise).join(', ') : ''} ${prs.length > 0 ? 'PRs: ' + prs.map(p => `${p.exercise} ${p.weight}kg`).join(', ') : ''}`;

  // Send to AI via fetchCoach
  const { fetchCoach } = await import('./claude.store.js');
  const { Claude } = await import('./claude.view.js');

  Claude.open();

  // Wait for panel to open then send message
  setTimeout(async () => {
    await fetchCoach(message, {
      onText: (text) => console.log('[AI]', text),
      onDone: () => {},
      onError: (err) => Toast.show(`Error: ${err}`, 'error')
    });
  }, 500);
}
