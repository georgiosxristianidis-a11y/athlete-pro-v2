// @ts-check
/* ════════════════════════════════════════════════
   dashboard.js — Athlete Pro  |  Dashboard home screen
   ════════════════════════════════════════════════ */

import { DB, weeklyVolumeFrom, monthlyVolumeFrom, monthlyCountFrom, pplTonnageFrom } from './db.js';

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
        <button class="dash-cta" onclick="Nav.go('s-train')">
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
          <div class="stat-chip-val" id="dash-vol-week">—</div>
        </div>
        <div class="stat-chip stat-chip-purple">
          <div class="stat-chip-label">Month</div>
          <div class="stat-chip-val" id="dash-vol-month">—</div>
        </div>
        <div class="stat-chip stat-chip-blue">
          <div class="stat-chip-label">Sessions</div>
          <div class="stat-chip-val" id="dash-sessions">—</div>
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

      <!-- Recent sessions -->
      <div class="section-header">
        <span class="section-label">Recent</span>
      </div>
      <div id="recent-list"></div>
    `;
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
   * Render the top 5 estimated 1RM lifts list.
   * @param {Array<{id: string, value: number}>} orms — 1RM estimates
   * @returns {void}
   */
  function renderTopLifts(orms) {
    const el = document.getElementById('dash-orm-list');
    if (!el) return;
    if (!orms.length) {
      el.innerHTML = `<div style="text-align:center;padding:var(--sp-2);
        color:var(--c-text-3);font-size:12px">Complete sets to see 1RM estimates</div>`;
      return;
    }
    const top = orms.sort((a, b) => b.value - a.value).slice(0, 5);
    const max = top[0].value;
    el.innerHTML = top
      .map(
        (o, i) => `
      <div class="orm-row">
        <div class="orm-name">
          <span style="font-size:10px;font-weight:700;color:var(--c-text-3);
            margin-right:6px;font-variant-numeric:tabular-nums">#${i + 1}</span>${o.id}
        </div>
        <div class="orm-val">${o.value}<span class="orm-unit">kg</span></div>
        <div class="orm-bar-wrap">
          <div class="orm-bar-fill" style="width:${Math.round((o.value / max) * 100)}%;
            background:var(--c-purple)"></div>
        </div>
      </div>`
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

    // Build HTML template if screen is empty
    if (!document.getElementById('dash-greeting-label')) {
      screen.innerHTML = _buildTemplate();
    }

    // Static text
    const greet = document.getElementById('dash-greeting-label');
    if (greet) greet.textContent = greeting();

    const dateEl = document.getElementById('dash-date');
    if (dateEl)
      dateEl.textContent = new Date().toLocaleDateString('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });

    // Fetch data in parallel — single workouts transaction, derive stats in-memory
    const [allWorkouts, orms] = await Promise.all([
      DB.Workouts.getAll(),
      DB.OneRM.getAll(),
    ]);
    const weekVol    = weeklyVolumeFrom(allWorkouts);
    const monthVol   = monthlyVolumeFrom(allWorkouts);
    const monthCount = monthlyCountFrom(allWorkouts);
    const ppl        = pplTonnageFrom(allWorkouts);

    // Stats
    const wv = document.getElementById('dash-vol-week');
    const mv = document.getElementById('dash-vol-month');
    const sc = document.getElementById('dash-sessions');
    if (wv) wv.innerHTML = fmtVol(weekVol) + '<span class="stat-chip-unit">kg</span>';
    if (mv) mv.innerHTML = fmtVol(monthVol) + '<span class="stat-chip-unit">kg</span>';
    if (sc) sc.textContent = monthCount;

    // Render sections
    renderStreak(allWorkouts);
    renderPPL(ppl);
    renderTopLifts(orms);
    renderRecent(allWorkouts);
  }

  return { load };
})();
