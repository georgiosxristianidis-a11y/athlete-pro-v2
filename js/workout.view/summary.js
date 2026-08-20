// @ts-check
import { fmtVol } from '../shared/format.js';
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
   │   setsDone: 24,        // PANDA-1 bamboo ledger     │
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

   Phase W-2-B delivered: buildSessionSummary() now lives in
   js/workout.store.js (single source of truth, isUnilateral×2,
   Camera-4 noDb filter, PR detection via Epley). This file does
   string assembly only — no data computation.
   ════════════════════════════════════════════════════════ */

import { esc } from '../shared/utils.js';
import { chamberPill, blockLabel } from '../shared/chamber-pill.js';
import { blockTicks } from '../shared/block-ticks.js';
import { t } from '../locale.store.js';
import { flag } from '../flags.js';
import { emitMood, ledgerVerdictKey } from '../shared/panda-mood.js';

/* ── PPL colour map (semantic, not decorative) ─────────── */
const PPL_COLOR = {
  push: 'var(--c-push)',
  pull: 'var(--c-pull)',
  legs: 'var(--c-legs)',
};

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

/** Formats kg volume: ≥1000 → '1.5t', else '420 kg' */
function _fmtTon(kg) {
  if (!kg) return '—';
  return fmtVol(kg);
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
 * @param {number} staggerIdx  for CSS animation-delay — он же позиция блока
 * @param {number} blockCount  сколько всего блоков в сессии
 * @returns {string}
 */
function _blockIsland(block, pplColor, staggerIdx, blockCount) {
  // block.label is provided by buildSessionSummary (Lead W-2-B); blockLabel() as fallback.
  const label = block.label || blockLabel(block.id);
  const isCore = block.id === 'core' || block.id === 'align';

  // Та же полоска этапов, что в живом логгере: отчёт читается тем же
  // языком, каким тренировка шла, — без переучивания на второй словарь.
  const ticks = blockTicks({
    index: staggerIdx,
    total: blockCount,
    color: pplColor,
    label,
  });

  const pillHTML = chamberPill({
    label,
    color: pplColor,
    mode: 'completed',
    time: block.durationStr ?? undefined,
    tonnage: (!isCore && block.tonnage) ? _fmtTon(block.tonnage) : undefined,
    ticks,
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
      ${flag('panda-moods') ? `<div class="summ-mascot-line">${esc(t('mascot.dropped_bamboo'))}</div>` : ''}
    </div>`;
}

/* ── PANDA-1, сценарий 1 «Бамбуковый счёт» ──────────────
   Ядро шутки в цифрах: панда съедает по стеблю на каждый твой подход, так что
   счёт всегда равный. Обойти её можно только рекордом — оттого «Ничья» и
   работает как мягкий укол, а не как поражение. */
const ICON_BAMBOO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
  <path d="M10 3v18"/><path d="M7 8h6"/><path d="M7 13h6"/><path d="M7 18h6"/>
  <path d="M13 6c2.4 0 4-1.6 4-3.6-2.4 0-4 1.6-4 3.6z"/>
</svg>`;

/**
 * Renders the bamboo ledger (only when the mascot is enabled and sets were done).
 * @param {object} data summaryData
 * @returns {string}
 */
function _ledgerSection(data) {
  if (!flag('panda-moods')) return '';
  const n = data.setsDone || 0;
  if (n <= 0) return '';

  const verdict = t(ledgerVerdictKey((data.prs || []).length));

  // Лесенка живёт на СТРОКАХ, не на карточке: счёт заполняется на глазах, а
  // рамка стоит с первого кадра. Класс .stagger-item здесь был бы вторым
  // движением поверх этого — и он же тянул мёртвый --stagger-i:100 (эту
  // переменную читает только .summ-island, у неё 100 означало бы 8с задержки).
  return `
    <div class="summ-ledger">
      <div class="summ-ledger-header">
        ${ICON_BAMBOO}
        <span class="summ-ledger-title">${esc(t('mascot.ledger_title'))}</span>
      </div>
      <div class="summ-ledger-row" style="--stagger-i:0">
        <span class="summ-ledger-who">${esc(t('mascot.ledger_you'))}<span class="summ-ledger-unit">${esc(t('mascot.ledger_sets'))}</span></span>
        <span class="summ-ledger-val">${n}</span>
      </div>
      <div class="summ-ledger-row" style="--stagger-i:1">
        <span class="summ-ledger-who">${esc(t('mascot.ledger_me'))}<span class="summ-ledger-unit">${esc(t('mascot.ledger_bamboo'))}</span></span>
        <span class="summ-ledger-val">${n}</span>
      </div>
      <div class="summ-ledger-verdict" style="--stagger-i:2">${esc(verdict)}</div>
    </div>`;
}

/* ── INTEL-1: session RPE chips ────────────────────────────
   Inline 1-10 strip, optional — no selection = null.
   Mutates summaryData.sessionRpe on tap so the value travels
   to _persistFinalSession without extra plumbing. */

/**
 * Разметка полосы. Подпись «RPE» — аббревиатура, одна в обеих локалях.
 * @returns {string}
 */
function _rpeSection() {
  const chips = [];
  for (let i = 1; i <= 10; i++) chips.push(
    `<button class="summ-rpe-chip" data-rpe="${i}" type="button">${i}</button>`
  );
  return `
    <div class="summ-rpe-strip">
      <div class="summ-rpe-label">RPE</div>
      <div class="summ-rpe-chips">${chips.join('')}</div>
    </div>`;
}

/**
 * Wires tap handlers on RPE chip buttons.
 * @param {HTMLElement} container
 * @param {object} data  summaryData ref
 */
function _wireRpeChips(container, data) {
  for (const btn of container.querySelectorAll('.summ-rpe-chip')) {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.rpe);
      const wasActive = btn.classList.contains('active');
      for (const b of container.querySelectorAll('.summ-rpe-chip')) b.classList.remove('active');
      if (wasActive) {
        data.sessionRpe = null;
      } else {
        btn.classList.add('active');
        data.sessionRpe = val;
      }
    });
  }
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

  const blockList = data.blocks || [];
  const blocksHTML = blockList
    .map((block, i) => _blockIsland(block, pplColor, i, blockList.length))
    .join('');

  const prHTML = _prSection(data.prs);
  const ledgerHTML = _ledgerSection(data);
  const rpeHTML = _rpeSection();
  data.sessionRpe = null;

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
        ${ledgerHTML}
      </div>

      ${rpeHTML}

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
  _wireRpeChips(overlay, data);

  // PANDA-1, сценарий 4: рекорд — единственный момент, когда панда перестаёт
  // жевать. Держим ликование 4с и отпускаем обратно к базовой мимике.
  // Волна идёт под вердикт бамбукового счёта — ту самую строку, что читают
  // в сводке. Реплики нет (счёт не показан) → волны тоже нет.
  if (flag('panda-moods') && (data.prs || []).length > 0) {
    const verdict = (data.setsDone || 0) > 0 ? t(ledgerVerdictKey(data.prs.length)) : '';
    emitMood('cheer', { hold: 4000, say: verdict });
  }

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

// Phase W-2-B note: the previous buildMinimalSummary() stub here has been
// superseded by buildSessionSummary() in js/workout.store.js (single source
// of truth for the summaryData shape). View files should not own data
// computation — that includes block grouping, tonnage, and PR detection.
