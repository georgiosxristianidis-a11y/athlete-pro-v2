/* ════════════════════════════════════════════════════════
   Block 11.1 — Body Stats  v1.3  |  Athlete Pro
   • Body Stats tab — sparklines, history, add/edit/delete
   • Body Metrics tab — weight/height/measurements (moved from Profile)
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

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

/* ══════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════ */
export function renderBodyStats() {
  const root = document.getElementById('body-stats-root');
  if (!root) return;

  const tabBar = `
    <div class="bs-tab-bar">
      <button class="bs-tab ${_bsActiveTab === 'stats' ? 'active' : ''}" onclick="bsSwitchTab('stats')">Body Stats</button>
      <button class="bs-tab ${_bsActiveTab === 'metrics' ? 'active' : ''}" onclick="bsSwitchTab('metrics')">Body Metrics</button>
    </div>`;

  if (_bsActiveTab === 'metrics') {
    root.innerHTML = `<div class="bs-wrap">${tabBar}<div id="bs-metrics-content"><div style="padding:var(--sp-3);text-align:center;color:var(--c-text-3);font-size:13px">Loading…</div></div></div>`;
    _bsRenderMetrics();
    return;
  }

  /* ── Stats tab ── */
  const entries = bsLoad().sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = entries[0] || null,
    prev = entries[1] || null;

  const summaryCards = BS_FIELDS.filter((f) => latest?.[f.id] != null)
    .map((f) => {
      const vals = entries
        .map((e) => e[f.id])
        .filter((v) => v != null)
        .reverse();
      return `<div class="bs-stat-card">
      <div class="bs-stat-top">
        <span class="bs-stat-label">${f.icon} ${f.label}</span>
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
          🗑 Delete this entry
        </button>
      </div>
    </div>`;
    })
    .join('');

  root.innerHTML = `<div class="bs-wrap">
    ${tabBar}
    <div class="bs-header">
      <h2 class="bs-title">Body Stats</h2>
      <button class="btn-primary bs-add-btn" onclick="bsOpenForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
        Add Entry
      </button>
    </div>
    ${
      entries.length === 0
        ? `<div class="bs-empty">
           <div class="bs-empty-icon">📐</div>
           <p class="bs-empty-title">No measurements yet</p>
           <p class="bs-empty-sub">Tap "Add Entry" to log your first body stats</p>
         </div>`
        : `<div class="bs-last-date">Last updated: ${bsFmtDate(latest.date)}</div>
         <div class="bs-grid">${summaryCards}</div>`
    }
    ${
      entries.length > 0
        ? `<div class="bs-section-title">History</div>
         <div class="bs-history">${historyRows}</div>`
        : ''
    }
  </div>`;

  requestAnimationFrame(() => {
    root.querySelectorAll('canvas.bs-spark').forEach((canvas) => {
      const vals = entries
        .map((e) => e[canvas.dataset.field])
        .filter((v) => v != null)
        .reverse();
      bsDrawSparkline(canvas, vals, canvas.dataset.color);
    });
  });
}

/* ══════════════════════════════════════════════
   BODY METRICS TAB
   ══════════════════════════════════════════════ */
async function _bsRenderMetrics() {
  const el = document.getElementById('bs-metrics-content');
  if (!el) return;

  const [latest, allMetrics, settings] = await Promise.all([
    DB.Metrics.latest(),
    DB.Metrics.getAll(),
    DB.Settings.getAll(),
  ]);

  const bmiColor = !latest
    ? 'var(--c-text-3)'
    : latest.bmi < 18.5
      ? 'var(--c-blue)'
      : latest.bmi < 25
        ? 'var(--c-accent)'
        : latest.bmi < 30
          ? 'var(--c-amber)'
          : 'var(--c-red)';
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
        <div class="body-stat-val">${latest.height}<span class="body-stat-unit">cm</span></div>
        <div class="body-stat-label">Height</div>
      </div>
      <div class="body-stat-divider"></div>
      <div class="body-stat">
        <div class="body-stat-val" style="color:${bmiColor}">${latest.bmi}</div>
        <div class="body-stat-label">${bmiLabel}</div>
      </div>
    </div>`
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
          <span class="history-bmi" style="color:${m.bmi < 25 ? 'var(--c-accent)' : 'var(--c-amber)'}">BMI ${m.bmi}</span>
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
}

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
    <div class="modal-sheet" style="padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))">
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
  requestAnimationFrame(() => overlay.classList.add('visible'));
  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
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

