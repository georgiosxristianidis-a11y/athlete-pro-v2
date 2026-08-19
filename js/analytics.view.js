// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.view.js — Analytics view layer
   Charts, calendar heatmap, DOM rendering
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { esc, haptic } from './shared/utils.js';
import { Spring } from './shared/spring.js';
import {
  CalState,
  calPrev as storePrev,
  calNext as storeNext,
  fetchAllData,
  fetchWeeklyTrend,
  fmtVol,
  weekLabel,
  periodRange,
  loadPeriodPref,
  savePeriodPref,
  PERIOD_DAYS,
  fetchExerciseHistory,
} from './analytics.store.js';
import { pplTonnageFrom } from './db.js';
import { t, isRu } from './locale.store.js';
import { renderStrengthHero, renderStrengthCurves, smoothPath, wireScrub, fmtMon, GOLD } from './analytics.strength-curves.js';
import { renderPplGauge } from './shared/ppl-gauge.js';
import { on } from './events.js';
import { fmtDate, fmtWeight } from './shared/format.js';
import { pplColor, pplColorAlpha, isPplType, PPL_TYPES } from './shared/ppl-color.js';

on('analytics:calPrev',    () => calPrev());
on('analytics:calNext',    () => calNext());
on('analytics:startFirst', () => window.Nav.go('s-train', { force: true }));
on('analytics:periodMenu', () => _openPeriodSheet());
on('analytics:openExercise', (el) => {
  const name = el?.dataset?.exercise;
  if (name) openExerciseHistoryModal(name);
});

// PPL-цвет берётся из токенов темы — см. `js/shared/ppl-color.js` (DS-1).

function svgArrow(dir) {
  const p = {
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
    plus:  '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">${p[dir]}</svg>`;
}

/* ══════════════════════════════════════════════
   MAIN LOAD
   ══════════════════════════════════════════════ */

let _activeTab = 'performance'; // 'performance' | 'measurements'
let _workoutsCache = [];
let _period = 'month';
let _customRange = null;

const PERIOD_LABEL_KEY = {
  week: 'analytics.period_week',
  month: 'analytics.period_month',
  '3month': 'analytics.period_3month',
  custom: 'analytics.period_custom',
};

/**
 * Load and render the full analytics screen.
 * @returns {Promise<void>}
 */
export async function load() {
  const screen = document.getElementById('s-stats');
  if (!screen) return;

  ({ period: _period, customRange: _customRange } = loadPeriodPref());

  screen.innerHTML = `
    <div class="screen-header an-header">
      <div>
        <div class="screen-title">${t('analytics.title')}</div>
        <div class="screen-sub">${t('analytics.sub')}</div>
      </div>
      <button class="btn-preset an-period-btn" id="an-period-btn" data-action="analytics:periodMenu"
              aria-label="${t('analytics.period_title')}">
        <span id="an-period-label">${t(PERIOD_LABEL_KEY[_period])}</span>
        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>
        </svg>
      </button>
    </div>

    <div id="stats-tab-content" class="animate-in">
      <!-- Content injected by load -->
    </div>
  `;

  const container = document.getElementById('stats-tab-content');
  if (!container) return;

  container.innerHTML = `
      <div id="strength-hero" class="stagger-item" style="margin-top:var(--sp-2); animation-delay: 0.03s"></div>

      <div class="stat-row stagger-item" style="margin-top:var(--sp-2); animation-delay: 0.05s">
        <div class="stat-chip">
          <div class="stat-chip-val" id="an-total-sessions">—</div>
          <div class="stat-chip-label">${t('analytics.sessions')}</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-val" id="an-total-vol">—<span class="stat-chip-unit">kg</span></div>
          <div class="stat-chip-label">${t('analytics.total_vol')}</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-val" id="an-avg-time">—<span class="stat-chip-unit">m</span></div>
          <div class="stat-chip-label">${t('analytics.avg_time')}</div>
        </div>
      </div>

      <!-- ── PPL Balance ── -->
      <div class="section-header stagger-item" style="margin-top:var(--sp-3); animation-delay: 0.1s">
        <span class="section-label">${t('analytics.ppl_balance')}</span>
      </div>
      <div class="chart-card stagger-item" id="ppl-gauge-analytics" style="padding:18px 16px 16px; animation-delay: 0.1s"></div>

      <!-- ── Strength Progression (premium per-lift curves) ── -->
      <div class="section-header stagger-item" style="margin-top:var(--sp-4); animation-delay: 0.11s">
        <span class="section-label">${isRu() ? 'Прогресс силы' : 'Strength Progression'}</span>
      </div>
      <div id="strength-curves" class="stagger-item" style="animation-delay: 0.11s"></div>

      <!-- ── Monthly Calendar ── -->
      <div class="chart-card stagger-item" style="padding:16px; margin-top:var(--sp-4); animation-delay: 0.12s;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <div>
            <div id="cal-month-label" style="font-size:var(--fs-3); font-weight:var(--fw-bold); color:var(--c-text-1);">Month Year</div>
            <div style="font-size:var(--fs-1); color:var(--c-text-3); margin-top: 2px;">Workout Heatmap</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-icon-nav" id="cal-prev" data-action="analytics:calPrev" style="background:var(--c-surface-h); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; color:var(--c-text-2); border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="btn-icon-nav" id="cal-next" data-action="analytics:calNext" style="background:var(--c-surface-h); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; color:var(--c-text-2); border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
        <div id="cal-card" class="cal-card"></div>
      </div>

      <div class="section-header stagger-item" style="margin-top:var(--sp-4); animation-delay: 0.15s">
        <span class="section-label">${t('analytics.weekly_progress')}</span>
        <span class="badge badge-accent" id="an-week-best">—</span>
      </div>
      <div class="chart-card stagger-item" style="animation-delay: 0.15s"><canvas id="cv-volume" height="140"></canvas></div>

      <div class="section-header stagger-item" style="margin-top:var(--sp-4); animation-delay: 0.2s">
        <span class="section-label">${t('analytics.est_1rm')}</span>
      </div>
      <div id="orm-list"></div>
      
      <div style="height:40px"></div>
    `;

    const { workouts, orms } = await fetchAllData();

    if (!workouts.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--sp-6) var(--sp-4); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px;">
          <div class="empty-icon-wrap" style="width: 80px; height: 80px; background: var(--c-surface-h); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: var(--sp-3); color: var(--c-accent);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="40" height="40">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z"/>
            </svg>
          </div>
          <div class="empty-title" style="font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--c-text-1); margin-bottom: var(--sp-1);">
            ${t('analytics.empty_title')}
          </div>
          <div class="empty-desc" style="color: var(--c-text-3); max-width: 240px; line-height: 1.4; margin-bottom: var(--sp-4);">
            ${t('analytics.empty_desc')}
          </div>
          <div class="pp-bento-cell pp-bento-glow" style="--bento-color: var(--c-accent); --bento-glow: var(--glow-accent-md); align-items: center; padding: var(--sp-2); margin-top: var(--sp-3);" data-action="analytics:startFirst"><div class="pp-bento-val" style="color: var(--c-accent); font-size: var(--fs-5);">${t('analytics.start_first')}</div></div>
        </div>
      `;
      return;
    }

    _workoutsCache = workouts;
    renderStrengthHero(workouts, document.getElementById('strength-hero'));
    _renderQuickStats();
    _renderPPLBalance();
    renderStrengthCurves(workouts, document.getElementById('strength-curves'));
    _renderCalendar(workouts);
    const trend = await fetchWeeklyTrend(10);
    _renderVolumeChart(workouts, trend);
    _renderORMList(orms);
}

/** Workouts inside the currently selected period (AN-1). */
function _periodWorkouts() {
  const { since, until } = periodRange(_period, _customRange);
  return _workoutsCache.filter((w) => w.timestamp >= since && w.timestamp <= until);
}

function _renderQuickStats() {
  const recent = _periodWorkouts();
  const totalVol = recent.reduce((s, w) => s + (w.tonnage || 0), 0);
  const avgMs = recent.length ? recent.reduce((s, w) => s + (w.duration || 0), 0) / recent.length : 0;
  _set('an-total-sessions', recent.length);
  _set('an-total-vol', fmtVol(totalVol) + '<span class="stat-chip-unit">kg</span>');
  _set('an-avg-time', Math.round(avgMs / 60000) + '<span class="stat-chip-unit">m</span>');
}

function _renderPPLBalance() {
  renderPplGauge(document.getElementById('ppl-gauge-analytics'), pplTonnageFrom(_periodWorkouts()));
}

/** Re-render only the period-scoped blocks (Quick Stats + PPL Balance).
 *  Strength Index/Progression are all-time journeys (curves need ≥3 months
 *  of history to draw at all), the calendar has its own month navigation,
 *  and 1RM records are all-time PRs — filtering those to a week/month
 *  window would make them empty or misleading, so they stay untouched. */
function _applyPeriod(period, customRange = null) {
  _period = period;
  _customRange = customRange;
  savePeriodPref(period, customRange);
  _set('an-period-label', t(PERIOD_LABEL_KEY[period]));
  _renderQuickStats();
  _renderPPLBalance();
  haptic(10);
}

function _renderCalendar(workouts) {
  CalState.workouts = workouts;
  _drawCalendar();
}

/* ══════════════════════════════════════════════
   PERIOD SHEET (AN-1)
   ══════════════════════════════════════════════ */

function _fmtDateInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _openPeriodSheet() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '4000';

  const now = Date.now();
  const fromVal = _fmtDateInput(_customRange?.from ?? now - 30 * 86400000);
  const toVal = _fmtDateInput(_customRange?.to ?? now);
  const todayVal = _fmtDateInput(now);

  const rows = /** @type {Array<['week'|'month'|'3month', string]>} */ ([
    ['week', 'analytics.period_week'],
    ['month', 'analytics.period_month'],
    ['3month', 'analytics.period_3month'],
  ]).map(([key, labelKey]) => `
    <button class="period-row ${_period === key ? 'active' : ''}" data-period="${key}">
      <span>${t(labelKey)}</span>
      <span class="period-row-hint">${PERIOD_DAYS[key]}${isRu() ? ' дн.' : 'd'}</span>
    </button>`).join('');

  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">${t('analytics.period_title')}</div>
        <button class="btn-icon-sm" id="an-period-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="period-list">
        ${rows}
        <button class="period-row ${_period === 'custom' ? 'active' : ''}" data-period="custom" id="an-period-custom-toggle">
          <span>${t('analytics.period_custom')}</span>
        </button>
      </div>
      <div class="period-custom-fields" id="an-period-custom-fields" hidden>
        <div class="period-field">
          <label for="an-period-from">${t('analytics.period_from')}</label>
          <input type="date" id="an-period-from" class="bs-date-inp" value="${fromVal}" max="${todayVal}">
        </div>
        <div class="period-field">
          <label for="an-period-to">${t('analytics.period_to')}</label>
          <input type="date" id="an-period-to" class="bs-date-inp" value="${toVal}" max="${todayVal}">
        </div>
        <button class="btn btn-primary" id="an-period-apply">${t('analytics.period_apply')}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  };

  const customFields = overlay.querySelector('#an-period-custom-fields');
  if (_period === 'custom') customFields.hidden = false;

  overlay.querySelectorAll('.period-row[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      if (period === 'custom') {
        overlay.querySelectorAll('.period-row').forEach((r) => r.classList.toggle('active', r === btn));
        customFields.hidden = false;
        return;
      }
      _applyPeriod(period);
      close();
    });
  });

  overlay.querySelector('#an-period-apply')?.addEventListener('click', () => {
    const fromInput = /** @type {HTMLInputElement} */ (overlay.querySelector('#an-period-from'));
    const toInput = /** @type {HTMLInputElement} */ (overlay.querySelector('#an-period-to'));
    const from = new Date(fromInput.value + 'T00:00:00').getTime();
    const to = new Date(toInput.value + 'T23:59:59').getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return;
    _applyPeriod('custom', { from, to });
    close();
  });

  overlay.querySelector('#an-period-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

export function calPrev() { storePrev(); _drawCalendar(); }
export function calNext() { storeNext(); _drawCalendar(); }

function _drawCalendar() {
  const card = document.getElementById('cal-card');
  const label = document.getElementById('cal-month-label');
  if (!card) return;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (label) label.textContent = monthNames[CalState.month] + ' ' + CalState.year;
  const workedDays = {};
  CalState.workouts.forEach((w) => {
    const d = new Date(w.timestamp);
    if (d.getFullYear() === CalState.year && d.getMonth() === CalState.month) workedDays[d.getDate()] = { type: w.type, id: w.id };
  });
  const firstDay = new Date(CalState.year, CalState.month, 1).getDay();
  const daysInMonth = new Date(CalState.year, CalState.month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let html = `<div class="cal-day-headers">${dayLabels.map((d) => `<div class="cal-day-hdr">${d}</div>`).join('')}</div><div class="cal-grid">`;
  for (let i = 0; i < startOffset; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const entry = workedDays[d], type = entry?.type || '', isToday = (new Date().getDate() === d && new Date().getMonth() === CalState.month);
    const style = isPplType(type) ? `background:${pplColorAlpha(type, 0.125)};border-color:${pplColorAlpha(type, 0.25)}` : '';
    html += `<div class="cal-cell ${type ? 'has-workout' : ''} ${isToday ? 'cal-today' : ''}" style="${style}" data-day="${d}" data-type="${type}" data-wid="${entry?.id ?? ''}"><span class="cal-num">${d}</span>${isPplType(type) ? `<div class="cal-dot" style="background:${pplColor(type)}"></div>` : ''}</div>`;
  }
  card.innerHTML = html + `</div>`;
  card.querySelector('.cal-grid')?.addEventListener('click', (e) => {
    const cell = /** @type {HTMLElement} */ (e.target).closest('.cal-cell');
    if (!cell || cell.classList.contains('empty')) return;
    // IDB keys are typed: legacy ids are numbers, CRDT ids are UUID strings
    const wid = cell.dataset.wid || '';
    const existingId = wid === '' ? null : (/^\d+$/.test(wid) ? parseInt(wid) : wid);
    calDayClick(CalState.year, CalState.month, parseInt(cell.dataset.day), cell.dataset.type, existingId);
  });
}

export function calDayClick(year, month, day, existingType, existingId) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateLabel = `${day} ${monthNames[month]} ${year}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '4000';

  const removeBtn = existingType ? `
    <button class="cal-pick-remove" id="cal-pick-rm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="14" height="14">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
      </svg>
      Remove workout
    </button>` : '';

  overlay.innerHTML = `
    <div class="modal-sheet" style="padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">Log Workout</div>
        <button class="btn-icon-sm" id="cal-pick-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="cal-pick-date">${dateLabel}</div>
      <div class="cal-pick-grid">
        ${PPL_TYPES.map((t) => `
          <button class="cal-pick-btn ${existingType === t ? 'active' : ''}" data-type="${t}" style="--pick-color:${pplColor(t)}">
            <span class="cal-pick-dot" style="background:${pplColor(t)}"></span>
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`
        ).join('')}
      </div>
      ${removeBtn}
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      if (existingId) await DB.Workouts.deleteById(existingId);
      await DB.Workouts.save({
        type,
        timestamp: new Date(year, month, day, 12, 0, 0).getTime(),
        duration: 0,
        tonnage: 0,
        exercises: [],
        logged: true,
      });
      close();
      load();
      document.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { force: true } }));
    });
  });

  overlay.querySelector('#cal-pick-rm')?.addEventListener('click', async () => {
    if (existingId) await DB.Workouts.deleteById(existingId);
    close();
    load();
    document.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { force: true } }));
  });

  overlay.querySelector('#cal-pick-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function _renderVolumeChart(workouts, buckets) {
  const canvas = document.getElementById('cv-volume');
  if (!canvas) return;

  const max  = Math.max(...buckets.map((b) => b.tonnage), 1);
  const best = Math.max(...buckets.map((b) => b.tonnage));
  const el = document.getElementById('an-week-best');
  if (el) el.textContent = fmtVol(best) + ' kg best';

  // ── PPL dominant type per bucket (5-4) ────────────────────────────────────
  // For each bucket, sum tonnage by session type; winner drives the bar colour.
  const bucketType = buckets.map((b) => {
    const ppl = { push: 0, pull: 0, legs: 0 };
    workouts.forEach((w) => {
      if (w.timestamp >= b.start && w.timestamp < b.end && isPplType(w.type)) {
        ppl[w.type] += w.tonnage || 0;
      }
    });
    const dominant = Object.entries(ppl).sort((a, z) => z[1] - a[1])[0];
    return dominant && dominant[1] > 0 ? dominant[0] : null;
  });

  const W = canvas.offsetWidth || 320;
  canvas.width  = W * devicePixelRatio;
  canvas.height = 140 * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const pad = { t: 24, b: 28, l: 8, r: 8 };
  const bW = (W - pad.l - pad.r) / buckets.length;
  const gap = bW * 0.3;
  const chartH = 140 - pad.t - pad.b;

  buckets.forEach((b, i) => {
    const x  = pad.l + i * bW + gap / 2;
    const bw = bW - gap;
    const bh = b.tonnage ? Math.max(4, (b.tonnage / max) * chartH) : 2;
    const y  = pad.t + chartH - bh;

    const isBest  = b.tonnage === best && best > 0;
    const barHex  = pplColor(bucketType[i]);

    // Gradient bar: PPL color at top, fade to transparent at bottom
    const grad = ctx.createLinearGradient(x, y, x, y + bh);
    grad.addColorStop(0, isBest ? barHex : pplColorAlpha(bucketType[i], 0.314));
    grad.addColorStop(1, pplColorAlpha(bucketType[i], 0.04)); // near-transparent base
    ctx.fillStyle = grad;
    _roundRect(ctx, x, y, bw, bh, 4);
    ctx.fill();

    // Best week: thin top accent line (PPL solid)
    if (isBest) {
      ctx.fillStyle = barHex;
      ctx.fillRect(x, y, bw, 2);
    }

    // Week label
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `700 9px 'Manrope', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(weekLabel(b), x + bw / 2, 140 - 10);

    // Volume value on top
    if (b.tonnage > 0) {
      ctx.fillStyle = isBest ? '#ffffff' : pplColorAlpha(bucketType[i], 0.8);
      ctx.font = `800 10px 'Instrument Sans', sans-serif`;
      ctx.fillText(fmtVol(b.tonnage), x + bw / 2, y - 6);
    }
  });
}

function _renderORMList(orms) {
  const el = document.getElementById('orm-list');
  if (!el || !orms.length) return;
  const sorted = orms.sort((a, b) => b.value - a.value);
  el.innerHTML = sorted.map((o, i) => `
    <div class="orm-row stagger-item" style="animation-delay: ${0.2 + i * 0.05}s" data-action="analytics:openExercise" data-exercise="${esc(o.id)}" role="button" tabindex="0" aria-label="${esc(o.id)}">
      <div class="orm-name">${esc(o.id)}</div>
      <div class="orm-val">${o.value}<span class="orm-unit">kg</span></div>
      <div class="orm-bar-wrap"><div class="orm-bar-fill" id="an-orm-bar-${i}" style="background:linear-gradient(90deg, var(--c-legs), var(--c-legs))"></div></div>
    </div>`).join('');

  // Spring animation for bars
  setTimeout(() => {
    sorted.forEach((o, i) => {
      const bar = document.getElementById(`an-orm-bar-${i}`);
      if (!bar) return;
      const targetWidth = Math.min(100, (o.value / 250) * 100);
      Spring.animate({
        from: 0,
        to: targetWidth,
        stiffness: 120,
        damping: 14,
        onUpdate: (v) => { bar.style.transform = `scaleX(${v / 100})`; }
      });
    });
  }, 150);
}

/**
 * Open the detailed history and progression modal for a single exercise (AN-2).
 * @param {string} exerciseName
 */
export function openExerciseHistoryModal(exerciseName) {
  if (!exerciseName) return;
  const history = fetchExerciseHistory(_workoutsCache, exerciseName);
  const color = pplColor(history.type);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay ex-history-overlay';
  overlay.style.zIndex = '4000';

  const typeName = history.type.charAt(0).toUpperCase() + history.type.slice(1);
  const deltaTxt = (history.delta >= 0 ? '+' : '') + Math.round(history.delta);
  const totalVolTxt = fmtVol(history.totalVolume);

  // SVG Chart geometry
  let chartHtml = '';
  const W = 320, H = 110, padX = 8, padTop = 14, padBot = 22;
  const ptsGeo = [];

  if (history.pts.length >= 2) {
    const t0 = history.pts[0].t, tN = history.pts[history.pts.length - 1].t, tr = (tN - t0) || 1;
    const vs = history.pts.map((p) => p.v);
    const vmin = Math.min(...vs), vmax = Math.max(...vs), vr = (vmax - vmin) || 1;
    const X = (p) => padX + ((p.t - t0) / tr) * (W - 2 * padX);
    const Y = (p) => padTop + (1 - (p.v - vmin) / vr) * (H - padTop - padBot);
    history.pts.forEach((p) => ptsGeo.push({ x: X(p), y: Y(p), v: p.v, t: p.t }));

    const line = smoothPath(ptsGeo);
    const area = `${line} L ${ptsGeo[ptsGeo.length - 1].x.toFixed(1)},${H} L ${ptsGeo[0].x.toFixed(1)},${H} Z`;
    const peakI = vs.indexOf(vmax);
    const gid = `ex-chart-grad-${Date.now()}`;

    chartHtml = `
      <div class="sc-plot ex-chart-plot">
        <svg class="sc-chart ex-svg-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(history.name)} progression curve">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#${gid})"/>
          <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sc-stroke"/>
          <circle cx="${ptsGeo[peakI].x.toFixed(1)}" cy="${ptsGeo[peakI].y.toFixed(1)}" r="3.5" fill="${GOLD}" class="sc-peak-dot"/>
          <circle cx="${ptsGeo[ptsGeo.length - 1].x.toFixed(1)}" cy="${ptsGeo[ptsGeo.length - 1].y.toFixed(1)}" r="3.5" fill="${color}" class="sc-cur-dot"/>
        </svg>
        <div class="sc-scrub" aria-hidden="true">
          <div class="sc-scrub-line"></div>
          <div class="sc-scrub-dot"></div>
          <div class="sc-scrub-tip"><b></b><span></span></div>
        </div>
      </div>
      <div class="sc-axis">
        <span>${fmtMon(t0)}</span>
        <span>${history.sessionsCount} ${isRu() ? 'сессий' : 'sessions'}</span>
        <span>${fmtMon(tN)}</span>
      </div>`;
  } else if (history.pts.length === 1) {
    const p = history.pts[0];
    chartHtml = `
      <div class="ex-single-point-card">
        <div class="ex-single-val">${p.v} <span class="ex-stat-unit">kg</span></div>
        <div class="ex-single-date">${fmtMon(p.t)} (1 ${isRu() ? 'сессия' : 'session'})</div>
      </div>`;
  } else {
    chartHtml = `<div class="ex-no-history">${t('analytics.ex_no_history')}</div>`;
  }

  // Sessions log
  const sessionsLogHtml = [...history.sessions].reverse().map((s) => {
    const dateStr = fmtDate(s.timestamp, { day: 'numeric', month: 'short', year: 'numeric' });
    const setsChips = (s.sets || []).map((set, idx) => {
      const skipped = set?.done === false ? ' skipped' : '';
      const w = Number(set?.weight) || 0;
      const reps = Number(set?.reps) || 0;
      return `<span class="ex-set-chip${skipped}"><span class="ex-set-idx">${idx + 1}</span>${esc(fmtWeight(w))}<span class="ex-set-u">kg</span> × ${reps}</span>`;
    }).join('');

    return `
      <div class="ex-session-row">
        <div class="ex-session-meta">
          <span class="ex-session-date">${esc(dateStr)}</span>
          <span class="ex-session-vol">${esc(fmtVol(s.volume))}<span class="ex-stat-unit">kg</span></span>
        </div>
        <div class="ex-session-sets">${setsChips || `<span class="ex-nosets">${t('journal.no_sets')}</span>`}</div>
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="modal-sheet ex-history-sheet" style="--sc:${color}">
      <div class="modal-handle"></div>
      <div class="ex-history-head">
        <div class="ex-head-info">
          <div class="ex-history-title">${esc(history.name)}</div>
          <span class="ex-type-pill" style="color:${color};background:${color}18;border-color:${color}40">${esc(typeName)}</span>
        </div>
        <button class="btn-icon-sm" id="ex-history-close" aria-label="${t('journal.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="ex-stats-grid">
        <div class="ex-stat-cell">
          <div class="ex-stat-val">${history.best1RM ? `${history.best1RM}<span class="ex-stat-unit">kg</span>` : '—'}</div>
          <div class="ex-stat-lbl">${t('analytics.ex_best_1rm')}</div>
        </div>
        <div class="ex-stat-cell">
          <div class="ex-stat-val">${history.bestWeight ? `${history.bestWeight}<span class="ex-stat-unit">kg</span>` : '—'}</div>
          <div class="ex-stat-lbl">${t('analytics.ex_max_weight')}</div>
          ${history.sessionsCount > 1 ? `<span class="ex-stat-sub ${history.delta >= 0 ? 'up' : 'down'}">${deltaTxt} kg</span>` : ''}
        </div>
        <div class="ex-stat-cell">
          <div class="ex-stat-val">${totalVolTxt}<span class="ex-stat-unit">kg</span></div>
          <div class="ex-stat-lbl">${t('analytics.ex_total_vol')}</div>
        </div>
        <div class="ex-stat-cell">
          <div class="ex-stat-val">${history.sessionsCount}</div>
          <div class="ex-stat-lbl">${t('analytics.ex_sessions')} · ${history.totalSets} ${isRu() ? 'сет' : 'sets'}</div>
        </div>
      </div>

      <div class="ex-chart-card chart-card">
        <div class="ex-chart-title">${isRu() ? 'Динамика веса' : 'Weight Progression'}</div>
        ${chartHtml}
      </div>

      <div class="ex-history-section-title">${t('analytics.ex_sets_history')}</div>
      <div class="ex-sessions-list">
        ${sessionsLogHtml || `<div class="ex-no-history">${t('analytics.ex_no_history')}</div>`}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector('#ex-history-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const chartCard = overlay.querySelector('.ex-chart-card');
  if (chartCard && ptsGeo.length >= 2) {
    wireScrub(chartCard, ptsGeo);
  }

  haptic(10);
}

function _roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
function _set(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = String(html); }

export const Analytics = { load, calPrev, calNext, calDayClick, openExerciseHistoryModal };

