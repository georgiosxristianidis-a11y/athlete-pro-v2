// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/summary.js — Post-Workout Summary UI
   W-2-C: 4-chamber Glass Cluster report sheet.

   Contract (input):
   ┌─────────────────────────────────────────────────────┐
   │ summaryData = {                                     │
   │   type: 'push'|'pull'|'legs',                       │
   │   timeStr: '1h 23m',                                │
   │   totalTonnage: 4200,   // kg                       │
   │   totalReps: 187,                                   │
   │   blocks: [                                         │
   │     {                                               │
   │       id: 'power',                                  │
   │       label: 'POWER',   // UPPERCASE semantic label  │
   │       durationStr: '18m',   // null if no timings   │
   │       tonnage: 2400,                                │
   │       exercises: [                                  │
   │         { name, doneSets, totalSets, weightStr,     │
   │           noDb: bool }                              │
   │       ],                                            │
   │     }                                               │
   │   ],                                                │
   │   prs: [{ name, weight, reps }],  // may be empty   │
   │ }                                                   │
   └─────────────────────────────────────────────────────┘

   Until Lead (Opus) delivers buildSessionSummary() (Phase W-2-B),
   completeSession() in handlers.js builds a minimal summaryData
   from State inline and passes it here.
   ════════════════════════════════════════════════════════ */

import { esc } from '../shared/utils.js';
import { chamberPill, blockLabel } from '../shared/chamber-pill.js';

/* ── PPL colour map (semantic, not decorative) ─────────── */
const PPL_COLOR = {
  push: 'var(--c-push)',
  pull: 'var(--c-pull)',
  legs: 'var(--c-legs)',
};

/* ── Block → semantic label map ────────────────────────── */
const BLOCK_LABEL = {
  power:     'POWER',
  shape:     'SHAPE',
  width:     'WIDTH',
  thickness: 'THICKNESS',
  heavy:     'HEAVY',
  iso:       'ISO',
  arms:      'ARMS',
  shoulders: 'SHOULDERS',
  core:      'CORE',
  align:     'ALIGN',
};

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

/** Formats kg volume: ≥1000 → '1.5t', else '420 kg' */
function _fmtTon(kg) {
  if (!kg) return '—';
  return kg >= 1000 ? (kg / 1000).toFixed(1) + 't' : kg + ' kg';
}

/**
 * Renders a single exercise row inside a glass cluster.
 * @param {{ name:string, doneSets:number, totalSets:number, weightStr:string, noDb:boolean }} ex
 * @param {string} pplColor
 * @returns {string}
 */
function _exRow(ex, pplColor) {
  const complete = ex.doneSets === ex.totalSets;
  const statusIcon = complete
    ? `<svg class="summ-ex-check" viewBox="0 0 16 16" fill="none" stroke="${pplColor}" stroke-width="2.5" stroke-linecap="round" width="12" height="12"><polyline points="13 4 6 11 3 8"/></svg>`
    : `<span class="summ-ex-partial">${ex.doneSets}/${ex.totalSets}</span>`;

  const uiOnlyTag = ex.noDb
    ? `<span class="summ-ex-ui-tag">UI</span>`
    : '';

  return `
    <div class="summ-ex-row${complete ? ' summ-ex-done' : ''}">
      <span class="summ-ex-name">${esc(ex.name)}${uiOnlyTag}</span>
      <span class="summ-ex-meta">${ex.noDb ? '' : esc(ex.weightStr)}</span>
      <span class="summ-ex-status">${statusIcon}</span>
    </div>`;
}

/**
 * Renders a single glass-cluster island for one training block.
 * @param {{ id:string, label:string, durationStr:string|null, tonnage:number, exercises:Array }} block
 * @param {string} pplColor
 * @param {number} staggerIdx  for CSS animation-delay
 * @returns {string}
 */
function _blockIsland(block, pplColor, staggerIdx) {
  const label = blockLabel(block.id);
  const isCore = block.id === 'core' || block.id === 'align';

  const pillHTML = chamberPill({
    label,
    color: pplColor,
    mode: 'completed',
    time: block.durationStr ?? undefined,
    tonnage: (!isCore && block.tonnage) ? _fmtTon(block.tonnage) : undefined,
  });

  const exRows = (block.exercises || []).map(ex => _exRow(ex, pplColor)).join('');

  return `
    <div class="summ-island stagger-item" style="--stagger-i:${staggerIdx}; --ppl-color:${pplColor}">
      <div class="summ-island-header">${pillHTML}</div>
      <div class="summ-ex-list">${exRows || '<div class="summ-ex-empty">—</div>'}</div>
    </div>`;
}

/**
 * Renders the PR section (only if prs.length > 0).
 * @param {Array<{name:string, weight:number, reps:number}>} prs
 * @returns {string}
 */
function _prSection(prs) {
  if (!prs || prs.length === 0) return '';

  const prRows = prs.map(pr => `
    <div class="summ-pr-row">
      <span class="summ-pr-name">${esc(pr.name)}</span>
      <span class="summ-pr-val">${pr.weight} kg × ${pr.reps}</span>
    </div>`).join('');

  return `
    <div class="summ-pr-section stagger-item" style="--stagger-i:${99}">
      <div class="summ-pr-header">
        <svg viewBox="0 0 16 16" fill="none" stroke="var(--c-gold)" stroke-width="2"
             stroke-linecap="round" width="12" height="12">
          <polygon points="8 1 10 6 15 6 11 9.5 12.5 14.5 8 11.5 3.5 14.5 5 9.5 1 6 6 6 8 1"/>
        </svg>
        <span class="summ-pr-title">PR</span>
      </div>
      ${prRows}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════ */

/**
 * Creates, mounts, and returns the summary modal overlay.
 * The caller (handlers.js) attaches the save callback.
 *
 * @param {object}   data        — summaryData (see contract above)
 * @param {Function} onSave      — async callback called when user taps Save
 * @param {boolean}  [ru=false]  — Russian locale flag
 * @returns {HTMLElement}        — the overlay element (already appended to body)
 */
export function renderSummaryModal(data, onSave, ru = false) {
  const pplColor = PPL_COLOR[data.type] || 'var(--c-accent)';

  const statsGrid = `
    <div class="summ-stats-grid">
      <div class="summ-stat">
        <div class="summ-stat-val">${esc(data.timeStr || '—')}</div>
        <div class="summ-stat-lbl">${ru ? 'ВРЕМЯ' : 'TIME'}</div>
      </div>
      <div class="summ-stat">
        <div class="summ-stat-val">${_fmtTon(data.totalTonnage)}</div>
        <div class="summ-stat-lbl">${ru ? 'ОБЪЁМ' : 'VOLUME'}</div>
      </div>
      <div class="summ-stat">
        <div class="summ-stat-val">${data.totalReps ?? '—'}</div>
        <div class="summ-stat-lbl">${ru ? 'ПОВТОРЫ' : 'REPS'}</div>
      </div>
    </div>`;

  const blocksHTML = (data.blocks || [])
    .map((block, i) => _blockIsland(block, pplColor, i))
    .join('');

  const prHTML = _prSection(data.prs);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay animate-in';
  overlay.style.cssText = 'z-index:6000; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px)';

  overlay.innerHTML = `
    <div class="modal-sheet summ-sheet" style="max-width:440px; margin:auto">
      <div class="modal-handle"></div>

      <div class="summ-header stagger-item" style="--stagger-i:0">
        <div class="summ-header-icon" style="color:${pplColor}" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               width="36" height="36">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <div class="summ-title">${ru ? 'ТРЕНИРОВКА' : 'WORKOUT'} <span style="color:${pplColor}">${data.type.toUpperCase()}</span></div>
        <div class="summ-subtitle" style="color:${pplColor}">${ru ? 'ЗАВЕРШЕНА' : 'COMPLETE'}</div>
      </div>

      ${statsGrid}

      <div class="summ-blocks-wrap">
        ${blocksHTML}
        ${prHTML}
      </div>

      <div class="summ-actions">
        <button class="btn btn-primary summ-save-btn" id="btn-summ-save" style="--btn-accent:${pplColor}">
          ${ru ? 'СОХРАНИТЬ' : 'SAVE SESSION'}
        </button>
        <button class="btn btn-ghost" id="btn-summ-back">
          ${ru ? 'НАЗАД' : 'BACK'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  /* ── Event listeners ── */
  overlay.querySelector('#btn-summ-save')?.addEventListener('click', async () => {
    overlay.classList.add('animate-out');
    setTimeout(async () => {
      overlay.remove();
      await onSave();
    }, 300);
  });

  overlay.querySelector('#btn-summ-back')?.addEventListener('click', () => {
    overlay.classList.add('animate-out');
    setTimeout(() => overlay.remove(), 300);
  });

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('animate-out');
      setTimeout(() => overlay.remove(), 300);
    }
  });

  return overlay;
}

/**
 * Builds a minimal summaryData from State until buildSessionSummary() (W-2-B) is ready.
 * LEAD will replace this with the full version from workout.store.js.
 *
 * @param {object} State   — workout state
 * @param {string} timeStr — formatted duration string
 * @param {number} totalTonnage
 * @param {number} totalReps
 * @param {object} blockTonnage — { power: kg, shape: kg, ... }
 * @returns {object} summaryData
 */
export function buildMinimalSummary(State, timeStr, totalTonnage, totalReps, blockTonnage) {
  // Group exercises by block, preserving order
  const blockMap = new Map();
  for (const ex of State.plan) {
    const id = ex.block || 'custom';
    if (!blockMap.has(id)) blockMap.set(id, []);

    const doneSets = ex.sets.filter(s => s.done).length;
    const totalSets = ex.sets.length;

    // Best completed set for weight display
    const bestSet = ex.sets.filter(s => s.done && s.weight).sort((a, b) => b.weight - a.weight)[0];
    const weightStr = bestSet
      ? (ex.isBW ? `BW${bestSet.weight ? '+' + bestSet.weight : ''}` : `${bestSet.weight} kg`)
      : (ex.isBW ? 'BW' : '—');

    blockMap.get(id).push({ name: ex.name, doneSets, totalSets, weightStr, noDb: !!ex.noDb });
  }

  const blocks = Array.from(blockMap.entries()).map(([id, exercises]) => ({
    id,
    label: (BLOCK_LABEL[id] || id).toUpperCase(),
    durationStr: null,   // Lead will fill from blockTimings (W-2-A)
    tonnage: blockTonnage[id] || 0,
    exercises,
  }));

  return {
    type: State.type,
    timeStr,
    totalTonnage,
    totalReps,
    blocks,
    prs: [],   // Lead will fill from 1RM comparison (W-2-B)
  };
}
