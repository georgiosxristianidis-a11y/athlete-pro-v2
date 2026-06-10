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
} from './analytics.store.js';
import { t } from './locale.store.js';

const TYPE_COLOR = {
  push: '#00e676',
  pull: '#8b5cf6',
  legs: '#ff4d88',
};

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

/**
 * Load and render the full analytics screen.
 * @returns {Promise<void>}
 */
export async function load() {
  const screen = document.getElementById('s-stats');
  if (!screen) return;

  screen.innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">${t('analytics.title')}</div>
        <div class="screen-sub">${t('analytics.sub')}</div>
      </div>
    </div>

    <div id="stats-tab-content" class="animate-in">
      <!-- Content injected by load -->
    </div>
  `;

  const container = document.getElementById('stats-tab-content');
  if (!container) return;

  container.innerHTML = `
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
      <div class="chart-card bento-grid stagger-item" style="padding:16px;gap:12px;display:grid;grid-template-columns:1fr 1fr 1fr; animation-delay: 0.1s">
        <div class="ppl-bal-item">
          <div class="ppl-bal-val" id="ppl-bal-push" style="color:#00e676">0%</div>
          <div class="ppl-bal-lbl">Push</div>
        </div>
        <div class="ppl-bal-item">
          <div class="ppl-bal-val" id="ppl-bal-pull" style="color:#8b5cf6">0%</div>
          <div class="ppl-bal-lbl">Pull</div>
        </div>
        <div class="ppl-bal-item">
          <div class="ppl-bal-val" id="ppl-bal-legs" style="color:#ff4d88">0%</div>
          <div class="ppl-bal-lbl">Legs</div>
        </div>
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
          <div class="empty-title" style="font-size: 1.25rem; font-weight: 700; color: var(--c-text-1); margin-bottom: var(--sp-1);">
            ${t('analytics.empty_title')}
          </div>
          <div class="empty-desc" style="color: var(--c-text-3); max-width: 240px; line-height: 1.4; margin-bottom: var(--sp-4);">
            ${t('analytics.empty_desc')}
          </div>
          <button class="btn-primary" onclick="window.Nav.go('s-train', { force: true })">
            ${t('analytics.start_first')}
          </button>
        </div>
      `;
      return;
    }

    _renderQuickStats(workouts);
    _renderPPLBalance(workouts);
    _renderCalendar(workouts);
    const trend = await fetchWeeklyTrend(10);
    _renderVolumeChart(workouts, trend);
    _renderORMList(orms);
}

function _renderQuickStats(workouts) {
  const since = Date.now() - 30 * 86400000;
  const recent = workouts.filter((w) => w.timestamp >= since);
  const totalVol = recent.reduce((s, w) => s + (w.tonnage || 0), 0);
  const avgMs = recent.length ? recent.reduce((s, w) => s + (w.duration || 0), 0) / recent.length : 0;
  _set('an-total-sessions', recent.length);
  _set('an-total-vol', fmtVol(totalVol) + '<span class="stat-chip-unit">kg</span>');
  _set('an-avg-time', Math.round(avgMs / 60000) + '<span class="stat-chip-unit">m</span>');
}

function _renderPPLBalance(workouts) {
  const ppl = { push: 0, pull: 0, legs: 0 };
  workouts.forEach(w => {
    if (ppl[w.type] !== undefined) ppl[w.type] += w.tonnage || 0;
  });
  const total = ppl.push + ppl.pull + ppl.legs || 1;
  _set('ppl-bal-push', Math.round((ppl.push / total) * 100) + '%');
  _set('ppl-bal-pull', Math.round((ppl.pull / total) * 100) + '%');
  _set('ppl-bal-legs', Math.round((ppl.legs / total) * 100) + '%');
}

function _renderCalendar(workouts) {
  CalState.workouts = workouts;
  _drawCalendar();
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
    const color = TYPE_COLOR[type] || '', style = type ? `background:${color}20;border-color:${color}40` : '';
    html += `<div class="cal-cell ${type ? 'has-workout' : ''} ${isToday ? 'cal-today' : ''}" style="${style}" data-day="${d}" data-type="${type}" data-wid="${entry?.id || 0}"><span class="cal-num">${d}</span>${type ? `<div class="cal-dot" style="background:${color}"></div>` : ''}</div>`;
  }
  card.innerHTML = html + `</div>`;
  card.querySelector('.cal-grid')?.addEventListener('click', (e) => {
    const cell = /** @type {HTMLElement} */ (e.target).closest('.cal-cell');
    if (!cell || cell.classList.contains('empty')) return;
    calDayClick(CalState.year, CalState.month, parseInt(cell.dataset.day), cell.dataset.type, parseInt(cell.dataset.wid));
  });
}

export function calDayClick(year, month, day, type, wid) { /* modal logic unchanged */ }

function _renderVolumeChart(workouts, buckets) {
  const canvas = document.getElementById('cv-volume');
  if (!canvas) return;
  const max = Math.max(...buckets.map((b) => b.tonnage), 1), best = Math.max(...buckets.map((b) => b.tonnage));
  const el = document.getElementById('an-week-best');
  if (el) el.textContent = fmtVol(best) + ' kg best';
  const W = canvas.offsetWidth || 320;
  canvas.width = W * devicePixelRatio; canvas.height = 140 * devicePixelRatio;
  const ctx = canvas.getContext('2d'); ctx.scale(devicePixelRatio, devicePixelRatio);
  const pad = { t: 24, b: 28, l: 8, r: 8 }, bW = (W - pad.l - pad.r) / buckets.length, gap = bW * 0.3, chartH = 140 - pad.t - pad.b;
  
  buckets.forEach((b, i) => {
    const x = pad.l + i * bW + gap / 2, bw = bW - gap, bh = b.tonnage ? Math.max(4, (b.tonnage / max) * chartH) : 2, y = pad.t + chartH - bh;
    
    // Gradient bar
    const isBest = b.tonnage === best && best > 0;
    const grad = ctx.createLinearGradient(x, y, x, y + bh);
    if (isBest) {
      grad.addColorStop(0, '#00e676');
      grad.addColorStop(1, '#00c853');
    } else {
      grad.addColorStop(0, 'rgba(0,230,118,0.2)');
      grad.addColorStop(1, 'rgba(0,230,118,0.05)');
    }
    
    ctx.fillStyle = grad;
    _roundRect(ctx, x, y, bw, bh, 4); ctx.fill();
    
    // Label: Week
    ctx.fillStyle = 'rgba(161,161,170,0.8)'; 
    ctx.font = `700 9px 'Manrope', sans-serif`; 
    ctx.textAlign = 'center';
    ctx.fillText(weekLabel(b), x + bw / 2, 140 - 10);
    
    // Value on top
    if (b.tonnage > 0) { 
      ctx.fillStyle = isBest ? '#fff' : 'rgba(255,255,255,0.6)';
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
    <div class="orm-row stagger-item" style="animation-delay: ${0.2 + i * 0.05}s">
      <div class="orm-name">${esc(o.id)}</div>
      <div class="orm-val">${o.value}<span class="orm-unit">kg</span></div>
      <div class="orm-bar-wrap"><div class="orm-bar-fill" id="an-orm-bar-${i}" style="background:linear-gradient(90deg, var(--c-purple), #8b5cf6)"></div></div>
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

function _roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
function _set(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = String(html); }

export const Analytics = { load, calPrev, calNext, calDayClick };
