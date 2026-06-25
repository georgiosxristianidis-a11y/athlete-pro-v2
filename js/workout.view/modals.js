// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/modals.js — Modal overlays
   Plan editor, exercise picker, replace exercise modal
   ════════════════════════════════════════════════════════ */

import { Toast } from '../shell.js';
import { esc } from '../shared/utils.js';
import { confirmDialog } from '../shared/confirm.js';
import { isRu } from '../locale.store.js';
import { on, onInput } from '../events.js';
import { TextField, NumberStepper, Button } from '../ui/factory.js';

const W = () => window.Workout;
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
} from '../workout.store.js';

function _haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* ════════════════════════════════════════════════════════
   PLAN EDITOR — module-level closure state
   (re-assigned by openPlanEditor each time it opens)
   ════════════════════════════════════════════════════════ */
let _planEditorActiveTab = () => 'push';
let _planEditorActiveWeek = () => getWeekMode();
let _planEditorSetTab = () => {};
let _planEditorSetWeek = (_w) => {};

const _SVG_DRAG = `<svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
  <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
  <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
  <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
</svg>`;
const _SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" width="14" height="14">
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14H6L5 6"/>
  <path d="M10 11v6M14 11v6"/>
</svg>`;
const _SVG_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" width="16" height="16">
  <line x1="12" y1="5" x2="12" y2="19"/>
  <line x1="5" y1="12" x2="19" y2="12"/>
</svg>`;

/**
 * Builds the plan-tab DOM for one PPL type. Returns a DocumentFragment so
 * factory components keep their direct event listeners (no event delegation).
 * @param {'push'|'pull'|'legs'} type
 * @param {'A'|'B'} activeWeek
 * @param {string} searchQuery
 * @returns {DocumentFragment}
 */
function _buildPlanTabDOM(type, activeWeek, searchQuery) {
  const plan = loadPlan(activeWeek);
  let exercises = plan[type] || [];
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    exercises = exercises.filter(ex => ex.name.toLowerCase().includes(q));
  }

  const frag = document.createDocumentFragment();

  if (!exercises.length && searchQuery.trim()) {
    const empty = document.createElement('div');
    empty.className = 'plan-empty';
    empty.textContent = `No exercises found for "${searchQuery}"`;
    frag.appendChild(empty);
  } else {
    exercises.forEach((ex) => {
      const originalIndex = plan[type].indexOf(ex);

      const row = document.createElement('div');
      row.className = 'plan-row';
      row.id = `plan-row-${type}-${originalIndex}`;
      row.dataset.pi = String(originalIndex);

      const dragHandle = document.createElement('div');
      dragHandle.className = 'plan-drag-handle';
      dragHandle.innerHTML = _SVG_DRAG;

      const nameField = TextField({
        value: ex.name,
        placeholder: 'Exercise name',
        onInput: (val) => {
          const p = loadPlan(_planEditorActiveWeek());
          p[type][originalIndex].name = val.trim() || p[type][originalIndex].name;
          savePlan(p, _planEditorActiveWeek());
        },
      });

      const meta = document.createElement('div');
      meta.className = 'plan-row-meta';

      const setsLabel = document.createElement('span');
      setsLabel.className = 'plan-meta-label';
      setsLabel.textContent = 'Sets';

      const setsStepper = NumberStepper({
        value: ex.sets, min: 1, max: 10, step: 1,
        ariaLabel: 'Sets',
        onChange: (v) => {
          const p = loadPlan(_planEditorActiveWeek());
          p[type][originalIndex].sets = v;
          savePlan(p, _planEditorActiveWeek());
        },
      });

      const repsLabel = document.createElement('span');
      repsLabel.className = 'plan-meta-label';
      repsLabel.textContent = 'Reps';

      const repsStepper = NumberStepper({
        value: ex.reps, min: 1, max: 50, step: 1,
        ariaLabel: 'Reps',
        onChange: (v) => {
          const p = loadPlan(_planEditorActiveWeek());
          p[type][originalIndex].reps = v;
          savePlan(p, _planEditorActiveWeek());
        },
      });

      const delBtn = Button({
        variant: 'ghost',
        icon: _SVG_TRASH,
        ariaLabel: 'Remove exercise',
        onClick: () => W()._deletePlanEx(type, originalIndex),
      });
      delBtn.className = 'plan-delete';

      meta.append(setsLabel, setsStepper, repsLabel, repsStepper, delBtn);
      row.append(dragHandle, nameField, meta);
      frag.appendChild(row);
    });
  }

  const addBtn = Button({
    label: 'Add Exercise',
    variant: 'ghost',
    icon: _SVG_PLUS,
    onClick: () => W()._addPlanEx(type),
  });
  addBtn.classList.add('btn-add-ex');
  frag.appendChild(addBtn);

  return frag;
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
    return _buildPlanTabDOM(type, activeWeek, searchQuery);
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
        <div class="plan-list" id="plan-list"></div>
        <button class="btn btn-primary" style="margin-top:var(--sp-2)"
                data-action="wo:planSave">
          Save Plan
        </button>
      </div>`;
    overlay.querySelector('#plan-list').appendChild(tabContent(activeTab));
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

export async function _loadPreset(presetName) {
  const presets = { 'ppl-gio': PPL_GIO_PLAN };
  const preset = presets[presetName];
  if (!preset) return;
  const ru = isRu();
  const ok = await confirmDialog({
    title: ru ? 'Загрузить пресет PPL | GIO?' : 'Load PPL | GIO preset?',
    message: ru ? 'Планы недели A и недели B будут заменены.' : 'Both Week A and Week B plans will be replaced.',
    confirmLabel: ru ? 'Загрузить' : 'Load',
    cancelLabel: ru ? 'Отмена' : 'Cancel',
  });
  if (!ok) return;
  savePlan(JSON.parse(JSON.stringify(preset.weekA)), 'A');
  savePlan(JSON.parse(JSON.stringify(preset.weekB)), 'B');
  _closePlanEditor();
  openPlanEditor();
  Toast.show(ru ? 'PPL | GIO загружен для недель A и B — задай рабочие веса' : 'PPL | GIO loaded for Week A & B — set your working weights', 'success');
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
  _closePlanEditor();
  Toast.show('Plan saved', 'success');
}

export function _updatePlanName(type, i, val) {
  const w = _planEditorActiveWeek();
  const plan = loadPlan(w);
  plan[type][i].name = val.trim() || plan[type][i].name;
  savePlan(plan, w);
}

export function _adjustPlan(type, i, field, delta) {
  const w = _planEditorActiveWeek();
  const plan = loadPlan(w);
  plan[type][i][field] = Math.max(1, plan[type][i][field] + delta);
  savePlan(plan, w);
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
    let srcIdx = parseInt(row.dataset.pi);

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startY = e.clientY;
      handle.setPointerCapture(e.pointerId);
      row.classList.add('plan-row-dragging');
      _haptic(15);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      row.style.transform = `translateY(${dy}px)`;
      row.style.zIndex = '50';
      list.querySelectorAll('.plan-row').forEach((other) => {
        if (other === row) return;
        const rect = other.getBoundingClientRect();
        other.classList.toggle('plan-row-over', e.clientY >= rect.top && e.clientY <= rect.bottom);
      });
    });

    handle.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      row.style.transform = '';
      row.style.zIndex = '';
      row.classList.remove('plan-row-dragging');

      let dropIdx = srcIdx;
      list.querySelectorAll('.plan-row').forEach((other) => {
        if (other.classList.contains('plan-row-over')) {
          dropIdx = parseInt(other.dataset.pi);
          other.classList.remove('plan-row-over');
        }
      });

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
      <div style="font-size:11px;color:var(--c-text-3);padding:6px 0">
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
        <div style="font-weight:700;font-size:13px;color:var(--c-text-1)">${esc(ex.name)}</div>
        <div style="font-size:10px;color:var(--c-text-3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">
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
      <div style="font-size:11px;color:var(--c-text-3);padding:6px 0">
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
        <div style="font-weight:700;font-size:13px;color:var(--c-text-1)">${esc(ex.name)}</div>
        <div style="font-size:10px;color:var(--c-text-3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">
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
