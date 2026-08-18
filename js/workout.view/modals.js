// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/modals.js — Modal overlays
   Plan editor, exercise picker, replace exercise modal
   ════════════════════════════════════════════════════════ */

import { Toast } from '../shell.js';
import { esc } from '../shared/utils.js';
import { confirmDialog } from '../shared/confirm.js';
import { isRu } from '../locale.store.js';
import { on, onChange, onInput } from '../events.js';

const W = () => window.Workout;
onChange('wo:planName',  (el, e) => W()._updatePlanName(el.dataset.type, +el.dataset.pi, e.target.value));
onChange('wo:planTag',   (el, e) => W()._updatePlanTag(el.dataset.type, +el.dataset.pi, e.target.value));
on('wo:planAdjust',      (el) => W()._adjustPlan(el.dataset.type, +el.dataset.pi, el.dataset.field, +el.dataset.delta));
on('wo:planDelete',      (el) => W()._deletePlanEx(el.dataset.type, +el.dataset.pi));
on('wo:planAddEx',       (el) => W()._addPlanEx(el.dataset.type));
on('wo:planClose',       () => W()._closePlanEditor());
on('wo:planWeek',        (el) => W()._switchPlanWeek(el.dataset.week));
on('wo:planPreset',      (el) => W()._loadPreset(el.dataset.preset));
onInput('wo:planSearch', (el, e) => W()._setPlanSearch(e.target.value));
on('wo:planTab',         (el) => W()._switchPlanTab(el.dataset.type));
on('wo:planSave',        () => W()._savePlanAndClose());
import {
  State,
  loadPlan, savePlan,
  persistSession,
  getWeekMode, setWeekMode,
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
    exercises = exercises.filter(ex => ex.name.toLowerCase().includes(q));
  }

  const exercisesHTML = exercises.length > 0
    ? exercises
        .map((ex) => {
          const originalIndex = plan[type].indexOf(ex);
          return `
    <div class="plan-row" id="plan-row-${type}-${originalIndex}" data-pi="${originalIndex}">
      <div class="plan-drag-handle">
        <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
          <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
          <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
          <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
        </svg>
      </div>
      <input class="plan-input" value="${esc(ex.name)}"
        data-change="wo:planName" data-type="${type}" data-pi="${originalIndex}">
      <div class="plan-row-meta">
        <span class="plan-meta-label">Tag</span>
        <input class="plan-tag-input" value="${esc(ex.tag || '')}" placeholder="—" maxlength="8"
          title="Island-only display override — name/history untouched"
          data-change="wo:planTag" data-type="${type}" data-pi="${originalIndex}">
        <span class="plan-meta-label">Sets</span>
        <div class="mini-stepper">
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="sets" data-delta="-1" aria-label="Decrease sets">${svgArrow('minus')}</button>
          <span id="ps-sets-${type}-${originalIndex}">${ex.sets}</span>
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="sets" data-delta="1" aria-label="Increase sets">${svgArrow('plus')}</button>
        </div>
        <span class="plan-meta-label">Reps</span>
        <div class="mini-stepper">
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="reps" data-delta="-1" aria-label="Decrease reps">${svgArrow('minus')}</button>
          <span id="ps-reps-${type}-${originalIndex}">${ex.reps}</span>
          <button data-action="wo:planAdjust" data-type="${type}" data-pi="${originalIndex}" data-field="reps" data-delta="1" aria-label="Increase reps">${svgArrow('plus')}</button>
        </div>
        <button class="plan-delete" data-action="wo:planDelete" data-type="${type}" data-pi="${originalIndex}" aria-label="Remove exercise">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="14" height="14">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>`;
        }).join('')
    : `<div class="plan-empty">No exercises found for "${esc(searchQuery)}"</div>`;

  return exercisesHTML + `
    <button class="btn-add-ex" data-action="wo:planAddEx" data-type="${type}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" width="16" height="16">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add Exercise
    </button>`;
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
          <div class="modal-title">Edit Plan</div>
          <button class="btn-icon-sm" data-action="wo:planClose" aria-label="Close plan editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Week toggle -->
        <div class="plan-week-row">
          <span class="plan-preset-label">Week:</span>
          <div class="week-segment" role="tablist">
            <button class="week-seg-btn ${activeWeek === 'A' ? 'active' : ''}"
                    data-action="wo:planWeek" data-week="A" role="tab"
                    aria-selected="${activeWeek === 'A'}">A</button>
            <button class="week-seg-btn ${activeWeek === 'B' ? 'active' : ''}"
                    data-action="wo:planWeek" data-week="B" role="tab"
                    aria-selected="${activeWeek === 'B'}">B</button>
          </div>
          <span class="plan-week-hint">${activeWeek === 'A' ? 'Biceps focus (Push) · Triceps (Pull)' : 'Triceps focus (Push) · Biceps (Pull)'}</span>
        </div>

        <!-- Preset loader -->
        <div class="plan-preset-row">
          <span class="plan-preset-label">Preset:</span>
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
                 placeholder="Search exercises..." value="${esc(searchQuery)}"
                 data-input="wo:planSearch">
        </div>

        <div class="plan-tabs">
          ${['push', 'pull', 'legs']
            .map(
              (t) => `
            <button class="plan-tab ${t === activeTab ? 'active' : ''}"
                    data-type="${t}"
                    data-action="wo:planTab">
              ${t.charAt(0).toUpperCase() + t.slice(1)}
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
          Save Plan
        </button>
      </div>`;
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
  'ppl-gio':    { plan: PPL_GIO_PLAN,    label: 'PPL | GIO' },
  'ppl-hybrid': { plan: PPL_HYBRID_PLAN, label: 'PPL | Hybrid v1' },
};

export async function _loadPreset(presetName) {
  const entry = PLAN_PRESETS[presetName];
  if (!entry) return;
  const { plan: preset, label } = entry;
  const ru = isRu();
  const ok = await confirmDialog({
    title: ru ? `Загрузить пресет ${label}?` : `Load ${label} preset?`,
    message: ru ? 'Планы недели A и недели B будут заменены.' : 'Both Week A and Week B plans will be replaced.',
    confirmLabel: ru ? 'Загрузить' : 'Load',
    cancelLabel: ru ? 'Отмена' : 'Cancel',
  });
  if (!ok) return;
  savePlan(JSON.parse(JSON.stringify(preset.weekA)), 'A');
  savePlan(JSON.parse(JSON.stringify(preset.weekB)), 'B');
  _closePlanEditor();
  openPlanEditor();
  Toast.show(ru ? `${label} загружен для недель A и B — задай рабочие веса` : `${label} loaded for Week A & B — set your working weights`, 'success');
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
    Toast.show('Plan saved', 'success');
    return;
  }
  btn.classList.add('is-done');
  btn.disabled = true;
  setTimeout(() => {
    _closePlanEditor();
    Toast.show('Plan saved', 'success');
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
        cachedRects.push({ el: /** @type {HTMLElement} */ (other), top: rect.top, bottom: rect.bottom });
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
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
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
        <div class="modal-title">Add Exercise</div>
        <button class="btn-icon-sm" id="add-ex-close" aria-label="Close exercise picker">
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
               type="text" placeholder="Search exercises…"
               autocomplete="off" autocorrect="off" spellcheck="false">
      </div>

      <!-- Category filters -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 4px">
        <button class="pill-filter ${filterCategory === 'all' || !filterCategory ? 'active' : ''}" data-cat="all">All</button>
        <button class="pill-filter ${filterCategory === 'push' ? 'active' : ''}" data-cat="push">Push</button>
        <button class="pill-filter ${filterCategory === 'pull' ? 'active' : ''}" data-cat="pull">Pull</button>
        <button class="pill-filter ${filterCategory === 'legs' ? 'active' : ''}" data-cat="legs">Legs</button>
        <button class="pill-filter" data-cat="core">Core</button>
      </div>

      <!-- Results count -->
      <div style="font-size:var(--fs-1);color:var(--c-text-3);padding:6px 0">
        <span id="add-ex-count">Loading…</span>
      </div>

      <!-- Exercise list -->
      <div class="add-ex-list" id="add-ex-list" style="flex:1;overflow-y:auto"></div>

      <!-- Custom exercise -->
      <div style="padding-top:12px;margin-top:4px">
        <input class="add-ex-search" id="add-ex-custom"
               type="text" placeholder="Or type custom exercise name…"
               autocomplete="off" style="margin-bottom:8px">
        <button class="btn btn-primary btn-sm" id="add-ex-add-custom" style="width:100%">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Use Custom Exercise
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
    listEl.innerHTML = `<div class="add-ex-empty">Failed to load exercises</div>`;
    countEl.textContent = 'Error loading library';
  }

  function renderList() {
    let filtered = allExercises;

    if (activeFilter !== 'all') {
      filtered = filtered.filter(ex => ex.category === activeFilter);
    }

    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      filtered = filtered.filter(ex => {
        const nameMatch = ex.name.toLowerCase().includes(q);
        const tagsMatch = ex.tags?.some(t => t.toLowerCase().includes(q));
        const muscleMatch = ex.primaryMuscles?.some(m => m.toLowerCase().includes(q)) ||
                           ex.secondaryMuscles?.some(m => m.toLowerCase().includes(q));
        return nameMatch || tagsMatch || muscleMatch;
      });
    }

    countEl.textContent = `${filtered.length} exercises`;
    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = `<div class="add-ex-empty">No exercises found</div>`;
      return;
    }

    filtered.slice(0, 50).forEach((ex) => {
      const btn = document.createElement('button');
      btn.className = 'add-ex-item';
      btn.style.cssText = 'text-align:left;padding:10px 12px;height:auto';
      btn.innerHTML = `
        <div style="font-weight:var(--fw-bold);font-size:var(--fs-2);color:var(--c-text-1)">${esc(ex.name)}</div>
        <div style="font-size:var(--fs-1);color:var(--c-text-3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">
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
      filterBtns.forEach(b => {
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
        <div class="modal-title">Replace Exercise</div>
        <button class="btn-icon-sm" id="replace-ex-close" aria-label="Close exercise picker">
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
               type="text" placeholder="Search exercises…"
               autocomplete="off" autocorrect="off" spellcheck="false">
      </div>

      <!-- Category filters -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 4px">
        <button class="pill-filter active" data-cat="all" style="border-color:var(--c-accent);color:var(--c-accent);background:rgba(0,200,110,0.08)">All</button>
        <button class="pill-filter" data-cat="push" style="border-color:var(--c-indigo);color:var(--c-indigo);background:rgba(99,102,241,0.08)">Push</button>
        <button class="pill-filter" data-cat="pull" style="border-color:var(--c-cyan);color:var(--c-cyan);background:rgba(6,182,212,0.08)">Pull</button>
        <button class="pill-filter" data-cat="legs" style="border-color:var(--c-blue);color:var(--c-blue);background:var(--c-blue-bg)">Legs</button>
        <button class="pill-filter" data-cat="core" style="border-color:var(--c-cyan);color:var(--c-cyan);background:var(--c-cyan-bg)">Core</button>
      </div>

      <!-- Results count -->
      <div style="font-size:var(--fs-1);color:var(--c-text-3);padding:6px 0">
        <span id="replace-count">Loading…</span>
      </div>

      <!-- Exercise list -->
      <div class="add-ex-list" id="replace-ex-list" style="flex:1;overflow-y:auto"></div>

      <!-- Custom exercise -->
      <div style="padding-top:12px;margin-top:4px">
        <input class="add-ex-search" id="replace-custom"
               type="text" placeholder="Or type custom exercise name…"
               autocomplete="off" style="margin-bottom:8px">
        <button class="btn btn-primary btn-sm" id="replace-add-custom" style="width:100%">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Use Custom Exercise
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
    listEl.innerHTML = `<div class="add-ex-empty">Failed to load exercises</div>`;
    countEl.textContent = 'Error loading library';
  }

  function renderList() {
    let filtered = allExercises;

    if (activeFilter !== 'all') {
      filtered = filtered.filter(ex => ex.category === activeFilter);
    }

    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      filtered = filtered.filter(ex => {
        const nameMatch = ex.name.toLowerCase().includes(q);
        const tagsMatch = ex.tags?.some(t => t.toLowerCase().includes(q));
        const muscleMatch = ex.primaryMuscles?.some(m => m.toLowerCase().includes(q)) ||
                           ex.secondaryMuscles?.some(m => m.toLowerCase().includes(q));
        return nameMatch || tagsMatch || muscleMatch;
      });
    }

    countEl.textContent = `${filtered.length} exercises`;
    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = `<div class="add-ex-empty">No exercises found</div>`;
      return;
    }

    filtered.slice(0, 50).forEach((ex) => {
      const btn = document.createElement('button');
      btn.className = 'add-ex-item';
      btn.style.cssText = 'text-align:left;padding:10px 12px;height:auto';
      btn.innerHTML = `
        <div style="font-weight:var(--fw-bold);font-size:var(--fs-2);color:var(--c-text-1)">${esc(ex.name)}</div>
        <div style="font-size:var(--fs-1);color:var(--c-text-3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">
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
      filterBtns.forEach(b => {
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
      Toast.show(`Replaced with ${customName}`, 'info');
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
      Toast.show(`Replaced with ${name}`, 'info');
    }
  });

  overlay.querySelector('#replace-ex-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  requestAnimationFrame(() => searchEl.focus());
}

/* ════════════════════════════════════════════════════════
   SESSION RPE PICKER MODAL (INTEL-1)
   Borg CR10 scale (1–10) subjective exertion selector.
   ════════════════════════════════════════════════════════ */

const RPE_DESCRIPTORS = {
  1:  { en: ['Very Light', 'Active recovery, almost no effort'],       ru: ['Очень легко', 'Активное восстановление, без усилий'] },
  2:  { en: ['Light', 'Warmup pace, easy breathing'],                  ru: ['Легко', 'Разминочный темп, ровное дыхание'] },
  3:  { en: ['Moderate', 'Comfortable, sustainable pace'],             ru: ['Умеренно', 'Комфортная нагрузка, ровный темп'] },
  4:  { en: ['Somewhat Heavy', 'Solid working pace, steady effort'],   ru: ['Средне', 'Рабочий темп, контролируемое усилие'] },
  5:  { en: ['Hard', 'Noticeable exertion, solid work'],               ru: ['Тяжело', 'Ощутимая нагрузка, рабочий вес'] },
  6:  { en: ['Hard+', 'Challenging, ~4–5 reps in reserve'],            ru: ['Довольно тяжело', 'Тяжёлая работа, 4–5 повторов в запасе'] },
  7:  { en: ['Very Hard', 'Heavy effort, ~3 RIR'],                     ru: ['Очень тяжело', 'Тяжёлая сессия, ~3 повтора в запасе'] },
  8:  { en: ['Extremely Hard', 'Very heavy, ~2 RIR'],                  ru: ['Предельно тяжело', 'Очень тяжело, ~2 повтора в запасе'] },
  9:  { en: ['Near Maximum', 'Near limit, ~1 RIR'],                    ru: ['Почти максимум', 'Почти предел, ~1 повтор в запасе'] },
  10: { en: ['Maximum Effort', 'Complete failure (0 RIR)'],            ru: ['Максимум', 'Абсолютный предел, отказ (0 RIR)'] },
};

/**
 * Returns color token for RPE value.
 * @param {number} val 1..10
 * @returns {string} CSS variable expression
 */
function _rpeColor(val) {
  if (val <= 3) return 'var(--c-push)';
  if (val <= 5) return 'var(--c-pull)';
  if (val <= 6) return 'var(--c-amber)';
  if (val <= 8) return 'var(--c-secondary)';
  return 'var(--c-red)';
}

/**
 * Open Session RPE modal sheet (1–10 Borg CR10).
 * Resolves with selected RPE (1..10).
 *
 * @param {object} [opts]
 * @param {number} [opts.defaultRpe=7]
 * @param {boolean} [opts.ru]
 * @returns {Promise<number>}
 */
export function openSessionRpeModal(opts = {}) {
  const ru = opts.ru !== undefined ? opts.ru : isRu();
  let selected = Number.isFinite(opts.defaultRpe) && opts.defaultRpe >= 1 && opts.defaultRpe <= 10
    ? Math.round(opts.defaultRpe)
    : 7;

  // Defensive cleanup of any preexisting overlay
  document.getElementById('session-rpe-overlay')?.remove();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animate-in';
    overlay.id = 'session-rpe-overlay';
    overlay.style.cssText = 'z-index:6100; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px)';

    function getDescHTML(val) {
      const entry = RPE_DESCRIPTORS[val] || RPE_DESCRIPTORS[7];
      const [title, desc] = ru ? entry.ru : entry.en;
      const color = _rpeColor(val);
      return `
        <div class="rpe-active-preview" style="--rpe-accent:${color}">
          <div class="rpe-active-badge">${val}</div>
          <div class="rpe-active-info">
            <div class="rpe-active-title" style="color:${color}">${esc(title)}</div>
            <div class="rpe-active-sub">${esc(desc)}</div>
          </div>
        </div>`;
    }

    function renderButtons() {
      let btns = '';
      for (let i = 1; i <= 10; i++) {
        const active = i === selected;
        const color = _rpeColor(i);
        const [label] = ru ? RPE_DESCRIPTORS[i].ru : RPE_DESCRIPTORS[i].en;
        btns += `
          <button type="button" class="rpe-btn-chip${active ? ' active' : ''}"
                  data-val="${i}"
                  style="--chip-color:${color}"
                  aria-label="RPE ${i}: ${esc(label)}">
            <span class="rpe-chip-num">${i}</span>
          </button>`;
      }
      return btns;
    }

    overlay.innerHTML = `
      <div class="modal-sheet rpe-sheet" style="max-width:420px; margin:auto">
        <div class="modal-handle"></div>
        <div class="rpe-sheet-header">
          <div class="rpe-sheet-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="28" height="28">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
              <line x1="6" y1="1" x2="6" y2="4"/>
              <line x1="10" y1="1" x2="10" y2="4"/>
              <line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
          </div>
          <div class="rpe-sheet-title">${ru ? 'Оценка нагрузки' : 'Session RPE'}</div>
          <div class="rpe-sheet-subtitle">${ru ? 'Шкала интенсивности Borg CR10 (1–10)' : 'Subjective effort scale (1–10)'}</div>
        </div>
        <div class="rpe-preview-wrap" id="rpe-preview-wrap">
          ${getDescHTML(selected)}
        </div>
        <div class="rpe-grid" id="rpe-chips-grid">
          ${renderButtons()}
        </div>
        <div class="rpe-actions">
          <button class="btn btn-primary" id="btn-rpe-confirm" style="width:100%">${ru ? 'Далее' : 'Continue'}</button>
          <button class="btn btn-ghost" id="btn-rpe-skip" style="width:100%">${ru ? 'Пропустить' : 'Skip'}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const previewWrap = overlay.querySelector('#rpe-preview-wrap');
    const grid = overlay.querySelector('#rpe-chips-grid');

    function updateSelection(newVal) {
      selected = newVal;
      _haptic(10);
      if (previewWrap) previewWrap.innerHTML = getDescHTML(selected);
      grid?.querySelectorAll('.rpe-btn-chip').forEach((btn) => {
        // @ts-ignore
        const v = parseInt(btn.dataset.val, 10);
        btn.classList.toggle('active', v === selected);
      });
    }

    grid?.addEventListener('click', (e) => {
      const btn = e.target.closest('.rpe-btn-chip');
      if (!btn) return;
      // @ts-ignore
      const val = parseInt(btn.dataset.val, 10);
      if (Number.isFinite(val) && val >= 1 && val <= 10) {
        updateSelection(val);
      }
    });

    let closed = false;
    function closeWith(val) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('animate-out');
      setTimeout(() => {
        overlay.remove();
        resolve(val);
      }, 240);
    }

    function onKey(e) {
      if (e.key === 'Escape') closeWith(selected);
    }
    document.addEventListener('keydown', onKey);

    overlay.querySelector('#btn-rpe-confirm')?.addEventListener('click', () => closeWith(selected));
    overlay.querySelector('#btn-rpe-skip')?.addEventListener('click', () => closeWith(selected));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeWith(selected);
    });
  });
}

