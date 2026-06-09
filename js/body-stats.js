// @ts-check
/* ════════════════════════════════════════════════════════
   Block 11.1 — Body Stats  v1.3  |  Athlete Pro
   • Body Stats tab — sparklines, history, add/edit/delete
   • Body Metrics tab — weight/height/measurements (moved from Profile)
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { Spring } from './shared/spring.js';
import { Toast } from './shell.js';

const BS_KEY = 'ap-body-stats';
let _bsActiveTab = 'stats';

const BS_FIELDS = [
  { id: 'weight', label: 'Weight', unit: 'kg', icon: '⚖️', color: '#00e676' },
  { id: 'chest', label: 'Chest', unit: 'cm', icon: '📐', color: '#40c4ff' },
  { id: 'waist', label: 'Waist', unit: 'cm', icon: '📐', color: '#ffab40' },
  { id: 'hips', label: 'Hips', unit: 'cm', icon: '📐', color: '#e040fb' },
  { id: 'bicep', label: 'Bicep', unit: 'cm', icon: '💪', color: '#ffab40' },
  { id: 'thigh', label: 'Thigh', unit: 'cm', icon: '📐', color: '#69f0ae' },
  { id: 'calf', label: 'Calf', unit: 'cm', icon: '📐', color: '#b2ff59' },
  { id: 'neck', label: 'Neck', unit: 'cm', icon: '📐', color: '#ea80fc' },
  { id: 'shoulders', label: 'Shoulders', unit: 'cm', icon: '📐', color: '#80d8ff' },
  { id: 'body_fat', label: 'Body Fat', unit: '%', icon: '🔥', color: '#ff6d00' },
];

function bsLoad() {
  try {
    return JSON.parse(localStorage.getItem(BS_KEY) || '[]');
  } catch {
    return [];
  }
}
function bsSave(entries) {
  localStorage.setItem(BS_KEY, JSON.stringify(entries));
}

function bsFmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function bsEsc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function bsDelta(curr, prev, unit) {
  if (prev == null) return '';
  const diff = Math.round((curr - prev) * 10) / 10;
  if (diff === 0) return `<span class="bs-delta bs-delta-0">—</span>`;
  const cls = diff < 0 ? 'bs-delta-down' : 'bs-delta-up';
  return `<span class="bs-delta ${cls}">${diff > 0 ? '+' : ''}${diff} ${unit}</span>`;
}

function bsDrawSparkline(canvas, values, color) {
  if (!canvas || values.length < 2) return;
  const W = (canvas.width = canvas.offsetWidth * devicePixelRatio || 120);
  const H = (canvas.height = canvas.offsetHeight * devicePixelRatio || 40);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (W - 4) + 2,
    y: H - 4 - ((v - min) / range) * (H - 8),
  }));
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3 * devicePixelRatio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ══════════════════════════════════════════════
   TAB SWITCHER
   ══════════════════════════════════════════════ */
function bsSwitchTab(tab) {
  _bsActiveTab = tab;
  renderBodyStats();
}
window.bsSwitchTab = bsSwitchTab;

/**
 * Set sex preference for Navy body-fat formula. Persisted to settings.
 * @param {'m'|'f'} sex
 * @returns {void}
 */
async function bsSetSex(sex) {
  await DB.Settings.set('sex', sex === 'f' ? 'f' : 'm');
  _bsRenderMetrics();
}
window.bsSetSex = bsSetSex;

/* ══════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════ */
export function renderBodyStats() {
  const root = document.getElementById('body-stats-root');
  if (!root) return;

  const ru = (localStorage.getItem('ap-settings-lang') === 'ru');

  const tabBar = `
    <div class="bs-tab-bar" style="margin-bottom:var(--sp-2)">
      <button class="bs-tab ${_bsActiveTab === 'stats' ? 'active' : ''}" onclick="bsSwitchTab('stats')">${ru ? 'История замеров' : 'History'}</button>
      <button class="bs-tab ${_bsActiveTab === 'metrics' ? 'active' : ''}" onclick="bsSwitchTab('metrics')">${ru ? 'Данные тела' : 'Metrics'}</button>
    </div>`;

  if (_bsActiveTab === 'metrics') {
    root.innerHTML = `<div class="bs-wrap">${tabBar}<div id="bs-metrics-content"></div></div>`;
    _bsRenderMetrics();
    return;
  }

  /* ── Stats tab ── */
  const entries = bsLoad().sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = entries[0] || null,
    prev = entries[1] || null;
  const iconTrash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

  const summaryCards = BS_FIELDS.filter((f) => latest?.[f.id] != null)
    .map((f) => {
      const vals = entries
        .map((e) => e[f.id])
        .filter((v) => v != null)
        .reverse();
      return `<div class="bs-stat-card">
      <div class="bs-stat-top">
        <span class="bs-stat-label">${f.label}</span>
        ${bsDelta(latest[f.id], prev?.[f.id], f.unit)}
      </div>
      <div class="bs-stat-value">${latest[f.id]}<span class="bs-stat-unit">${f.unit}</span></div>
      ${
        vals.length >= 2
          ? `<canvas class="bs-spark" data-field="${f.id}" data-color="${f.color}"></canvas>`
          : '<div class="bs-spark-empty">Not enough data</div>'
      }
    </div>`;
    })
    .join('');

  const historyRows = entries
    .slice(0, 20)
    .map((e, i) => {
      const nextE = entries[i + 1];
      const cells = BS_FIELDS.filter((f) => e[f.id] != null)
        .map(
          (f) => `
      <div class="bs-hist-cell">
        <span class="bs-hist-lbl">${f.label}</span>
        <span class="bs-hist-val">${e[f.id]} ${f.unit}</span>
        ${nextE ? bsDelta(e[f.id], nextE[f.id], f.unit) : ''}
      </div>`
        )
        .join('');
      return `<div class="bs-hist-entry" onclick="bsHistToggle(this)">
      <div class="bs-hist-head">
        <span class="bs-hist-date">${bsEsc(bsFmtDate(e.date))}</span>
        ${e.weight != null ? `<span class="bs-hist-weight">${e.weight} kg</span>` : ''}
        <span class="bs-hist-chev">›</span>
      </div>
      <div class="bs-hist-body">${cells}
        <button class="bs-del-btn"
          onclick="event.stopPropagation(); bsDeleteEntry('${e.date}')">
          ${iconTrash} ${t('metrics.delete_confirm_title').replace('?', '')}
        </button>
      </div>
    </div>`;
    })
    .join('');

  root.innerHTML = `<div class="bs-wrap">
    ${tabBar}
    <div class="bs-header">
      <h2 class="bs-title">${t('metrics.title')}</h2>
      <button class="btn-primary bs-add-btn" onclick="bsOpenForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
        ${t('metrics.add_entry')}
      </button>
    </div>
    ${
      entries.length === 0
        ? `<div class="bs-empty">
           <div class="bs-empty-icon">📐</div>
           <p class="bs-empty-title">${t('metrics.empty_title')}</p>
           <p class="bs-empty-sub">${t('metrics.empty_sub')}</p>
         </div>`
        : `<div class="bs-last-date">${t('metrics.last_updated')}: ${bsFmtDate(latest.date)}</div>
         <div class="bs-grid">${summaryCards}</div>`
    }
    ${
      entries.length > 0
        ? `<div class="bs-section-title">${t('metrics.history')}</div>
         <div class="bs-history">${historyRows}</div>`
        : ''
    }
  </div>`;

  requestAnimationFrame(() => {
    const sparks = Array.from(root.querySelectorAll('canvas.bs-spark'));
    // Phase 1: Measure (Read) - prevents Layout Thrashing
    const measurements = sparks.map((canvas) => ({
      canvas,
      field: canvas.dataset.field,
      color: canvas.dataset.color,
      w: canvas.offsetWidth * devicePixelRatio || 120,
      h: canvas.offsetHeight * devicePixelRatio || 40
    }));

    // Phase 2: Mutate (Write)
    measurements.forEach(({ canvas, field, color, w, h }) => {
      const vals = entries
        .map((e) => e[field])
        .filter((v) => v != null)
        .reverse();
      bsDrawSparkline(canvas, vals, color, w, h);
    });
  });
}

/* ══════════════════════════════════════════════
   BODY METRICS TAB
   ══════════════════════════════════════════════ */
/**
 * Navy method body-fat calculator (US Navy circumference).
 * Source: Hodgdon & Beckett (1984) via medvisor.ru/services/navy-procent-zhira-v-tele.
 * @param {{sex:'m'|'f', heightCm:number, waistCm:number, neckCm:number, hipCm?:number}} d
 * @returns {number|null} percent body fat rounded to .1, or null if inputs invalid.
 */
function _bsBodyFatNavy({ sex, heightCm, waistCm, neckCm, hipCm }) {
  if (!heightCm || !waistCm || !neckCm) return null;
  if (sex === 'f' && !hipCm) return null;
  let bf;
  if (sex === 'f') {
    const a = waistCm + hipCm - neckCm;
    if (a <= 0) return null;
    bf = 163.205 * Math.log10(a) - 97.684 * Math.log10(heightCm) - 78.387;
  } else {
    const a = waistCm - neckCm;
    if (a <= 0) return null;
    bf = 86.010 * Math.log10(a) - 70.041 * Math.log10(heightCm) + 36.76;
  }
  if (!isFinite(bf) || bf <= 0) return null;
  return Math.round(bf * 10) / 10;
}

/**
 * Categorize body-fat % per ACE/Navy interpretation.
 * @param {number} bf
 * @param {'m'|'f'} sex
 * @returns {{label:string, color:string}}
 */
function _bsBodyFatCategory(bf, sex) {
  const ranges = sex === 'f'
    ? [[14, 'Essential', 'var(--c-blue)'], [21, 'Athletic', 'var(--c-accent)'], [25, 'Fitness', 'var(--c-accent)'], [32, 'Average', 'var(--c-red)'], [100, 'High', 'var(--c-red)']]
    : [[6, 'Essential', 'var(--c-blue)'], [14, 'Athletic', 'var(--c-accent)'], [18, 'Fitness', 'var(--c-accent)'], [25, 'Average', 'var(--c-red)'], [100, 'High', 'var(--c-red)']];
  for (const [max, label, color] of ranges) if (bf < max) return { label, color };
  return { label: '—', color: 'var(--c-text-3)' };
}

async function _bsRenderMetrics() {
  const el = document.getElementById('bs-metrics-content');
  if (!el) return;

  const [latest, allMetrics, settings] = await Promise.all([
    DB.Metrics.latest(),
    DB.Metrics.getAll(),
    DB.Settings.getAll(),
  ]);

  const sex = settings['sex'] === 'f' ? 'f' : 'm';
  const heightCm = latest?.height || parseFloat(settings['m-height']) || null;
  const waistCm = parseFloat(settings['m-waist']) || null;
  const neckCm = parseFloat(settings['m-neck']) || null;
  const hipCm = parseFloat(settings['m-hips']) || null;
  const bodyFat = _bsBodyFatNavy({ sex, heightCm, waistCm, neckCm, hipCm });
  const bfCat = bodyFat != null ? _bsBodyFatCategory(bodyFat, sex) : null;

  const bmiColor = !latest
    ? 'var(--c-text-3)'
    : latest.bmi < 18.5
      ? 'var(--c-blue)'
      : latest.bmi < 25
        ? 'var(--c-accent)'
        : latest.bmi < 30
          ? 'var(--c-red)'
          : 'var(--c-red)'; /* both 25-30 and 30+ → coral (overweight = soft warn, not achievement) */
  const bmiLabel = !latest
    ? ''
    : latest.bmi < 18.5
      ? 'Underweight'
      : latest.bmi < 25
        ? 'Normal'
        : latest.bmi < 30
          ? 'Overweight'
          : 'Obese';

  const summary = latest
    ? `
    <div class="body-summary">
      <div class="body-stat">
        <div class="body-stat-val">${latest.weight}<span class="body-stat-unit">kg</span></div>
        <div class="body-stat-label">Weight</div>
      </div>
      <div class="body-stat-divider"></div>
      <div class="body-stat">
        <div class="body-stat-val" style="color:${bmiColor}">${latest.bmi}</div>
        <div class="body-stat-label">BMI · ${bmiLabel}</div>
      </div>
      <div class="body-stat-divider"></div>
      <div class="body-stat">
        <div class="body-stat-val" style="color:${bfCat ? bfCat.color : 'var(--c-text-3)'}">
          ${bodyFat != null ? bodyFat + '<span class="body-stat-unit">%</span>' : '—'}
        </div>
        <div class="body-stat-label">${bfCat ? 'Fat · ' + bfCat.label : 'Body Fat'}</div>
      </div>
    </div>
    ${bodyFat == null ? `<div class="bs-fat-hint">Fill waist, neck${sex === 'f' ? ' and hips' : ''} below to compute body-fat %</div>` : ''}`
    : `
    <div class="body-summary empty-state" style="padding:var(--sp-3)">
      <div class="empty-title" style="font-size:13px">No body metrics yet</div>
      <div class="empty-desc">Add your weight and height below</div>
    </div>`;

  const mField = (id, label, value, unit) => `
    <div class="metric-field">
      <label class="metric-label">${label}</label>
      <div class="metric-input-wrap">
        <input class="metric-input" id="${id}" type="number"
          inputmode="decimal" step="0.5" placeholder="—"
          value="${value || ''}">
        <span class="metric-unit">${unit}</span>
      </div>
    </div>`;

  const history =
    allMetrics.length > 1
      ? `
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Weight History</span>
    </div>
    <div class="profile-card">
      ${allMetrics
        .slice(0, 5)
        .map(
          (m) => `
        <div class="history-row">
          <span class="history-date">${new Date(m.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span class="history-val">${m.weight} kg</span>
          <span class="history-bmi" style="color:${m.bmi < 25 ? 'var(--c-accent)' : 'var(--c-red)'}">BMI ${m.bmi}</span>
        </div>`
        )
        .join('')}
    </div>`
      : '';

  el.innerHTML = `
    ${summary}
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Body Metrics</span>
      <button class="btn-text" onclick="bsSaveMetrics()">Save</button>
    </div>
    <div class="profile-card">
      <div class="metrics-grid">
        <div class="metric-field">
          <label class="metric-label">Weight</label>
          <div class="metric-input-wrap">
            <input class="metric-input" id="bm-weight" type="number"
              inputmode="decimal" step="0.1" placeholder="80.0"
              value="${latest?.weight || ''}">
            <span class="metric-unit">kg</span>
          </div>
        </div>
        <div class="metric-field">
          <label class="metric-label">Height</label>
          <div class="metric-input-wrap">
            <input class="metric-input" id="bm-height" type="number"
              inputmode="numeric" step="1" placeholder="180"
              value="${latest?.height || ''}">
            <span class="metric-unit">cm</span>
          </div>
        </div>
      </div>
    </div>
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Measurements</span>
      <button class="btn-text" onclick="bsSaveMeasurements()">Save</button>
    </div>
    <div class="profile-card">
      <div class="bs-sex-row">
        <span class="bs-sex-label">Sex</span>
        <div class="bs-sex-segment" role="tablist">
          <button class="bs-sex-btn ${sex === 'm' ? 'active' : ''}" onclick="bsSetSex('m')" role="tab">Male</button>
          <button class="bs-sex-btn ${sex === 'f' ? 'active' : ''}" onclick="bsSetSex('f')" role="tab">Female</button>
        </div>
        <span class="bs-sex-hint">Used for Navy body-fat formula</span>
      </div>
      <div class="metrics-grid">
        ${mField('bm-chest', 'Chest', settings['m-chest'], 'cm')}
        ${mField('bm-waist', 'Waist', settings['m-waist'], 'cm')}
        ${mField('bm-arm-l', 'Left Arm', settings['m-arm-l'], 'cm')}
        ${mField('bm-arm-r', 'Right Arm', settings['m-arm-r'], 'cm')}
        ${mField('bm-thigh-l', 'Left Thigh', settings['m-thigh-l'], 'cm')}
        ${mField('bm-thigh-r', 'Right Thigh', settings['m-thigh-r'], 'cm')}
        ${mField('bm-hips', 'Hips', settings['m-hips'], 'cm')}
        ${mField('bm-neck', 'Neck', settings['m-neck'], 'cm')}
      </div>
    </div>
    ${history}
    <div style="height:var(--sp-4)"></div>`;
}

async function bsSaveMetrics() {
  const w = parseFloat(document.getElementById('bm-weight')?.value);
  const h = parseFloat(document.getElementById('bm-height')?.value);
  if (!w || !h || w <= 0 || h <= 0) {
    Toast.show('Enter valid weight and height', 'error');
    return;
  }
  await DB.Metrics.save(w, h);
  Toast.show('Body metrics saved', 'success');
  _bsRenderMetrics();
}
window.bsSaveMetrics = bsSaveMetrics;

async function bsSaveMeasurements() {
  const map = {
    'bm-chest': 'm-chest',
    'bm-waist': 'm-waist',
    'bm-hips': 'm-hips',
    'bm-arm-l': 'm-arm-l',
    'bm-arm-r': 'm-arm-r',
    'bm-thigh-l': 'm-thigh-l',
    'bm-thigh-r': 'm-thigh-r',
    'bm-neck': 'm-neck',
  };
  await Promise.all(
    Object.entries(map).map(([id, key]) => {
      const val = document.getElementById(id)?.value;
      return val ? DB.Settings.set(key, val) : Promise.resolve();
    })
  );
  Toast.show('Measurements saved', 'success');
  _bsRenderMetrics(); // re-compute body-fat % with fresh values
}
window.bsSaveMeasurements = bsSaveMeasurements;

/* ══════════════════════════════════════════════
   HISTORY / DELETE
   ══════════════════════════════════════════════ */
function bsHistToggle(el) {
  el.classList.toggle('open');
}

function bsDeleteEntry(dateIso) {
  _bsConfirm(
    '🗑 Delete entry?',
    `Remove measurement for <b>${bsEsc(bsFmtDate(dateIso))}</b>? This cannot be undone.`,
    'Delete',
    () => {
      bsSave(bsLoad().filter((e) => e.date !== dateIso));
      renderBodyStats();
      navigator.vibrate?.([30]);
    }
  );
}

/* ══════════════════════════════════════════════
   CONFIRM SHEET
   ══════════════════════════════════════════════ */
function _bsConfirm(title, bodyHtml, confirmLabel, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay bs-overlay';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="modal-sheet" id="bs-confirm-sheet" style="padding-bottom:calc(20px + env(safe-area-inset-bottom,0px)); transform: translateY(100%);">
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:8px 0 20px;">
        <div style="font-size:17px;font-weight:800;color:var(--c-text-1);margin-bottom:10px;">${title}</div>
        <div style="font-size:13px;color:var(--c-text-2);line-height:1.5;">${bodyHtml}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="bs-confirm-ok" style="
          width:100%;height:48px;border-radius:14px;
          background:#0d0f14;border:1px solid rgba(255,255,255,0.15);
          color:#fff;font-size:15px;font-weight:800;
          font-family:inherit;cursor:pointer;transition:all 0.15s ease;">
          ${confirmLabel}
        </button>
        <button id="bs-confirm-cancel" style="
          width:100%;height:48px;border-radius:14px;
          background:var(--c-accent);border:none;
          color:#000;font-size:15px;font-weight:800;
          font-family:inherit;cursor:pointer;">
          Cancel
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  
  const sheet = overlay.querySelector('#bs-confirm-sheet');
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    Spring.animate({
      from: 100,
      to: 0,
      stiffness: 200,
      damping: 20,
      onUpdate: (v) => { if (sheet) sheet.style.transform = `translateY(${v}%)`; }
    });
  });

  const close = () => {
    overlay.classList.remove('visible');
    Spring.animate({
      from: 0,
      to: 100,
      stiffness: 250,
      damping: 25,
      onUpdate: (v) => { if (sheet) sheet.style.transform = `translateY(${v}%)`; },
      onComplete: () => overlay.remove()
    });
  };
  overlay.querySelector('#bs-confirm-ok').addEventListener('click', () => {
    close();
    onConfirm();
  });
  overlay.querySelector('#bs-confirm-cancel').addEventListener('click', close);
}

/* ══════════════════════════════════════════════
   ADD / EDIT FORM
   ══════════════════════════════════════════════ */
let _bsOverlay = null;

function bsOpenForm(editDate = null) {
  const entries = bsLoad();
  const existing = editDate ? entries.find((e) => e.date === editDate) : null;
  const today = new Date().toISOString().split('T')[0];
  if (_bsOverlay) _bsOverlay.remove();
  _bsOverlay = document.createElement('div');
  _bsOverlay.className = 'modal-overlay bs-overlay';
  _bsOverlay.addEventListener('click', (e) => {
    if (e.target === _bsOverlay) bsCloseForm();
  });
  const fields = BS_FIELDS.map(
    (f) => `
    <div class="bs-field">
      <label class="bs-field-label">${f.icon} ${f.label}</label>
      <div class="bs-field-inp-wrap">
        <input type="number" step="0.1" min="0" max="999" inputmode="decimal"
               class="bs-field-inp" id="bsf-${f.id}"
               placeholder="—" value="${existing?.[f.id] ?? ''}">
        <span class="bs-field-unit">${f.unit}</span>
      </div>
    </div>`
  ).join('');
  _bsOverlay.innerHTML = `
    <div class="modal-sheet bs-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <span class="modal-title">${editDate ? 'Edit' : 'New'} Entry</span>
        <button class="btn-icon-sm" onclick="bsCloseForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="bs-date-row">
        <label class="bs-field-label">📅 Date</label>
        <input type="date" id="bsf-date" class="bs-date-inp"
               value="${existing?.date ?? today}" max="${today}">
      </div>
      <div class="bs-fields-scroll">${fields}</div>
      <div class="bs-form-actions">
        <button class="btn-primary bs-save-btn" onclick="bsSaveEntry('${editDate ?? ''}')">Save Entry</button>
      </div>
    </div>`;
  document.body.appendChild(_bsOverlay);
  requestAnimationFrame(() => _bsOverlay.classList.add('visible'));
  navigator.vibrate?.([20]);
}

function bsCloseForm() {
  if (!_bsOverlay) return;
  const el = _bsOverlay;
  _bsOverlay = null;
  el.classList.remove('visible');
  setTimeout(() => el.remove(), 300);
}

function bsSaveEntry(editDate) {
  const date = document.getElementById('bsf-date')?.value;
  if (!date) {
    alert('Please select a date');
    return;
  }
  const entry = { date };
  let hasAny = false;
  BS_FIELDS.forEach((f) => {
    const v = parseFloat(document.getElementById(`bsf-${f.id}`)?.value);
    if (!isNaN(v) && v > 0) {
      entry[f.id] = v;
      hasAny = true;
    }
  });
  if (!hasAny) {
    alert('Enter at least one measurement');
    return;
  }

  const existing = bsLoad();
  const dateCollision = editDate && date !== editDate && existing.some((e) => e.date === date);
  const doSave = () => {
    const filtered = existing.filter((e) => e.date !== date && (!editDate || e.date !== editDate));
    bsSave([...filtered, entry]);
    bsCloseForm();
    renderBodyStats();
    navigator.vibrate?.([15, 50, 15]);
  };

  if (dateCollision) {
    _bsConfirm(
      '⚠ Date already exists',
      `An entry for <b>${bsEsc(bsFmtDate(date))}</b> already exists. Saving will <b>replace</b> it.`,
      'Replace & Save',
      doSave
    );
  } else {
    doSave();
  }
}

window.bsHistToggle = bsHistToggle;
window.bsDeleteEntry = bsDeleteEntry;
window.bsOpenForm = bsOpenForm;
window.bsCloseForm = bsCloseForm;
window.bsSaveEntry = bsSaveEntry;

