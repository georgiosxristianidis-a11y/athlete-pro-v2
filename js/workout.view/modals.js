// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/modals.js — Modal overlays
   Plan editor, exercise picker, replace exercise modal
   ════════════════════════════════════════════════════════ */

import { Toast } from '../shell.js';
import { esc } from '../shared/utils.js';
import { confirmDialog } from '../shared/confirm.js';
import { mountSegPills } from '../ui/seg-pill.js';
import { t } from '../locale.store.js';
import { on, onChange, onInput } from '../events.js';

const W = () => window.Workout;
onChange('wo:planName', (el, e) =>
  W()._updatePlanName(el.dataset.type, +el.dataset.pi, e.target.value)
);
onChange('wo:planTag', (el, e) =>
  W()._updatePlanTag(el.dataset.type, +el.dataset.pi, e.target.value)
);
on('wo:planAdjust', (el) =>
  W()._adjustPlan(el.dataset.type, +el.dataset.pi, el.dataset.field, +el.dataset.delta)
);
on('wo:planDelete', (el) => W()._deletePlanEx(el.dataset.type, +el.dataset.pi));
on('wo:planAddEx', (el) => W()._addPlanEx(el.dataset.type));
on('wo:planClose', () => W()._closePlanEditor());
on('wo:planWeek', (el) => W()._switchPlanWeek(el.dataset.week));
on('wo:planPreset', (el) => W()._loadPreset(el.dataset.preset));
onInput('wo:planSearch', (el, e) => W()._setPlanSearch(e.target.value));
on('wo:planTab', (el) => W()._switchPlanTab(el.dataset.type));
on('wo:planSave', () => W()._savePlanAndClose());
import {
  State,
  loadPlan,
  savePlan,
  persistSession,
  getWeekMode,
  setWeekMode,
  getExerciseLibrary,
  PPL_GIO_PLAN,
  PPL_HYBRID_PLAN,
} from '../workout.store.js';
import { svgArrow, renderActive } from './render.js';

function _haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/** Numeric coercion for dataset indices — NaN-safe fallback avoids corrupting splice(). */
function n(v, fallback = 0) {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ════════════════════════════════════════════════════════
   PLAN EDITOR — module-level closure state
   (re-assigned by openPlanEditor each time it opens)
   ════════════════════════════════════════════════════════ */
let _planEditorActiveTab = () => 'push';
let _planEditorActiveWeek = () => getWeekMode();
let _planEditorSetTab = () => {};
let _planEditorSetWeek = (_w) => {};

/**
 * Factory: builds the inner HTML for one PPL tab in the Plan Editor.
 * Pure function — no DOM reads/writes.
 * @param {'push'|'pull'|'legs'} type
 * @param {'A'|'B'} activeWeek
 * @param {string} searchQuery
 * @returns {string} HTML string
 */
export function _buildPlanTabHTML(type, activeWeek, searchQuery) {
  const plan = loadPlan(activeWeek);
  let exercises = plan[type] || [];
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    exercises = exercises.filter((ex) => ex.name.toLowerCase().includes(q));
  }

  const exercisesHTML =
    exercises.length > 0
      ? exercises
          .map((ex) => {
            const originalIndex = plan[type].indexOf(ex);
            return `
    <div class="plan-row" id="plan-row-${type}-${originalIndex}" data-pi="${originalIndex}">
      <div class="plan-drag-handle" role="img" aria-label="${esc(t('train.reorder'))}">
        <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11" aria-hidden="true">
          <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
          <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
          <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
        </svg>
      </div>
      <input class="plan-input" value="${esc(ex.name)}"
        data-change="wo:planName" data-type="${type}" data-pi="${originalIndex}">
      <div class="plan-row-meta">
        <span class="plan-meta-label">${esc(t('train.plan_tag'))}</span>
        <input class="plan-tag-input" value="${esc(ex.tag || '')}" placeholder="—" maxlength="8"
          title="${esc(t('train.tag_hint'))}"
          data-change="wo:planTag" data-type="${type}" data-pi="${originalIndex}">
        <span class="plan-meta-label">${esc(t('train.plan_sets'))}</span>
        <div class="mini-stepper">
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="sets" data-delta="-1" aria-label="${esc(t('train.dec_sets'))}">${svgArrow('minus')}</button>
          <span id="ps-sets-${type}-${originalIndex}">${ex.sets}</span>
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="sets" data-delta="1" aria-label="${esc(t('train.inc_sets'))}">${svgArrow('plus')}</button>
        </div>
        <span class="plan-meta-label">${esc(t('train.plan_reps'))}</span>
        <div class="mini-stepper">
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="reps" data-delta="-1" aria-label="${esc(t('train.dec_reps'))}">${svgArrow('minus')}</button>
          <span id="ps-reps-${type}-${originalIndex}">${ex.reps}</span>
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="reps" data-delta="1" aria-label="${esc(t('train.inc_reps'))}">${svgArrow('plus')}</button>
        </div>
        <button class="plan-delete" data-action="wo:planDelete" data-type="${type}" data-pi="${originalIndex}" aria-label="${esc(t('train.remove_ex'))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="14" height="14">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>`;
          })
          .join('')
      : `<div class="plan-empty">${esc(t('train.plan_empty', { q: searchQuery }))}</div>`;

  return (
    exercisesHTML +
    `
    <button class="btn-add-ex" data-action="wo:planAddEx" data-type="${type}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" width="16" height="16">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      ${esc(t('train.add_exercise'))}
    </button>`
  );
}

/* ════════════════════════════════════════════════════════
   PLAN EDITOR MODAL
   ════════════════════════════════════════════════════════ */
export function openPlanEditor() {
  let activeWeek = getWeekMode();
  let activeTab = 'push';
  let plan = loadPlan(activeWeek);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'plan-editor-overlay';

  function tabContent(type) {
    plan = loadPlan(activeWeek); // keep local cache fresh
    return _buildPlanTabHTML(type, activeWeek, searchQuery);
  }

  let searchQuery = '';

  function render() {
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div class="modal-title">${esc(t('train.edit_plan'))}</div>
          <button class="btn-icon-sm" data-action="wo:planClose" aria-label="${esc(t('train.plan_close'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Week toggle -->
        <div class="plan-week-row">
          <span class="plan-preset-label">${esc(t('train.plan_week'))}</span>
          <div class="week-segment" role="tablist">
            <button class="week-seg-btn ${activeWeek === 'A' ? 'active' : ''}"
                    data-action="wo:planWeek" data-week="A" role="tab"
                    aria-selected="${activeWeek === 'A'}">A</button>
            <button class="week-seg-btn ${activeWeek === 'B' ? 'active' : ''}"
                    data-action="wo:planWeek" data-week="B" role="tab"
                    aria-selected="${activeWeek === 'B'}">B</button>
          </div>
          <span class="plan-week-hint">${esc(activeWeek === 'A' ? t('train.week_hint_a') : t('train.week_hint_b'))}</span>
        </div>

        <!-- Preset loader -->
        <div class="plan-preset-row">
          <span class="plan-preset-label">${esc(t('train.plan_preset'))}</span>
          <button class="btn-preset" data-action="wo:planPreset" data-preset="ppl-gio">PPL | GIO</button>
          <button class="btn-preset" data-action="wo:planPreset" data-preset="ppl-hybrid">Hybrid v1</button>
        </div>

        <!-- Search bar -->
        <div class="plan-search-wrap">
          <svg class="plan-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input class="plan-search-input" id="plan-search" type="text"
                 placeholder="${esc(t('train.plan_search'))}" value="${esc(searchQuery)}"
                 data-input="wo:planSearch">
        </div>

        <div class="plan-tabs">
          ${['push', 'pull', 'legs']
            .map(
              (day) => `
            <button class="plan-tab ${day === activeTab ? 'active' : ''}"
                    data-type="${day}"
                    data-action="wo:planTab">
              ${esc(t(`train.cat_${day}`))}
            </button>`
            )
            .join('')}
        </div>
        <div class="plan-list" id="plan-list">
          ${tabContent(activeTab)}
        </div>
        <button class="btn btn-primary" id="plan-save-btn" style="margin-top:var(--sp-2)"
                data-action="wo:planSave">
          <span class="morph-swap">
            <svg class="ic-idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>
            <svg class="ic-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </span>
          ${esc(t('train.save_plan'))}
        </button>
      </div>`;
    requestAnimationFrame(() => mountSegPills(overlay));
  }

  render();
  requestAnimationFrame(_initPlanDrag);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closePlanEditor();
  });

  _planEditorActiveTab = () => activeTab;
  _planEditorActiveWeek = () => activeWeek;
  _planEditorSetTab = (t) => {
    activeTab = t;
    render();
    requestAnimationFrame(_initPlanDrag);
  };
  _planEditorSetWeek = (w) => {
    activeWeek = w;
    render();
    requestAnimationFrame(_initPlanDrag);
  };
  window._planSetSearch = (q) => {
    searchQuery = q;
    render();
  };
}

export function _switchPlanWeek(week) {
  setWeekMode(week);
  _planEditorSetWeek(week);
}

export function _switchPlanTab(type) {
  _planEditorSetTab(type);
}

export function _setPlanSearch(query) {
  if (window._planSetSearch) {
    window._planSetSearch(query);
  }
}

/**
 * Пресеты плана. Ключ = data-preset кнопки, label — то, что видит человек
 * в диалоге и тосте (одно имя на все три места, чтобы не расходилось).
 */
const PLAN_PRESETS = {
  'ppl-gio': { plan: PPL_GIO_PLAN, label: 'PPL | GIO' },
  'ppl-hybrid': { plan: PPL_HYBRID_PLAN, label: 'PPL | Hybrid v1' },
};

export async function _loadPreset(presetName) {
  const entry = PLAN_PRESETS[presetName];
  if (!entry) return;
  const { plan: preset, label } = entry;
  const ok = await confirmDialog({
    title: t('train.load_preset', { label }),
    message: t('train.load_preset_msg'),
    confirmLabel: t('train.load'),
    cancelLabel: t('train.cancel'),
  });
  if (!ok) return;
  savePlan(JSON.parse(JSON.stringify(preset.weekA)), 'A');
  savePlan(JSON.parse(JSON.stringify(preset.weekB)), 'B');
  _closePlanEditor();
  openPlanEditor();
  Toast.show(t('train.preset_loaded', { label }), 'success');
}

export function _closePlanEditor() {
  const el = document.getElementById('plan-editor-overlay');
  if (el) el.remove();
}

const _checklistState = new Array(6).fill(false);

export function toggleChecklist(i) {
  _checklistState[i] = !_checklistState[i];
  const item = document.getElementById(`chk-pre-${i}`);
  if (item) item.classList.toggle('checked', _checklistState[i]);
  _haptic(8);
}

export function _savePlanAndClose() {
  const btn = document.getElementById('plan-save-btn');
  if (!btn || btn.classList.contains('is-done')) {
    _closePlanEditor();
    Toast.show(t('train.plan_saved'), 'success');
    return;
  }
  btn.classList.add('is-done');
  btn.disabled = true;
  setTimeout(() => {
    _closePlanEditor();
    Toast.show(t('train.plan_saved'), 'success');
  }, 380);
}

export function _updatePlanName(type, i, val) {
  const w = _planEditorActiveWeek();
  const plan = loadPlan(w);
  plan[type][i].name = val.trim() || plan[type][i].name;
  savePlan(plan, w);
}

/**
 * ABBR-1 п.2 — user-set display override, Island-only (see islandLabel()).
 * Never touches ex.name/alias, so it carries no history-lookup meaning.
 */
export function _updatePlanTag(type, i, val) {
  const w = _planEditorActiveWeek();
  const plan = loadPlan(w);
  const trimmed = val.trim();
  if (trimmed) plan[type][i].tag = trimmed;
  else delete plan[type][i].tag;
  savePlan(plan, w);
}

export function _adjustPlan(type, i, field, delta) {
  const w = _planEditorActiveWeek();
  const plan = loadPlan(w);
  const min = field === 'sets' ? 1 : 1;
  plan[type][i][field] = Math.max(min, plan[type][i][field] + delta);
  savePlan(plan, w);
  const el = document.getElementById(`ps-${field}-${type}-${i}`);
  if (el) el.textContent = plan[type][i][field];
}

export function _addPlanEx(type) {
  openExercisePickerModal(type, (exercise) => {
    const w = _planEditorActiveWeek();
    const plan = loadPlan(w);
    plan[type].push({ name: exercise.name, sets: 3, reps: 10, weight: 0 });
    savePlan(plan, w);
    _switchPlanTab(type);
  });
}

export function _deletePlanEx(type, i) {
  const w = _planEditorActiveWeek();
  const plan = loadPlan(w);
  plan[type].splice(i, 1);
  savePlan(plan, w);
  _switchPlanTab(_planEditorActiveTab());
}

/* ── Drag-and-drop for plan editor (co-located: uses closure vars above) ── */
function _initPlanDrag() {
  const list = document.getElementById('plan-list');
  if (!list) return;

  list.querySelectorAll('.plan-row').forEach((row) => {
    const handle = row.querySelector('.plan-drag-handle');
    if (!handle) return;

    let dragging = false;
    let startY = 0;
    let raf = 0;
    let lastClientY = 0;
    const srcIdx = n(row.dataset.pi);
    /** @type {{el:HTMLElement, top:number, bottom:number}[]} */
    let cachedRects = [];

    // Same fix as _initDrag (BUG-3): rects cached once on pointerdown, moves
    // coalesced into one rAF — zero layout reads on the pointermove hot path.
    function paint() {
      raf = 0;
      row.style.transform = `translateY(${lastClientY - startY}px)`;
      row.style.zIndex = '50';
      for (const r of cachedRects) {
        r.el.classList.toggle('plan-row-over', lastClientY >= r.top && lastClientY <= r.bottom);
      }
    }

    handle.addEventListener('pointerdown', (e) => {
      if (dragging) return; // guard: ignore re-entrant pointerdown (multi-touch/stylus)
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startY = e.clientY;
      lastClientY = e.clientY;
      handle.setPointerCapture(e.pointerId);
      row.classList.add('plan-row-dragging');
      _haptic(15);
      cachedRects = [];
      list.querySelectorAll('.plan-row').forEach((other) => {
        if (other === row) return;
        const rect = other.getBoundingClientRect();
        cachedRects.push({
          el: /** @type {HTMLElement} */ (other),
          top: rect.top,
          bottom: rect.bottom,
        });
      });
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      lastClientY = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    });

    handle.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      row.style.transform = '';
      row.style.zIndex = '';
      row.classList.remove('plan-row-dragging');

      let dropIdx = srcIdx;
      for (const r of cachedRects) {
        if (r.el.classList.contains('plan-row-over')) {
          dropIdx = n(r.el.dataset.pi, srcIdx);
          r.el.classList.remove('plan-row-over');
        }
      }
      cachedRects = [];

      if (dropIdx !== srcIdx) {
        const type = _planEditorActiveTab();
        const w = _planEditorActiveWeek();
        const p = loadPlan(w);
        const moved = p[type].splice(srcIdx, 1)[0];
        p[type].splice(dropIdx, 0, moved);
        savePlan(p, w);
        _switchPlanTab(type);
      }
    });
  });
}

/* ════════════════════════════════════════════════════════
   EXERCISE PICKER MODAL
   ════════════════════════════════════════════════════════ */
export async function openExercisePickerModal(filterCategory, onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'add-ex-overlay';

  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">${esc(t('train.add_exercise'))}</div>
        <button class="btn-icon-sm" id="add-ex-close" aria-label="${esc(t('train.picker_close'))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Search -->
      <div class="add-ex-search-wrap">
        <input class="add-ex-search" id="add-ex-search"
               type="text" placeholder="${esc(t('train.plan_search'))}"
               autocomplete="off" autocorrect="off" spellcheck="false">
      </div>

      <!-- Category filters -->
      <div style="display:flex;gap:var(--sp-1);flex-wrap:wrap;padding:var(--sp-1-5) 0 var(--sp-0-5)">
        <button class="pill-filter ${filterCategory === 'all' || !filterCategory ? 'active' : ''}" data-cat="all">${esc(t('train.cat_all'))}</button>
        <button class="pill-filter ${filterCategory === 'push' ? 'active' : ''}" data-cat="push">${esc(t('train.cat_push'))}</button>
        <button class="pill-filter ${filterCategory === 'pull' ? 'active' : ''}" data-cat="pull">${esc(t('train.cat_pull'))}</button>
        <button class="pill-filter ${filterCategory === 'legs' ? 'active' : ''}" data-cat="legs">${esc(t('train.cat_legs'))}</button>
        <button class="pill-filter" data-cat="core">${esc(t('train.core'))}</button>
      </div>

      <!-- Results count -->
      <div style="font-size:var(--fs-1);color:var(--c-text-3);padding:var(--sp-1) 0">
        <span id="add-ex-count">${esc(t('train.loading'))}</span>
      </div>

      <!-- Exercise list -->
      <div class="add-ex-list" id="add-ex-list" style="flex:1;overflow-y:auto"></div>

      <!-- Custom exercise -->
      <div style="padding-top:var(--sp-1-5);margin-top:var(--sp-0-5)">
        <input class="add-ex-search" id="add-ex-custom"
               type="text" placeholder="${esc(t('train.custom_ph'))}"
               autocomplete="off" style="margin-bottom:var(--sp-1)">
        <button class="btn btn-primary btn-sm" id="add-ex-add-custom" style="width:100%">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          ${esc(t('train.use_custom'))}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const searchEl = overlay.querySelector('#add-ex-search');
  const customEl = overlay.querySelector('#add-ex-custom');
  const listEl = overlay.querySelector('#add-ex-list');
  const countEl = overlay.querySelector('#add-ex-count');
  const filterBtns = overlay.querySelectorAll('.pill-filter');

  let activeFilter = filterCategory || 'all';
  let allExercises = [];
  let currentQuery = '';

  try {
    allExercises = await getExerciseLibrary();
    renderList();
  } catch (err) {
    listEl.innerHTML = `<div class="add-ex-empty">${esc(t('train.load_fail'))}</div>`;
    countEl.textContent = t('train.load_error_lib');
  }

  function renderList() {
    let filtered = allExercises;

    if (activeFilter !== 'all') {
      filtered = filtered.filter((ex) => ex.category === activeFilter);
    }

    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      filtered = filtered.filter((ex) => {
        const nameMatch = ex.name.toLowerCase().includes(q);
        const tagsMatch = ex.tags?.some((t) => t.toLowerCase().includes(q));
        const muscleMatch =
          ex.primaryMuscles?.some((m) => m.toLowerCase().includes(q)) ||
          ex.secondaryMuscles?.some((m) => m.toLowerCase().includes(q));
        return nameMatch || tagsMatch || muscleMatch;
      });
    }

    countEl.textContent = t('train.ex_count', { n: filtered.length });
    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = `<div class="add-ex-empty">${esc(t('train.picker_empty'))}</div>`;
      return;
    }

    filtered.slice(0, 50).forEach((ex) => {
      const btn = document.createElement('button');
      btn.className = 'add-ex-item';
      btn.style.cssText = 'text-align:left;padding:var(--sp-1-5);height:auto';
      btn.innerHTML = `
        <div style="font-weight:var(--fw-bold);font-size:var(--fs-2);color:var(--c-text-1)">${esc(ex.name)}</div>
        <div style="font-size:var(--fs-1);color:var(--c-text-3);margin-top:var(--sp-0-5);display:flex;gap:var(--sp-1);flex-wrap:wrap">
          <span style="text-transform:capitalize">${esc(ex.muscleGroup)}</span>
          <span>·</span>
          <span style="text-transform:capitalize">${esc(ex.equipment)}</span>
          <span>·</span>
          <span style="text-transform:capitalize">${esc(ex.mechanic)}</span>
        </div>
      `;
      btn.dataset.name = ex.name;
      listEl.appendChild(btn);
    });
  }

  searchEl.addEventListener('input', () => {
    currentQuery = searchEl.value;
    renderList();
  });

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => {
        b.classList.remove('active');
        b.style.cssText = '';
      });
      btn.classList.add('active');
      activeFilter = btn.dataset.cat;
      renderList();
    });
  });

  const addCustomBtn = overlay.querySelector('#add-ex-add-custom');
  addCustomBtn.addEventListener('click', () => {
    const customName = customEl.value.trim();
    if (customName) {
      overlay.remove();
      // W-1: custom:true tells the caller this name is NOT in the library
      // and should be flagged so it's not aliased to a known lift.
      onSelect({ name: customName, custom: true });
      _haptic(15);
    }
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-name]');
    if (!btn) return;
    const name = btn.dataset.name.trim();
    if (name) {
      overlay.remove();
      onSelect({ name, custom: false });
      _haptic(15);
    }
  });

  overlay.querySelector('#add-ex-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  requestAnimationFrame(() => searchEl.focus());
}

/* ════════════════════════════════════════════════════════
   REPLACE EXERCISE MODAL
   ════════════════════════════════════════════════════════ */
export async function openReplaceExModal(ei) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'replace-ex-overlay';

  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">${esc(t('train.replace'))}</div>
        <button class="btn-icon-sm" id="replace-ex-close" aria-label="${esc(t('train.picker_close'))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Search -->
      <div class="add-ex-search-wrap">
        <input class="add-ex-search" id="replace-ex-search"
               type="text" placeholder="${esc(t('train.plan_search'))}"
               autocomplete="off" autocorrect="off" spellcheck="false">
      </div>

      <!-- Category filters -->
      <div style="display:flex;gap:var(--sp-1);flex-wrap:wrap;padding:var(--sp-1-5) 0 var(--sp-0-5)">
        <button class="pill-filter active" data-cat="all" style="border-color:var(--c-accent);color:var(--c-accent);background:rgba(0,200,110,0.08)">${esc(t('train.cat_all'))}</button>
        <button class="pill-filter" data-cat="push" style="border-color:var(--c-indigo);color:var(--c-indigo);background:rgba(99,102,241,0.08)">${esc(t('train.cat_push'))}</button>
        <button class="pill-filter" data-cat="pull" style="border-color:var(--c-cyan);color:var(--c-cyan);background:rgba(6,182,212,0.08)">${esc(t('train.cat_pull'))}</button>
        <button class="pill-filter" data-cat="legs" style="border-color:var(--c-blue);color:var(--c-blue);background:var(--c-blue-bg)">${esc(t('train.cat_legs'))}</button>
        <button class="pill-filter" data-cat="core" style="border-color:var(--c-cyan);color:var(--c-cyan);background:var(--c-cyan-bg)">${esc(t('train.core'))}</button>
      </div>

      <!-- Results count -->
      <div style="font-size:var(--fs-1);color:var(--c-text-3);padding:var(--sp-1) 0">
        <span id="replace-count">${esc(t('train.loading'))}</span>
      </div>

      <!-- Exercise list -->
      <div class="add-ex-list" id="replace-ex-list" style="flex:1;overflow-y:auto"></div>

      <!-- Custom exercise -->
      <div style="padding-top:var(--sp-1-5);margin-top:var(--sp-0-5)">
        <input class="add-ex-search" id="replace-custom"
               type="text" placeholder="${esc(t('train.custom_ph'))}"
               autocomplete="off" style="margin-bottom:var(--sp-1)">
        <button class="btn btn-primary btn-sm" id="replace-add-custom" style="width:100%">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          ${esc(t('train.use_custom'))}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const searchEl = overlay.querySelector('#replace-ex-search');
  const customEl = overlay.querySelector('#replace-custom');
  const listEl = overlay.querySelector('#replace-ex-list');
  const countEl = overlay.querySelector('#replace-count');
  const filterBtns = overlay.querySelectorAll('.pill-filter');

  let activeFilter = 'all';
  let allExercises = [];
  let currentQuery = '';

  try {
    allExercises = await getExerciseLibrary();
    renderList();
  } catch (err) {
    listEl.innerHTML = `<div class="add-ex-empty">${esc(t('train.load_fail'))}</div>`;
    countEl.textContent = t('train.load_error_lib');
  }

  function renderList() {
    let filtered = allExercises;

    if (activeFilter !== 'all') {
      filtered = filtered.filter((ex) => ex.category === activeFilter);
    }

    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      filtered = filtered.filter((ex) => {
        const nameMatch = ex.name.toLowerCase().includes(q);
        const tagsMatch = ex.tags?.some((t) => t.toLowerCase().includes(q));
        const muscleMatch =
          ex.primaryMuscles?.some((m) => m.toLowerCase().includes(q)) ||
          ex.secondaryMuscles?.some((m) => m.toLowerCase().includes(q));
        return nameMatch || tagsMatch || muscleMatch;
      });
    }

    countEl.textContent = t('train.ex_count', { n: filtered.length });
    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = `<div class="add-ex-empty">${esc(t('train.picker_empty'))}</div>`;
      return;
    }

    filtered.slice(0, 50).forEach((ex) => {
      const btn = document.createElement('button');
      btn.className = 'add-ex-item';
      btn.style.cssText = 'text-align:left;padding:var(--sp-1-5);height:auto';
      btn.innerHTML = `
        <div style="font-weight:var(--fw-bold);font-size:var(--fs-2);color:var(--c-text-1)">${esc(ex.name)}</div>
        <div style="font-size:var(--fs-1);color:var(--c-text-3);margin-top:var(--sp-0-5);display:flex;gap:var(--sp-1);flex-wrap:wrap">
          <span style="text-transform:capitalize">${esc(ex.muscleGroup)}</span>
          <span>·</span>
          <span style="text-transform:capitalize">${esc(ex.equipment)}</span>
          <span>·</span>
          <span style="text-transform:capitalize">${esc(ex.mechanic)}</span>
        </div>
      `;
      btn.dataset.name = ex.name;
      listEl.appendChild(btn);
    });
  }

  searchEl.addEventListener('input', () => {
    currentQuery = searchEl.value;
    renderList();
  });

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => {
        b.classList.remove('active');
        b.style.cssText = '';
      });
      btn.classList.add('active');
      activeFilter = btn.dataset.cat;
      renderList();
    });
  });

  const addCustomBtn = overlay.querySelector('#replace-add-custom');
  addCustomBtn.addEventListener('click', () => {
    const customName = customEl.value.trim();
    if (customName) {
      State.plan[ei].name = customName;
      persistSession();
      overlay.remove();
      const nameEl = document.querySelector(`#ex-card-${ei} .exercise-name`);
      if (nameEl) nameEl.textContent = customName;
      _haptic(15);
      Toast.show(t('train.replace_with', { name: customName }), 'info');
    }
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-name]');
    if (!btn) return;
    const name = btn.dataset.name.trim();
    if (name) {
      State.plan[ei].name = name;
      persistSession();
      overlay.remove();
      const nameEl = document.querySelector(`#ex-card-${ei} .exercise-name`);
      if (nameEl) nameEl.textContent = name;
      _haptic(15);
      Toast.show(t('train.replace_with', { name }), 'info');
    }
  });

  overlay.querySelector('#replace-ex-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  requestAnimationFrame(() => searchEl.focus());
}
