// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.view.js — Analytics view layer
   Charts, calendar heatmap, DOM rendering
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import {
  CalState,
  calPrev as storePrev,
  calNext as storeNext,
  fetchAllData,
  fetchWeeklyTrend,
  fetchPPLTonnage,
  fmtVol,
  weekLabel,
} from './analytics.store.js';

const TYPE_COLOR = {
  push: '#00e676',
  pull: '#8b5cf6',
  legs: '#2979ff',
};

/* ══════════════════════════════════════════════
   MAIN LOAD
   ══════════════════════════════════════════════ */

/**
 * Load and render the full analytics screen.
 * @returns {Promise<void>}
 */
async function load() {
  const screen = document.getElementById('s-stats');
  if (!screen) return;

  screen.innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">Analytics</div>
        <div class="screen-sub">Performance overview</div>
      </div>
      <div class="badge badge-purple" id="stats-period-badge">Last 30 days</div>
    </div>

    <!-- ── Quick stats row ── -->
    <div class="stat-row" id="stats-quick-row">
      <div class="stat-chip">
        <div class="stat-chip-val" id="an-total-sessions">—</div>
        <div class="stat-chip-label">Sessions</div>
      </div>
      <div class="stat-chip stat-chip-purple">
        <div class="stat-chip-val" id="an-total-vol">—<span class="stat-chip-unit">kg</span></div>
        <div class="stat-chip-label">Total Vol</div>
      </div>
      <div class="stat-chip stat-chip-blue">
        <div class="stat-chip-val" id="an-avg-time">—<span class="stat-chip-unit">m</span></div>
        <div class="stat-chip-label">Avg Time</div>
      </div>
    </div>

    <!-- ── Monthly Calendar Heatmap ── -->
    <div class="section-header">
      <span class="section-label">Monthly Calendar</span>
      <div style="display:flex;align-items:center;gap:var(--sp-1)">
        <button class="btn-icon-nav" id="cal-prev" onclick="Analytics.calPrev()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="14" height="14">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span id="cal-month-label" style="font-size:11px;font-weight:700;
          letter-spacing:0.08em;text-transform:uppercase;color:var(--c-text-2);
          min-width:80px;text-align:center"></span>
        <button class="btn-icon-nav" id="cal-next" onclick="Analytics.calNext()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="14" height="14">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="cal-card" id="cal-card">
      <!-- JS renders calendar -->
    </div>

    <!-- ── Weekly Volume Chart ── -->
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Weekly Volume</span>
      <span class="badge badge-accent" id="an-week-best">—</span>
    </div>
    <div class="chart-card" id="chart-volume">
      <canvas id="cv-volume" height="140"></canvas>
    </div>

    <!-- ── PPL Distribution ── -->
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Split Distribution</span>
    </div>
    <div class="chart-card ppl-dist-card" id="chart-ppl">
      <canvas id="cv-ppl" width="120" height="120"></canvas>
      <div class="ppl-legend" id="ppl-legend"></div>
    </div>

    <!-- ── 1RM Table ── -->
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Estimated 1RM</span>
      <span class="badge badge-purple">Epley</span>
    </div>
    <div id="orm-list"></div>

    <!-- ── Body Weight Trend ── -->
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Body Weight</span>
    </div>
    <div class="chart-card" id="chart-bw">
      <canvas id="cv-bw" height="120"></canvas>
    </div>

    <!-- ── Training Time ── -->
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Training Time</span>
    </div>
    <div class="chart-card" id="chart-time">
      <canvas id="cv-time" height="120"></canvas>
    </div>

    <div style="height:var(--sp-2)"></div>
  `;

  const { workouts, orms, metrics } = await fetchAllData();

  _renderQuickStats(workouts);
  _renderCalendar(workouts);
  const trend = await fetchWeeklyTrend(10);
  _renderVolumeChart(workouts, trend);
  const ppl = await fetchPPLTonnage();
  _renderPPLDonut(workouts, ppl);
  _renderORMList(orms);
  _renderBWChart(metrics);
  _renderTimeChart(workouts);
}

/* ══════════════════════════════════════════════
   QUICK STATS
   ══════════════════════════════════════════════ */

/**
 * Render the quick stats row (sessions, volume, avg time).
 * @param {import('./db.js').WorkoutRecord[]} workouts
 * @returns {void}
 */
function _renderQuickStats(workouts) {
  const since = Date.now() - 30 * 86400000;
  const recent = workouts.filter((w) => w.timestamp >= since);

  const totalVol = recent.reduce((s, w) => s + (w.tonnage || 0), 0);
  const avgMs = recent.length
    ? recent.reduce((s, w) => s + (w.duration || 0), 0) / recent.length
    : 0;

  _set('an-total-sessions', recent.length);
  _set('an-total-vol', fmtVol(totalVol) + '<span class="stat-chip-unit">kg</span>');
  _set('an-avg-time', Math.round(avgMs / 60000) + '<span class="stat-chip-unit">m</span>');
}

/* ══════════════════════════════════════════════
   CALENDAR HEATMAP
   ══════════════════════════════════════════════ */

/**
 * Initialise calendar with workout data and draw.
 * @param {import('./db.js').WorkoutRecord[]} workouts
 * @returns {void}
 */
function _renderCalendar(workouts) {
  CalState.workouts = workouts;
  _drawCalendar();
}

/**
 * Navigate calendar to previous month and redraw.
 * @returns {void}
 */
function calPrev() {
  storePrev();
  _drawCalendar();
}

/**
 * Navigate calendar to next month and redraw.
 * @returns {void}
 */
function calNext() {
  storeNext();
  _drawCalendar();
}

/**
 * Render the calendar grid for the current CalState month.
 * @returns {void}
 */
function _drawCalendar() {
  const card = document.getElementById('cal-card');
  const label = document.getElementById('cal-month-label');
  if (!card) return;

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  if (label) label.textContent = monthNames[CalState.month] + ' ' + CalState.year;

  // Map workout dates for this month
  const workedDays = {};
  CalState.workouts.forEach((w) => {
    const d = new Date(w.timestamp);
    if (d.getFullYear() === CalState.year && d.getMonth() === CalState.month) {
      workedDays[d.getDate()] = { type: w.type, id: w.id };
    }
  });

  const firstDay = new Date(CalState.year, CalState.month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(CalState.year, CalState.month + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === CalState.year && today.getMonth() === CalState.month;

  // Adjust so week starts Monday
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  let html = `
    <div class="cal-day-headers">
      ${dayLabels.map((d) => `<div class="cal-day-hdr">${d}</div>`).join('')}
    </div>
    <div class="cal-grid">`;

  // Empty cells before first day
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const entry = workedDays[d];
    const type = entry?.type || '';
    const wid = entry?.id || 0;
    const isToday = isCurrentMonth && d === today.getDate();
    const color = TYPE_COLOR[type] || '';
    const style = type ? `background:${color}20;border-color:${color}40` : '';
    const dotStyle = type ? `background:${color}` : '';

    html += `
      <div class="cal-cell ${type ? 'has-workout' : ''} ${isToday ? 'cal-today' : ''}"
           style="${style}"
           data-day="${d}" data-type="${type}" data-wid="${wid}">
        <span class="cal-num" style="${isToday ? 'color:var(--c-accent)' : ''}">${d}</span>
        ${type ? `<div class="cal-dot" style="${dotStyle}"></div>` : ''}
      </div>`;
  }

  html += `</div>`;
  card.innerHTML = html;

  // Single delegated listener — more reliable than 31 inline onclicks
  const grid = card.querySelector('.cal-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const cell = /** @type {Element} */ (e.target).closest('.cal-cell');
      if (!cell || cell.classList.contains('empty')) return;
      const day = parseInt(/** @type {HTMLElement} */ (cell).dataset.day);
      const type = /** @type {HTMLElement} */ (cell).dataset.type || '';
      const wid = parseInt(/** @type {HTMLElement} */ (cell).dataset.wid) || 0;
      calDayClick(CalState.year, CalState.month, day, type, wid);
    });
  }
}

/* ══════════════════════════════════════════════
   CALENDAR DAY CLICK — log / remove workout
   ══════════════════════════════════════════════ */

/**
 * Handle click on a calendar day cell.
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @param {string|null} existingType
 * @param {number|null} existingId
 * @returns {void}
 */
function calDayClick(year, month, day, existingType, existingId) {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dateLabel = `${day} ${monthNames[month]} ${year}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '4000';

  const removeBtn = existingType
    ? `
    <button class="cal-pick-remove" id="cal-pick-rm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" width="14" height="14">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/>
      </svg>
      Remove workout
    </button>`
    : '';

  overlay.innerHTML = `
    <div class="modal-sheet" style="padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">Log Workout</div>
        <button class="btn-icon-sm" id="cal-pick-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="cal-pick-date">${dateLabel}</div>
      <div class="cal-pick-grid">
        ${['push', 'pull', 'legs']
          .map(
            (t) => `
          <button class="cal-pick-btn ${existingType === t ? 'active' : ''}"
                  data-type="${t}"
                  style="--pick-color:${TYPE_COLOR[t]}">
            <span class="cal-pick-dot" style="background:${TYPE_COLOR[t]}"></span>
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`
          )
          .join('')}
      </div>
      ${removeBtn}
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  };

  // Pick type
  overlay.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = /** @type {HTMLElement} */ (btn).dataset.type;
      // Remove existing same-day entry if any
      if (existingId) await DB.Workouts.deleteById(existingId);
      // Save new entry at noon on that day
      await DB.Workouts.save({
        type,
        timestamp: new Date(year, month, day, 12, 0, 0).getTime(),
        duration: 0,
        tonnage: 0,
        exercises: [],
        logged: true, // flag: manually logged
      });
      close();
      Analytics.load();
    });
  });

  // Remove
  overlay.querySelector('#cal-pick-rm')?.addEventListener('click', async () => {
    if (existingId) await DB.Workouts.deleteById(existingId);
    close();
    Analytics.load();
  });

  overlay.querySelector('#cal-pick-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

/* ══════════════════════════════════════════════
   CANVAS CHARTS — lightweight, no dependencies
   ══════════════════════════════════════════════ */

/**
 * Render the weekly volume bar chart.
 * @param {import('./db.js').WorkoutRecord[]} workouts
 * @param {Array<{label: string, start: number, end: number, tonnage: number}>} buckets
 * @returns {void}
 */
function _renderVolumeChart(workouts, buckets) {
  const canvas = document.getElementById('cv-volume');
  if (!canvas) return;

  const max = Math.max(...buckets.map((b) => b.tonnage), 1);
  const best = Math.max(...buckets.map((b) => b.tonnage));
  const el = document.getElementById('an-week-best');
  if (el) el.textContent = fmtVol(best) + ' kg best';

  const W = canvas.offsetWidth || 320;
  canvas.width = W * devicePixelRatio;
  canvas.height = 140 * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, W, 140);

  const pad = { t: 20, b: 28, l: 8, r: 8 };
  const bW = (W - pad.l - pad.r) / buckets.length;
  const gap = bW * 0.25;
  const chartH = 140 - pad.t - pad.b;

  buckets.forEach((b, i) => {
    const x = pad.l + i * bW + gap / 2;
    const bw = bW - gap;
    const bh = b.tonnage ? Math.max(4, (b.tonnage / max) * chartH) : 2;
    const y = pad.t + chartH - bh;

    // Bar
    const isMax = b.tonnage === best && best > 0;
    ctx.fillStyle = isMax ? '#00e676' : 'rgba(0,230,118,0.25)';
    _roundRect(ctx, x, y, bw, bh, 3);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(90,96,112,0.8)';
    ctx.font = `600 9px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    const label = weekLabel(b);
    ctx.fillText(label, x + bw / 2, 140 - pad.b + 12);

    // Value on top
    if (b.tonnage > 0) {
      ctx.fillStyle = isMax ? '#00e676' : 'rgba(232,234,237,0.6)';
      ctx.font = `700 9px -apple-system, sans-serif`;
      ctx.fillText(fmtVol(b.tonnage), x + bw / 2, y - 4);
    }
  });
}

/**
 * Render the PPL donut chart.
 * @param {import('./db.js').WorkoutRecord[]} workouts
 * @param {{push: number, pull: number, legs: number}} ppl
 * @returns {void}
 */
function _renderPPLDonut(workouts, ppl) {
  const canvas = document.getElementById('cv-ppl');
  const legend = document.getElementById('ppl-legend');
  if (!canvas) return;

  const total = ppl.push + ppl.pull + ppl.legs;
  canvas.width = 120 * devicePixelRatio;
  canvas.height = 120 * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, 120, 120);

  const cx = 60, cy = 60, r = 46, inner = 28;
  const slices = [
    { label: 'Push', val: ppl.push, color: '#00e676' },
    { label: 'Pull', val: ppl.pull, color: '#8b5cf6' },
    { label: 'Legs', val: ppl.legs, color: '#2979ff' },
  ].filter((s) => s.val > 0);

  if (!slices.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, Math.PI * 2, 0, true);
    ctx.fill();
  } else {
    let start = -Math.PI / 2;
    slices.forEach((s) => {
      const angle = (s.val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = s.color + '30';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.arc(cx, cy, inner, start + angle, start, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      start += angle;
    });
  }

  // Centre label
  ctx.fillStyle = '#e8eaed';
  ctx.font = `700 14px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total > 0 ? fmtVol(total) : '—', cx, cy - 7);
  ctx.fillStyle = 'rgba(90,96,112,0.8)';
  ctx.font = `600 9px -apple-system, sans-serif`;
  ctx.fillText('kg total', cx, cy + 8);

  // Legend
  if (legend) {
    legend.innerHTML = ['push', 'pull', 'legs']
      .map(
        (t) => `
      <div class="ppl-leg-item">
        <div class="ppl-leg-dot" style="background:${TYPE_COLOR[t]}"></div>
        <span class="ppl-leg-label">${t.charAt(0).toUpperCase() + t.slice(1)}</span>
        <span class="ppl-leg-val">${fmtVol(ppl[t])} kg</span>
      </div>`
      )
      .join('');
  }
}

/**
 * Render the 1RM estimates list.
 * @param {import('./db.js').OneRMRecord[]} orms
 * @returns {void}
 */
function _renderORMList(orms) {
  const el = document.getElementById('orm-list');
  if (!el) return;
  if (!orms.length) {
    el.innerHTML = `<div style="text-align:center;padding:var(--sp-3);
      color:var(--c-text-3);font-size:12px">Complete sets to see 1RM estimates</div>`;
    return;
  }
  const sorted = orms.sort((a, b) => b.value - a.value);
  el.innerHTML = sorted
    .map(
      (o) => `
    <div class="orm-row">
      <div class="orm-name">${o.id}</div>
      <div class="orm-val">${o.value}<span class="orm-unit">kg</span></div>
      <div class="orm-bar-wrap">
        <div class="orm-bar-fill" style="width:${Math.min(100, o.value / 3)}%;
          background:var(--c-purple)"></div>
      </div>
    </div>`
    )
    .join('');
}

/**
 * Render the body weight line chart.
 * @param {import('./db.js').MetricsRecord[]} metrics
 * @returns {void}
 */
function _renderBWChart(metrics) {
  const canvas = document.getElementById('cv-bw');
  if (!canvas) return;

  const sorted = metrics.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
  if (sorted.length < 2) {
    _chartEmpty(canvas, 'No body metrics yet');
    return;
  }

  const W = canvas.offsetWidth || 320;
  canvas.width = W * devicePixelRatio;
  canvas.height = 120 * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, W, 120);

  _drawLineChart(ctx, W, 120, sorted.map((m) => m.weight), '#8b5cf6', 'kg');
}

/**
 * Render the training time bar chart.
 * @param {import('./db.js').WorkoutRecord[]} workouts
 * @returns {void}
 */
function _renderTimeChart(workouts) {
  DB.Workouts.weeklyTrend(8).then((buckets) => {
    const canvas = document.getElementById('cv-time');
    if (!canvas) return;

    // Convert duration ms -> minutes per week
    const data = buckets.map((b) => {
      const wks = workouts.filter((w) => w.timestamp >= b.start && w.timestamp < b.end);
      return {
        ...b,
        minutes: Math.round(wks.reduce((s, w) => s + (w.duration || 0), 0) / 60000),
      };
    });

    const W = canvas.offsetWidth || 320;
    canvas.width = W * devicePixelRatio;
    canvas.height = 120 * devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.clearRect(0, 0, W, 120);

    const max = Math.max(...data.map((d) => d.minutes), 1);
    const pad = { t: 8, b: 24, l: 8, r: 8 };
    const bW = (W - pad.l - pad.r) / data.length;
    const gap = bW * 0.3;
    const chartH = 120 - pad.t - pad.b;

    data.forEach((d, i) => {
      const x = pad.l + i * bW + gap / 2;
      const bw = bW - gap;
      const bh = d.minutes ? Math.max(3, (d.minutes / max) * chartH) : 2;
      const y = pad.t + chartH - bh;

      ctx.fillStyle = d.minutes ? 'rgba(41,121,255,0.6)' : 'rgba(41,121,255,0.1)';
      _roundRect(ctx, x, y, bw, bh, 3);
      ctx.fill();

      ctx.fillStyle = 'rgba(90,96,112,0.8)';
      ctx.font = `600 8px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(weekLabel(d), x + bw / 2, 120 - 4);

      if (d.minutes > 0) {
        ctx.fillStyle = 'rgba(232,234,237,0.6)';
        ctx.font = `700 9px -apple-system, sans-serif`;
        ctx.fillText(d.minutes + 'm', x + bw / 2, y - 3);
      }
    });
  });
}

/* ══════════════════════════════════════════════
   CANVAS HELPERS
   ══════════════════════════════════════════════ */

/**
 * Draw a line chart with gradient fill.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {number[]} values
 * @param {string} color
 * @param {string} unit
 * @returns {void}
 */
function _drawLineChart(ctx, W, H, values, color, unit) {
  const pad = { t: 12, b: 16, l: 28, r: 12 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const range = max - min || 1;

  const pts = values.map((v, i) => ({
    x: pad.l + (i / (values.length - 1)) * chartW,
    y: pad.t + chartH - ((v - min) / range) * chartH,
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.lineTo(pts[pts.length - 1].x, pad.t + chartH);
  ctx.lineTo(pts[0].x, pad.t + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Y axis labels
  ctx.fillStyle = 'rgba(90,96,112,0.8)';
  ctx.font = `600 9px -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(Math.round(max) + unit, 0, pad.t + 9);
  ctx.fillText(Math.round(min) + unit, 0, pad.t + chartH);
}

/**
 * Draw an empty state message on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} msg
 * @returns {void}
 */
function _chartEmpty(canvas, msg) {
  const W = canvas.offsetWidth || 320;
  canvas.width = W * devicePixelRatio;
  canvas.height = canvas.height * devicePixelRatio || 120 * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.fillStyle = 'rgba(90,96,112,0.5)';
  ctx.font = `500 12px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, 60);
}

/**
 * Draw a rounded rectangle path on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @returns {void}
 */
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ══════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════ */

/**
 * Set innerHTML of an element by id.
 * @param {string} id
 * @param {string|number} html
 * @returns {void}
 */
function _set(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = String(html);
}

/* ══════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════ */
export const Analytics = { load, calPrev, calNext, calDayClick };
