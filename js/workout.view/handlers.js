// @ts-check
import { DB } from '../db.js';
import { Timer } from '../timer.js';
import { Nav, Toast } from '../shell.js';
import { 
  State, SESSION_KEY, loadPlan, savePlan, buildSession, persistSession, 
  getWeekMode, setWeekMode, getCustomWorkouts, saveCustomWorkout, deleteCustomWorkout, 
  loadCoreChecklist, saveCoreChecklist, getActivePlan, startPlan, advancePlan 
} from '../workout.store.js';
import { renderSelect, renderActive, renderSetRow, renderFocusMode } from './render.js';
import { RestTimer } from '../rest-timer.js';
import { esc } from '../shared/utils.js';
import { confirmDialog } from '../shared/confirm.js';
import { isRu } from '../locale.store.js';
import { acquireWakeLock, releaseWakeLock } from '../features/wake-lock.js';
import { syncDrumUI } from '../ui/drum-picker.js';

let _restDuration = 90;
let _focusEi = -1;

function _haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }

/* ════════════════════════════════════════════════════════
   STEPPERS & INPUTS
   ════════════════════════════════════════════════════════ */

export function syncDrum(type, ei, si, val) {
  const ex = State.plan[ei];
  if (!ex) return;
  const set = ex.sets[si];
  if (!set) return;
  if (type === 'w') set.weight = parseFloat(val);
  else set.reps = parseInt(val);
  
  syncDrumUI(type, ei, si, val);
  
  persistSession();
  _updateLiveStats();
}

export function stepWeight(ei, si, delta) {
  const ex = State.plan[ei];
  if (!ex) return;
  const set = ex.sets[si];
  if (!set) return;
  set.weight = Math.max(0, (set.weight || 0) + delta);
  _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
  _updateLiveStats();
  persistSession();
}

export function stepReps(ei, si, delta) {
  const ex = State.plan[ei];
  if (!ex) return;
  const set = ex.sets[si];
  if (!set) return;
  set.reps = Math.max(1, (set.reps || 0) + delta);
  _updateStepperUI('r', ei, si, set.reps, set.reps <= 1);
  _updateLiveStats();
  persistSession();
}

function _updateStepperUI(type, ei, si, val, atMin) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  if (valEl) valEl.textContent = val;
  if (inpEl) inpEl.value = val;
  syncDrum(type, ei, si, val);
}

export function editVal(ei, si, type) {
  const id = (type === 'w' ? 'swv-' : 'srv-') + ei + '-' + si;
  const valEl = document.getElementById(id);
  const inpId = (type === 'w' ? 'swi-' : 'sri-') + ei + '-' + si;
  const inpEl = document.getElementById(inpId);
  if (!valEl || !inpEl) return;
  valEl.style.display = 'none';
  inpEl.style.display = 'inline-block';
  inpEl.focus();
  // @ts-ignore
  inpEl.select();
}

export function commitVal(ei, si, type, val) {
  const ex = State.plan[ei];
  if (!ex) return;
  const set = ex.sets[si];
  if (!set) return;
  const num = parseFloat(val);
  if (type === 'w') set.weight = isNaN(num) ? 0 : num;
  else set.reps = isNaN(num) ? 1 : Math.round(num);
  _updateStepperUI(type, ei, si, type === 'w' ? set.weight : set.reps, false);
}

/* ════════════════════════════════════════════════════════
   RPE
   ════════════════════════════════════════════════════════ */

export function setRPE(ei, si, val) {
  _haptic(8);
  const ex = State.plan[ei];
  if (!ex) return;
  const set = ex.sets[si];
  if (!set) return;
  set.rpe = set.rpe === val ? null : val;
  const row = document.getElementById(`rpe-${ei}-${si}`);
  if (row) {
    row.querySelectorAll('.rpe-btn').forEach((btn) => {
      // @ts-ignore
      const v = parseInt(btn.dataset.val);
      btn.classList.toggle('rpe-active', v === set.rpe);
    });
  }
  persistSession();
}

/* ════════════════════════════════════════════════════════
   SET MANAGEMENT
   ════════════════════════════════════════════════════════ */

export async function toggleSet(ei, si) {
  const ex = State.plan[ei];
  if (!ex) return;
  const set = ex.sets[si];
  if (!set) return;
  set.done = !set.done;
  persistSession();
  _updateLiveStats();

  if (set.done) {
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.pulseSetComplete();
    RestTimer.start(ex.name, `Set ${si + 1}`, _restDuration);
    
    // Elite Auto-collapse logic: ONLY if ALL sets are done (e.g. 4/4)
    const allDone = ex.sets.every(s => s.done);
    if (allDone) {
      setTimeout(() => {
        const wrap = document.getElementById(`sets-wrap-${ei}`);
        const chev = document.getElementById(`ex-chevron-${ei}`);
        if (wrap && wrap.style.display !== 'none') {
          wrap.style.display = 'none';
          if (chev) chev.style.transform = 'rotate(0deg)';
        }
      }, 500); // 400ms delay for visual feedback
    }
  } else {
    RestTimer.stop();
  }

  const row = document.getElementById(`set-row-${ei}-${si}`);
  if (row) {
    row.classList.toggle('set-done', set.done);
    const nextIdx = ex.sets.findIndex(s => !s.done);
    ex.sets.forEach((_, idx) => {
      const r = document.getElementById(`set-row-${ei}-${idx}`);
      r?.classList.toggle('set-active', !ex.sets[idx].done && idx === nextIdx);
    });
  }

  const doneSets = ex.sets.filter(s => s.done).length;
  const card = document.getElementById(`ex-card-${ei}`);
  if (card) {
    const meta = card.querySelector('.exercise-meta');
    if (meta) {
      meta.textContent = `${doneSets}/${ex.sets.length}`;
      meta.classList.toggle('done', doneSets === ex.sets.length);
    }
  }
}

export async function addSet(ei) {
  const ex = State.plan[ei];
  if (!ex) return;
  const lastSet = ex.sets[ex.sets.length - 1];
  ex.sets.push({
    weight: lastSet?.weight || 0,
    reps: lastSet?.reps || 10,
    done: false,
  });
  persistSession();
  const wrap = document.getElementById(`sets-wrap-${ei}`);
  if (wrap) {
    const headerRow = wrap.querySelector('.set-header-row')?.outerHTML || '';
    const addBtn = wrap.querySelector('.add-set-btn')?.outerHTML || '';
    const rows = (await Promise.all(ex.sets.map((s, si) => renderSetRow(ex, ei, s, si)))).join('');
    wrap.innerHTML = headerRow + rows + addBtn;
  }
  _updateLiveStats();
}

export function _toggleUnilateral(ei) {
  const ex = State.plan[ei];
  if (!ex) return;
  ex.isUnilateral = !ex.isUnilateral;
  persistSession();
  renderActive();
  Toast.show(ex.isUnilateral ? 'Dumbbells: 2x Volume' : 'Standard: 1x Volume', 'info');
}

/* ════════════════════════════════════════════════════════
   SELECT TYPE & PROGRAMS
   ════════════════════════════════════════════════════════ */
export async function selectType(type) {
  const activePlan = getActivePlan();
  State.type = type === 'active' ? (activePlan?.type || 'push') : type;
  
  const [workouts, restDurRaw, keepAwake] = await Promise.all([
    DB.Workouts.getAll().catch(() => []),
    DB.Settings.get('rest-duration').catch(() => null),
    DB.Settings.get('keep-awake').catch(() => 'off'),
  ]);
  _restDuration = parseInt(restDurRaw || 90);

  State.plan = buildSession(type, { workouts });
  State.phase = 'active';
  State.startedAt = Date.now();

  persistSession();

  Timer.start((s) => {
    // Session timer val removed from header, now in PIP only
  });

  // @ts-ignore
  if (window.DynamicIsland) window.DynamicIsland.show();
  if (keepAwake === 'on') acquireWakeLock();

  await renderActive();
}

export async function _startProgram(id) {
  const ru = isRu();
  const active = getActivePlan();
  if (active && active.id !== id) {
    const ok = await confirmDialog({
      title: ru ? 'Сменить программу?' : 'Switch program?',
      message: ru ? 'Смена программы сбросит текущий цикл.' : 'Switching programs will reset your current cycle.',
      confirmLabel: ru ? 'Сменить' : 'Switch',
      cancelLabel: ru ? 'Отмена' : 'Cancel',
    });
    if (!ok) return;
  }
  _haptic(20);
  startPlan(id);
  await selectType('active');
  Toast.show(ru ? 'Цикл программы запущен' : 'Program Cycle Started', 'success');
}

/* ════════════════════════════════════════════════════════
   EXERCISES
   ════════════════════════════════════════════════════════ */

/**
 * Show a context menu for exercise actions (Replace, DB, Copy).
 */
export async function showExerciseMenu(ei) {
  _haptic(10);
  const ex = State.plan[ei];
  const ru = isRu();

  const _svgSwap = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`;
  const _svgDumb = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="6.5" y1="12" x2="17.5" y2="12"/><rect x="3" y="9" width="3" height="6" rx="1"/><rect x="18" y="9" width="3" height="6" rx="1"/></svg>`;
  const _svgCopy = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
  const actions = [
    { label: ru ? 'Сменить упражнение' : 'Replace Exercise', icon: _svgSwap, action: () => openReplaceExModal(ei) },
    { label: ex.isUnilateral ? (ru ? 'Убрать гантели' : 'Remove Dumbbells') : (ru ? 'Гантели (2x)' : 'Add Dumbbells'), icon: _svgDumb, action: () => _toggleUnilateral(ei) },
    { label: ru ? 'Копировать прошлый вес' : 'Smart Copy', icon: _svgCopy, action: () => smartCopy(ei, 0) }
  ];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay animate-in';
  overlay.style.zIndex = '7000';
  overlay.innerHTML = `
    <div class="modal-sheet" style="padding: 16px; border-top-left-radius:24px; border-top-right-radius:24px">
      <div class="modal-handle"></div>
      <div style="font-size: 13px; font-weight: 900; color: var(--c-text-2); margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.1em; text-align:center">${esc(ex.name)}</div>
      <div style="display:flex; flex-direction:column; gap:8px">
        ${actions.map((a, i) => `
          <button class="menu-item" onclick="this.closest('.modal-overlay').remove(); window.Workout._handleMenuAction(${ei}, ${i})" style="display:flex; align-items:center; gap:16px; width:100%; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:16px; color:#fff; cursor:pointer">
            <span style="font-size:18px">${a.icon}</span>
            <span style="font-size:15px; font-weight:700">${a.label}</span>
          </button>
        `).join('')}
      </div>
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="width:100%; margin-top:16px; border:none; color:var(--c-text-3); font-weight:800">${ru ? 'ОТМЕНА' : 'CANCEL'}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // @ts-ignore
  window.Workout._handleMenuAction = (ei, actionIdx) => {
    actions[actionIdx].action();
  };
}

export async function openReplaceExModal(ei) {
  const { openReplaceExModal: open } = await import('./modals.js').catch(() => ({ openReplaceExModal: () => alert('Modal failed') }));
  // @ts-ignore
  open(ei);
}

export async function openCustomWorkoutModal() {
  const { openCustomWorkoutModal: open } = await import('./modals.js').catch(() => ({ openCustomWorkoutModal: () => alert('Custom workouts coming soon') }));
  // @ts-ignore
  open();
}

export async function _createNewCustomWorkout() { alert('Not implemented'); }
export async function _editCustomWorkout(id) { alert('Not implemented'); }
export async function _deleteCustomWorkout(id) { alert('Not implemented'); }
export async function _startCustomWorkout(id) { alert('Not implemented'); }
export function _closeCustomWorkoutModal() {
  const el = document.getElementById('custom-workout-overlay');
  el?.remove();
}

/* ════════════════════════════════════════════════════════
   COMPLETE / CANCEL
   ════════════════════════════════════════════════════════ */
export async function completeSession() {
  const ru = isRu();
  const doneSets = State.plan.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
  
  if (doneSets === 0) {
    const ok = await confirmDialog({
      title: ru ? 'Завершить тренировку?' : 'Finish workout?',
      message: ru ? 'Ни один подход не выполнен.' : 'No sets have been completed.',
      confirmLabel: ru ? 'Завершить' : 'Finish',
      cancelLabel: ru ? 'Отмена' : 'Cancel',
    });
    if (!ok) return;
  }

  // Calculate metrics
  const durationMs = Date.now() - (State.startedAt || Date.now());
  const mins = Math.floor(durationMs / 60000);
  const hrs = Math.floor(mins / 60);
  const timeStr = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;

  let totalTonnage = 0;
  let totalReps = 0;
  const blockTonnage = { power: 0, shape: 0, width: 0, thickness: 0, heavy: 0, iso: 0, arms: 0, shoulders: 0, core: 0, align: 0 };

  State.plan.forEach((ex) => {
    const mul = ex.isUnilateral ? 2 : 1;
    ex.sets.forEach((s) => {
      if (s.done) {
        const ton = (s.weight || 0) * (s.reps || 0) * mul;
        totalTonnage += ton;
        totalReps += (s.reps || 0);
        if (ex.block && blockTonnage[ex.block] !== undefined) {
          blockTonnage[ex.block] += ton;
        }
      }
    });
  });

  // Create Modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay animate-in';
  overlay.style.zIndex = '6000';
  overlay.style.backdropFilter = 'blur(12px)';
  overlay.style.webkitBackdropFilter = 'blur(12px)';
  overlay.innerHTML = `
    <div class="modal-sheet summary-sheet" style="max-width:440px; margin:auto">
      <div class="modal-handle"></div>
      
      <div class="summary-header">
        <div class="summary-icon-wrap" style="color:var(--c-accent)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="48" height="48">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="summary-title" style="font-size:20px; font-weight:900; letter-spacing:0.05em; margin-top:12px">WORKOUT COMPLETE</div>
        <div class="summary-subtitle" style="font-size:11px; font-weight:800; color:var(--c-text-3); letter-spacing:0.2em; margin-top:4px">
          ${State.type.toUpperCase()} DAY · ELITE STATUS
        </div>
      </div>

      <div class="summary-stats-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin:24px 0; padding:16px; background:rgba(255,255,255,0.03); border-radius:16px">
        <div class="summary-stat">
          <div style="font-size:18px; font-weight:900">${timeStr}</div>
          <div style="font-size:9px; font-weight:800; color:var(--c-text-3); letter-spacing:0.1em">TIME</div>
        </div>
        <div class="summary-stat">
          <div style="font-size:18px; font-weight:900">${(totalTonnage / 1000).toFixed(1)}t</div>
          <div style="font-size:9px; font-weight:800; color:var(--c-text-3); letter-spacing:0.1em">VOLUME</div>
        </div>
        <div class="summary-stat">
          <div style="font-size:18px; font-weight:900">${totalReps}</div>
          <div style="font-size:9px; font-weight:800; color:var(--c-text-3); letter-spacing:0.1em">REPS</div>
        </div>
      </div>

      <div class="summary-blocks" style="margin-bottom:24px">
        <div style="font-size:10px; font-weight:800; color:var(--c-text-3); letter-spacing:0.1em; margin-bottom:12px; text-transform:uppercase">Block Efficiency</div>
        ${Object.entries(blockTonnage)
          .filter(([_, val]) => val > 0)
          .map(([id, val]) => `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
              <span style="font-size:12px; font-weight:700; color:var(--c-text-2)">${id.toUpperCase()}</span>
              <span style="font-size:12px; font-weight:900; color:var(--c-text-1)">${(val / 1000).toFixed(2)}t</span>
            </div>
            <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; margin-bottom:12px">
              <div style="height:100%; width:${Math.min(100, (val / totalTonnage) * 100)}%; background:var(--c-accent); border-radius:2px"></div>
            </div>
          `).join('')}
      </div>

      <div class="summary-actions" style="display:flex; flex-direction:column; gap:12px">
        <button class="btn btn-primary" id="btn-confirm-save" style="width:100%">${ru ? 'СОХРАНИТЬ' : 'SAVE SESSION'}</button>
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">${ru ? 'НАЗАД' : 'BACK'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-save')?.addEventListener('click', async () => {
    overlay.classList.add('animate-out');
    setTimeout(async () => {
      overlay.remove();
      await _executeFinalSave(totalTonnage, durationMs);
    }, 300);
  });
}

async function _executeFinalSave(tonnage, duration) {
  const activePlan = getActivePlan();
  const session = {
    type: State.type,
    planId: activePlan?.id || null,
    timestamp: State.startedAt || Date.now(),
    duration,
    tonnage,
    exercises: State.plan
      .filter(ex => !ex.noDb)
      .map((ex) => ({
        name: ex.name,
        sets: ex.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          done: s.done,
        })),
      })),
  };

  await DB.Workouts.save(session);
  
  // Log event
  await DB.Events.log('workout_complete', { type: State.type, tonnage });

  // Update OneRMs
  for (const ex of State.plan) {
    const bestSet = ex.sets.filter(s => s.done && s.weight && s.reps).sort((a,b) => b.weight - a.weight)[0];
    if (bestSet) {
      await DB.OneRM.update(ex.name, bestSet.weight, bestSet.reps);
    }
  }

  // Cleanup
  localStorage.removeItem(SESSION_KEY);
  if (window.DynamicIsland) window.DynamicIsland.hide();
  releaseWakeLock();
  Timer.reset();

  if (activePlan) {
    const { advancePlan } = await import('../workout.store.js');
    advancePlan();
  }

  Toast.show('Elite session saved', 'success');
  const { renderSelect } = await import('./render.js');
  await renderSelect();
}

export async function cancelSession() {
  const ru = isRu();
  const ok = await confirmDialog({
    title: ru ? 'Отменить тренировку?' : 'Cancel session?',
    message: ru ? 'Прогресс будет потерян.' : 'Progress will be lost.',
    confirmLabel: ru ? 'Отменить' : 'Discard',
    cancelLabel: ru ? 'Назад' : 'Keep',
    danger: true,
  });
  if (!ok) return;
  State.phase = 'select';
  State.startedAt = 0;
  State.plan = [];
  persistSession();
  Timer.reset();
  // @ts-ignore
  if (window.DynamicIsland) window.DynamicIsland.hide();
  releaseWakeLock();
  await renderSelect();
}

/* ════════════════════════════════════════════════════════
   CORE ITEMS
   ════════════════════════════════════════════════════════ */

export function _toggleCoreItem(day, idx) {
  const items = loadCoreChecklist(day);
  const name = items[idx];
  const key = `${day}:${name}`;
  // @ts-ignore
  window._coreCheckedState = window._coreCheckedState || {};
  // @ts-ignore
  window._coreCheckedState[key] = !window._coreCheckedState[key];
  _haptic(10);
  const el = document.getElementById(`core-item-${idx}`);
  // @ts-ignore
  el?.classList.toggle('checked', window._coreCheckedState[key]);
}

export async function _addCoreItem(day) {
  const name = prompt('Core exercise name:');
  if (!name) return;
  const items = loadCoreChecklist(day);
  items.push(name.trim());
  saveCoreChecklist(day, items);
  const section = document.getElementById('core-section');
  // @ts-ignore
  if (section) section.innerHTML = (await import('./render.js'))._renderCoreSection(day);
}

export async function _removeCoreItem(day, idx) {
  const items = loadCoreChecklist(day);
  items.splice(idx, 1);
  saveCoreChecklist(day, items);
  const section = document.getElementById('core-section');
  // @ts-ignore
  if (section) section.innerHTML = (await import('./render.js'))._renderCoreSection(day);
}

/* ════════════════════════════════════════════════════════
   FOCUS MODE
   ════════════════════════════════════════════════════════ */

export async function _openFocus(ei) {
  _focusEi = ei;
  const overlay = document.createElement('div');
  overlay.id = 'focus-overlay-wrap';
  overlay.innerHTML = await renderFocusMode(ei);
  document.body.appendChild(overlay);
  _haptic(30);
}

export function _closeFocus() {
  const el = document.getElementById('focus-overlay-wrap');
  el?.remove();
  _focusEi = -1;
}

export async function _focusNext() {
  if (_focusEi < State.plan.length - 1) _openFocus(_focusEi + 1);
}
export async function _focusPrev() {
  if (_focusEi > 0) _openFocus(_focusEi - 1);
}

export function _focusStepW(delta) {
  const ex = State.plan[_focusEi];
  const firstUndone = ex?.sets.find(s => !s.done);
  if (!firstUndone) return;
  firstUndone.weight = Math.max(0, (firstUndone.weight || 0) + delta);
  _refreshFocusUI();
}

export function _focusStepR(delta) {
  const ex = State.plan[_focusEi];
  const firstUndone = ex?.sets.find(s => !s.done);
  if (!firstUndone) return;
  firstUndone.reps = Math.max(1, (firstUndone.reps || 0) + delta);
  _refreshFocusUI();
}

export async function _focusCompleteSet() {
  const ex = State.plan[_focusEi];
  const si = ex?.sets.findIndex(s => !s.done);
  if (si === -1) return;
  await toggleSet(_focusEi, si);
  if (ex.sets.every(s => s.done)) {
    if (_focusEi < State.plan.length - 1) _focusNext();
    else _closeFocus();
  } else {
    _refreshFocusUI();
  }
}

async function _refreshFocusUI() {
  const wrap = document.getElementById('focus-overlay-wrap');
  if (wrap) wrap.innerHTML = await renderFocusMode(_focusEi);
}

export function _initFocusLongPress() {
  document.querySelectorAll('.exercise-card').forEach((card) => {
    const header = card.querySelector('.exercise-header');
    if (!header) return;
    let timer, triggered = false;
    header.addEventListener('pointerdown', (e) => {
      triggered = false;
      timer = setTimeout(() => {
        triggered = true;
        _openFocus(parseInt(card.dataset.ei || '0'));
      }, 450);
    });
    header.addEventListener('pointerup', () => clearTimeout(timer));
    header.addEventListener('pointerleave', () => clearTimeout(timer));
    header.addEventListener('click', (e) => { if (triggered) { e.stopPropagation(); e.preventDefault(); } }, true);
  });
}

/* ════════════════════════════════════════════════════════
   SMART ACTIONS
   ════════════════════════════════════════════════════════ */

export function smartCopy(ei, si) {
  _haptic(15);
  const ex = State.plan[ei];
  const set = ex.sets[si];
  let source = [...ex.sets].reverse().find((s, idx) => (ex.sets.length - 1 - idx) < si && s.done);
  if (!source && si > 0) source = ex.sets[si - 1];
  if (source) {
    set.weight = source.weight;
    set.reps = source.reps;
    _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
    _updateStepperUI('r', ei, si, set.reps, set.reps <= 1);
    _updateLiveStats();
    persistSession();
    Toast.show('Data copied', 'info', 1000);
  }
}

export async function smartCoach(ei, si) {
  _haptic(20);
  const ex = State.plan[ei];
  const set = ex.sets[si];
  const workouts = await DB.Workouts.getAll().catch(() => []);
  const lastSession = [...workouts].reverse().find(w => (w.exercises || []).some(e => e.name === ex.name));
  const lastEx = lastSession?.exercises?.find(e => e.name === ex.name);
  if (!lastEx || !lastEx.sets?.length) {
    Toast.show('No history found', 'info');
    return;
  }
  const lastWeight = Math.max(...lastEx.sets.map(s => s.weight));
  set.weight = lastWeight + 2.5;
  _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
  _updateLiveStats();
  persistSession();
  Toast.show('Turbo Boost: +2.5kg', 'success');
}

/* ════════════════════════════════════════════════════════
   MISC
   ════════════════════════════════════════════════════════ */

export function toggleCard(ei) {
  const wrap = document.getElementById(`sets-wrap-${ei}`);
  const chev = document.getElementById(`ex-chevron-${ei}`);
  if (!wrap || !chev) return;
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

export function _updateLiveStats() {
  let tonnage = 0, setsDone = 0, exDone = 0;
  let totalSets = 0;

  State.plan.forEach((ex) => {
    const mul = ex.isUnilateral ? 2 : 1;
    let allExDone = true, anyDone = false;
    ex.sets.forEach((s) => {
      totalSets++;
      if (s.done) {
        tonnage += (s.weight || 0) * (s.reps || 0) * mul;
        setsDone++;
        anyDone = true;
      } else allExDone = false;
    });
    if (anyDone && allExDone) exDone++;
  });

  const tEl = document.getElementById('live-tonnage');
  const sEl = document.getElementById('live-sets-done');
  const eEl = document.getElementById('live-ex-done');
  const pEl = document.getElementById('workout-progress-fill');
  
  if (tEl) tEl.textContent = tonnage.toLocaleString();
  if (sEl) sEl.textContent = String(setsDone);
  if (eEl) eEl.textContent = String(exDone);
  
  if (pEl && totalSets > 0) {
    const pct = (setsDone / totalSets) * 100;
    pEl.style.transform = `scaleX(${pct / 100})`;
  }
}

export function _toggleWeek() {
  const current = getWeekMode();
  const next = current === 'A' ? 'B' : 'A';
  setWeekMode(next);
  renderSelect();
}

export function _addLiveExercise() {
  alert('Feature coming soon: Live exercise adding.');
}
async function _checkAIProactive() { /* placeholder */ }
