// @ts-check
import { DB } from './db.js';
import { Spring } from './shared/spring.js';
import { Toast } from './shell.js';
import { confirmDialog } from './shared/confirm.js';
import { isRu } from './locale.store.js';
import { on } from './events.js';

on('bs:prompt',     (el) => window.bsPromptField(el.dataset.id, el.dataset.label, el.dataset.unit, +el.dataset.val || 0));
on('bs:histToggle', (el) => el.parentElement.classList.toggle('open'));
on('bs:delete',     (el, e) => { e.stopPropagation(); window.bsDeleteEntry(el.dataset.date); });

const BS_KEY = 'ap-bodystats';
const bsEsc = (s) => String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const bsFmtDate = (iso) => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });

// 1-4: colour each metric by the muscle group it tracks (PPL law — push=green,
// pull=cyan, legs=purple) and keep body composition neutral, instead of the old
// random rainbow. Underlying tokens (not --c-push/pull/legs aliases) so the bento
// glow derivation (--c-* → --glow-*-md) resolves; neutral metrics get no glow.
const BS_FIELDS = [
  { id: 'weight',    label: 'Weight',    unit: 'kg', color: 'var(--c-text-1)' },  // composition
  { id: 'body_fat',  label: 'Body Fat',  unit: '%',  color: 'var(--c-text-1)' },  // composition
  { id: 'chest',     label: 'Chest',     unit: 'cm', color: 'var(--c-accent)' },  // push
  { id: 'shoulders', label: 'Shoulders', unit: 'cm', color: 'var(--c-accent)' },  // push
  { id: 'waist',     label: 'Waist',     unit: 'cm', color: 'var(--c-text-1)' },  // composition
  { id: 'hips',      label: 'Hips',      unit: 'cm', color: 'var(--c-purple)' },  // legs
  { id: 'arm_l',     label: 'Left Arm',  unit: 'cm', color: 'var(--c-blue)' },    // pull (biceps)
  { id: 'arm_r',     label: 'Right Arm', unit: 'cm', color: 'var(--c-blue)' },    // pull (biceps)
  { id: 'thigh_l',   label: 'Left Thigh',unit: 'cm', color: 'var(--c-purple)' },  // legs
  { id: 'thigh_r',   label: 'Right Thigh',unit:'cm', color: 'var(--c-purple)' },  // legs
  { id: 'calf_l',    label: 'Left Calf', unit: 'cm', color: 'var(--c-purple)' },  // legs
  { id: 'calf_r',    label: 'Right Calf',unit: 'cm', color: 'var(--c-purple)' },  // legs
  { id: 'neck',      label: 'Neck',      unit: 'cm', color: 'var(--c-text-1)' }   // structural
];

function bsLoad() {
  try { return JSON.parse(localStorage.getItem(BS_KEY) || '[]'); } catch { return []; }
}
function bsSave(data) {
  localStorage.setItem(BS_KEY, JSON.stringify(data));
}

function _bsBodyFatNavy({ sex, heightCm, waistCm, neckCm, hipCm }) {
  if (!heightCm || !waistCm || !neckCm) return null;
  if (sex === 'f' && !hipCm) return null;
  const W = waistCm, N = neckCm, H = hipCm, HT = heightCm;
  let bf = 0;
  if (sex === 'm') {
    bf = 495 / (1.0324 - 0.19077 * Math.log10(W - N) + 0.15456 * Math.log10(HT)) - 450;
  } else {
    bf = 495 / (1.29579 - 0.35004 * Math.log10(W + H - N) + 0.221 * Math.log10(HT)) - 450;
  }
  return isNaN(bf) || bf < 1 || bf > 80 ? null : bf.toFixed(1);
}

function _bsBodyFatCategory(bf, sex) {
  bf = parseFloat(bf);
  const ranges = sex === 'm'
    ? [[6, 'Essential', 'var(--c-blue)'], [13, 'Athletic', 'var(--c-accent)'], [17, 'Fitness', 'var(--c-accent)'], [25, 'Average', 'var(--c-amber)'], [100, 'High', 'var(--c-red)']]
    : [[13, 'Essential', 'var(--c-blue)'], [20, 'Athletic', 'var(--c-accent)'], [24, 'Fitness', 'var(--c-accent)'], [31, 'Average', 'var(--c-amber)'], [100, 'High', 'var(--c-red)']];
  for (const [max, label, color] of ranges) if (bf < max) return { label, color };
  return { label: '—', color: 'var(--c-text-3)' };
}

export async function renderBodyStats(targetEl) {
  const root = targetEl || document.getElementById('body-stats-root');
  if (!root) return;
  const ru = isRu();
  const entries = bsLoad().sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = entries[0] || {};
  
  const sex = (await DB.Settings.get('sex', 'm')) === 'f' ? 'f' : 'm';
  const latestMetric = await DB.Metrics.latest();
  const heightCm = latestMetric?.height || latest?.height || null;
  const bodyFat = _bsBodyFatNavy({
    sex, heightCm, 
    waistCm: latest?.waist, neckCm: latest?.neck, hipCm: latest?.hips
  });
  const bfCat = bodyFat != null ? _bsBodyFatCategory(bodyFat, sex) : null;

  const bentoHtml = BS_FIELDS.map(f => {
    let val = latest[f.id] || '--';
    if (f.id === 'body_fat' && bodyFat) val = bodyFat;
    if (f.id === 'weight' && latestMetric?.weight) val = latestMetric.weight;
    
    let glowVar = f.color;
    if (f.color.includes('var(--c-')) {
       glowVar = f.color.replace('var(--c-', 'var(--glow-').replace(')', '-md)');
    } else { glowVar = 'rgba(255,255,255,0.1)' }
    
    return `
    <div class="pp-bento-cell pp-bento-glow" style="--bento-color:${f.color}; --bento-glow:${glowVar}" data-action="bs:prompt" data-id="${f.id}" data-label="${f.label}" data-unit="${f.unit}" data-val="${val === '--' ? 0 : val}">
      <div class="pp-bento-lbl">${f.label}</div>
      <div class="pp-bento-val">${val}<span style="font-size:12px;opacity:0.6;margin-left:2px">${f.unit}</span></div>
      ${f.id === 'body_fat' && bfCat ? `<div class="pp-bento-sub" style="color:${bfCat.color}">${bfCat.label}</div>` : ''}
      ${f.id === 'weight' && latestMetric?.bmi ? `<div class="pp-bento-sub">BMI ${latestMetric.bmi}</div>` : ''}
    </div>`;
  }).join('');

  const historyRows = entries.slice(0, 10).map((e, i) => {
    const cells = BS_FIELDS.filter(f => e[f.id] != null).map(f => `
      <div class="bs-hist-cell" style="display:flex; justify-content:space-between; padding:4px 0;">
        <span class="bs-hist-lbl" style="color:var(--c-text-2)">${f.label}</span>
        <span class="bs-hist-val" style="color:var(--c-text-1); font-weight:600;">${e[f.id]} ${f.unit}</span>
      </div>`).join('');
    return `
      <div class="bs-hist-card" style="background:var(--c-bg-2); border:1px solid var(--c-border); border-radius:16px; padding:16px; margin-bottom:8px;">
        <div class="bs-hist-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;" data-action="bs:histToggle">
          <span class="bs-hist-date" style="font-weight:700; color:var(--c-text-1)">${bsFmtDate(e.date)}</span>
          <button class="btn-icon-sm" style="color:var(--c-red); background:none; border:none; padding:4px;" data-action="bs:delete" data-date="${e.date}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
        <div class="bs-hist-body">${cells}</div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="bs-wrap" style="padding-top: 0; padding-bottom: calc(24px + env(safe-area-inset-bottom));">
      <div class="section-header" style="margin-top: 0; margin-bottom: var(--sp-2);">
        <span class="section-label">${ru ? 'Замеры тела' : 'Body Measurements'}</span>
        <button class="btn-text" style="color:var(--c-accent)" data-action="bs:prompt" data-id="new" data-label="${ru ? 'Новая запись' : 'New Entry'}" data-unit="" data-val="0">+ Add</button>
      </div>
      <div class="pp-bento" style="margin-bottom: var(--sp-4);">
        ${bentoHtml}
      </div>
      ${entries.length > 0 ? `
        <div class="section-header" style="margin-bottom: var(--sp-2);">
          <span class="section-label">${ru ? 'История' : 'History'}</span>
        </div>
        <div class="bs-history">${historyRows}</div>
      ` : ''}
    </div>
  `;
}

window.bsPromptField = function(id, label, unit, currVal) {
  const today = new Date().toISOString().split('T')[0];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay bs-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet bs-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <span class="modal-title">Update ${label}</span>
        <button class="btn-icon-sm bs-close-x">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      ${id === 'new' ? `
        <div class="bs-date-row" style="margin-bottom:16px;">
          <label class="bs-field-label" style="display:block; margin-bottom:8px;">Date</label>
          <input type="date" id="bsf-date" class="bs-date-inp" style="width:100%; height:48px; border-radius:12px; background:var(--c-bg-2); border:1px solid var(--c-border); color:var(--c-text-1); padding:0 16px;" value="${today}" max="${today}">
        </div>
        <div style="max-height:50vh; overflow-y:auto; padding-bottom:16px;">
          ${BS_FIELDS.filter(f => f.id !== 'body_fat').map(f => `
            <div class="bs-field" style="margin-bottom:12px;">
              <label class="bs-field-label" style="display:block; margin-bottom:4px; font-size:13px;">${f.label}</label>
              <div class="bs-field-inp-wrap" style="position:relative;">
                <input type="number" step="0.1" class="bs-field-inp" id="bsf-${f.id}" placeholder="—" style="width:100%; height:48px; border-radius:12px; background:var(--c-bg-2); border:1px solid var(--c-border); color:var(--c-text-1); padding:0 16px;">
                <span class="bs-field-unit" style="position:absolute; right:16px; top:14px; color:var(--c-text-3); pointer-events:none;">${f.unit}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="bs-date-row" style="margin-bottom:16px;">
          <label class="bs-field-label" style="display:block; margin-bottom:8px;">Date (auto-merges)</label>
          <input type="date" id="bsf-date" class="bs-date-inp" style="width:100%; height:48px; border-radius:12px; background:var(--c-bg-2); border:1px solid var(--c-border); color:var(--c-text-1); padding:0 16px;" value="${today}" max="${today}">
        </div>
        <div class="bs-field" style="margin-bottom:16px;">
          <label class="bs-field-label" style="display:block; margin-bottom:8px;">${label}</label>
          <div class="bs-field-inp-wrap" style="position:relative;">
            <input type="number" step="0.1" class="bs-field-inp" id="bsf-${id}" value="${currVal || ''}" style="width:100%; height:48px; border-radius:12px; background:var(--c-bg-2); border:1px solid var(--c-border); color:var(--c-text-1); padding:0 16px;" autofocus>
            <span class="bs-field-unit" style="position:absolute; right:16px; top:14px; color:var(--c-text-3); pointer-events:none;">${unit}</span>
          </div>
        </div>
      `}
      <div class="bs-form-actions">
        <button class="btn-primary bs-save-btn" id="bsf-save" style="width:100%; height:48px; border-radius:14px; background:var(--c-accent); color:#000; font-weight:800; font-size:16px; border:none;">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  
  // Spring animation for smooth 60fps overlay
  const sheet = overlay.querySelector('.bs-sheet');
  sheet.style.transform = 'translateY(100%)';
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    Spring.animate({
      from: 100, to: 0, stiffness: 200, damping: 20,
      onUpdate: (v) => { if (sheet) sheet.style.transform = `translateY(${v}%)`; }
    });
  });

  const close = () => {
    overlay.classList.remove('visible');
    Spring.animate({
      from: 0, to: 100, stiffness: 250, damping: 25,
      onUpdate: (v) => { if (sheet) sheet.style.transform = `translateY(${v}%)`; },
      onComplete: () => overlay.remove()
    });
  };
  overlay.querySelector('.bs-close-x').onclick = close;

  overlay.querySelector('#bsf-save').onclick = async () => {
    const date = overlay.querySelector('#bsf-date').value;
    if (!date) return;
    const entries = bsLoad();
    let entry = entries.find(e => e.date === date);
    if (!entry) {
      entry = { date };
      entries.push(entry);
    }
    
    if (id === 'new') {
      BS_FIELDS.forEach(f => {
        if (f.id === 'body_fat') return;
        const v = parseFloat(overlay.querySelector('#bsf-' + f.id)?.value);
        if (!isNaN(v) && v > 0) entry[f.id] = v;
      });
    } else {
      const val = parseFloat(overlay.querySelector('#bsf-' + id).value);
      if (!isNaN(val) && val > 0) {
        entry[id] = val;
        if (id === 'weight') {
          const m = await DB.Metrics.latest();
          await DB.Metrics.save(val, m?.height || 180);
        }
      }
    }
    bsSave(entries);
    close();
    renderBodyStats();
    Toast.show('Saved successfully', 'success');
  };
};

window.bsHistToggle = function(el) { el.classList.toggle('open'); };
window.bsDeleteEntry = async function(dateIso) {
  const ok = await confirmDialog({
    title: 'Delete entry?',
    message: 'Measurements for ' + bsFmtDate(dateIso) + ' will be removed.',
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return;
  bsSave(bsLoad().filter((e) => e.date !== dateIso));
  renderBodyStats();
};
