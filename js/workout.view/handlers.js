// @ts-check
import { DB } from '../db.js';
import { Timer } from '../timer.js';
import { Nav, Toast } from '../shell.js';
import {
  State, SESSION_KEY, loadPlan, savePlan, buildSession, persistSession,
  getWeekMode, setWeekMode, getCustomWorkouts, saveCustomWorkout, deleteCustomWorkout,
  loadCoreChecklist, saveCoreChecklist, getActivePlan, startPlan, advancePlan,
  recordBlockTiming
} from '../workout.store.js';
import { renderSelect, renderActive, renderSetRow, renderFocusMode } from './render.js';
import { RestTimer } from '../rest-timer.js';
import { esc } from '../shared/utils.js';
import { Spring } from '../shared/spring.js';
import { confirmDialog } from '../shared/confirm.js';
import { isRu } from '../locale.store.js';
import { acquireWakeLock, releaseWakeLock } from '../features/wake-lock.js';
import { on } from '../events.js';

on('wo:menuAction',  (el) => { el.closest('.modal-overlay')?.remove(); window.Workout._handleMenuAction(+el.dataset.ei, +el.dataset.i); });
on('wo:closeModal',  (el) => el.closest('.modal-overlay')?.remove());
import { syncDrumUI, initDrumPickers, flushDrum } from '../ui/drum-picker.js';

let _restDuration = 90;
let _focusEi = -1;
let _tonnageAnim = null;

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
  // Flush drum scroll position before reading weight/reps — guards against the
  // race where the user taps the checkmark before scrollend/80ms settle fires.
  flushDrum('w', ei, si);
  flushDrum('r', ei, si);
  set.done = !set.done;
  // Phase W-2-A: stamp block timing on every "set just became done" event.
  // Reverting (done → undone) does NOT roll back the timestamps — minor
  // inaccuracy, but the data stays useful and complexity stays low.
  if (set.done) {
    if (!State.blockTimings) State.blockTimings = {};
    recordBlockTiming(State.blockTimings, ex.block, Date.now());
  }
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
    // The .set-done-summary is baked at render time, so without this it would
    // show the weight/reps the row had when last rendered — not what the user
    // scrolled the drum to. Refresh it from live State on every completion.
    const summaryEl = row.querySelector('.set-done-summary');
    if (summaryEl) {
      const dispW = ex.isBW ? (set.weight > 0 ? `+${set.weight}` : 'BW') : set.weight;
      summaryEl.textContent = `${dispW}×${set.reps}`;
    }
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
    // innerHTML replacement drops the [data-drum-init] markers and leaves every
    // drum-track empty → numbers vanish (BUG-7). Rebuild the pickers; rAF so the
    // fresh tracks have layout before _buildDrum sets scrollTop for centring.
    requestAnimationFrame(() => initDrumPickers());
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
    DB.Settings.get('keep-awake', 'on').catch(() => 'on'), // BG-1: default ON (opt-out)
  ]);
  _restDuration = parseInt(restDurRaw || 90);

  State.plan = buildSession(type, { workouts });
  State.phase = 'active';
  State.startedAt = Date.now();
  State.blockTimings = {};

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
          <button class="menu-item" data-action="wo:menuAction" data-ei="${ei}" data-i="${i}" style="display:flex; align-items:center; gap:16px; width:100%; padding:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:16px; color:#fff; cursor:pointer">
            <span style="font-size:18px">${a.icon}</span>
            <span style="font-size:15px; font-weight:700">${a.label}</span>
          </button>
        `).join('')}
      </div>
      <button class="btn btn-ghost" data-action="wo:closeModal" style="width:100%; margin-top:16px; border:none; color:var(--c-text-3); font-weight:800">${ru ? 'ОТМЕНА' : 'CANCEL'}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // @ts-ignore
  window.Workout._handleMenuAction = (ei, actionIdx) => {
    actions[actionIdx].action();
  };
}

export async function openReplaceExModal(ei) {
  const { openReplaceExModal: open } = await import('./modals.js').catch(() => ({ openReplaceExModal: () => Toast.show(isRu() ? 'Не удалось открыть окно' : "Couldn't open the dialog", 'error') }));
  // @ts-ignore
  open(ei);
}

export async function openCustomWorkoutModal() {
  const { openCustomWorkoutModal: open } = await import('./modals.js').catch(() => ({ openCustomWorkoutModal: () => Toast.show(_soonMsg(), 'info') }));
  // @ts-ignore
  open();
}

// Custom-workout authoring isn't built yet — surface a graceful toast, never a
// native alert() (0-7: zero native dialogs). Implementing it is a separate feature.
const _soonMsg = () => (isRu() ? 'Пользовательские тренировки — скоро' : 'Custom workouts — coming soon');
export async function _createNewCustomWorkout() { Toast.show(_soonMsg(), 'info'); }
export async function _editCustomWorkout(id) { Toast.show(_soonMsg(), 'info'); }
export async function _deleteCustomWorkout(id) { Toast.show(_soonMsg(), 'info'); }
export async function _startCustomWorkout(id) { Toast.show(_soonMsg(), 'info'); }
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
  // Phase W-2-B: store-layer builder owns the summary shape (incl. PR
  // detection, isUnilateral×2 tonnage, Camera-4 noDb filter, block
  // timings). The view just renders the shape — handlers do zero data.
  const durationMs = Date.now() - (State.startedAt || Date.now());
  const { buildSessionSummary } = await import('../workout.store.js');
  const summaryData = await buildSessionSummary(State, durationMs);
  const { renderSummaryModal } = await import('./summary.js');
  renderSummaryModal(summaryData, () => _executeFinalSave(summaryData, durationMs), ru);
}


/**
 * Persist the finalised session. Takes the already-built summaryData so the
 * saved row shares a single source of truth with the report shown to the
 * user — same tonnage, same PR list, no chance of UI/DB drift.
 *
 * Schema additions (W-2-D-1):
 *   • exercise.block        — chamber id ('power'|'shape'|… or 'custom' for
 *                             W-1 ad-hoc additions); enables future per-block
 *                             analytics on Dashboard / Stats.
 *   • exercise.isAdded      — true for W-1 live additions (vs programmed).
 *   • exercise.custom       — true when the name was not in the library.
 *   • session.prs           — list from buildSessionSummary; lets Recent
 *                             sessions show "★ 1 PR" without re-deriving.
 *   • session.blockTimings  — per-chamber durations; opens trend analytics.
 *
 * Camera 4 (noDb:true) is still filtered out at the gate — it never enters
 * IDB and thus never skews tonnage / aggregate analytics.
 */
let _saving = false;
async function _executeFinalSave(summaryData, duration) {
  // Idempotency guard: the summary modal's confirm button can be tapped twice
  // before this async save resolves → duplicate workout rows. One save at a time.
  if (_saving) return;
  _saving = true;
  try {
    await _persistFinalSession(summaryData, duration);
  } finally {
    _saving = false;
  }
}

async function _persistFinalSession(summaryData, duration) {
  const activePlan = getActivePlan();
  const session = {
    type: State.type,
    planId: activePlan?.id || null,
    timestamp: State.startedAt || Date.now(),
    duration,
    tonnage: summaryData.totalTonnage,
    exercises: State.plan
      .filter(ex => !ex.noDb)
      .map((ex) => ({
        name: ex.name,
        block: ex.block || null,
        isAdded: !!ex.isAdded,
        custom: !!ex.custom,
        sets: ex.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          done: s.done,
        })),
      })),
    prs: summaryData.prs,
    blockTimings: State.blockTimings || {},
  };

  await DB.Workouts.save(session);

  // Log event
  await DB.Events.log('workout_complete', { type: State.type, tonnage: summaryData.totalTonnage });

  // Update OneRMs (also covers W-1 live additions — new exercise names get a
  // fresh OneRM record from this point on; isAdded:true is preserved in
  // session.exercises so future analytics can separate the two streams).
  for (const ex of State.plan) {
    if (ex.noDb) continue;
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
  State.blockTimings = {};
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
  State.coreChecked[key] = !State.coreChecked[key];
  _haptic(10);
  const el = document.getElementById(`core-item-${idx}`);
  el?.classList.toggle('checked', State.coreChecked[key]);
}

export async function _addCoreItem(day) {
  const { openExercisePickerModal } = await import('./modals.js');
  await openExercisePickerModal('core', async ({ name }) => {
    const items = loadCoreChecklist(day);
    items.push(name.trim());
    saveCoreChecklist(day, items);
    const section = document.getElementById('core-section');
    // @ts-ignore
    if (section) section.innerHTML = (await import('./render.js'))._renderCoreSection(day);
  });
}

export async function _removeCoreItem(day, idx) {
  const items = loadCoreChecklist(day);
  const name = items[idx];
  const ru = isRu();
  const ok = await confirmDialog({
    title: ru ? 'Удалить упражнение?' : 'Remove exercise?',
    message: name || '',
    confirmLabel: ru ? 'Удалить' : 'Remove',
    cancelLabel: ru ? 'Назад' : 'Keep',
    danger: true,
  });
  if (!ok) return;
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
  // QUARANTINE 2026-07-07: Focus Mode ships no CSS — the overlay renders as
  // raw DOM appended to <body> and spills outside the app column. Trigger
  // disabled until the feature is designed (or removed). Code kept intact so
  // re-enabling is a one-line revert. See island-AIR rethink brief.
  return;
  // eslint-disable-next-line no-unreachable
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
  const eEl = document.getElementById('live-ex-done');
  const rail = document.getElementById('live-rail');

  if (tEl) {
    // count-up от того, что сейчас на экране — переживает re-render и
    // прерывание собственной анимации без рывков
    const shown = parseInt(tEl.textContent.replace(/\D/g, ''), 10) || 0;
    if (shown !== tonnage) {
      _tonnageAnim?.stop();
      _tonnageAnim = Spring.animate({
        from: shown, to: tonnage, stiffness: 170, damping: 28,
        onUpdate: (v) => { tEl.textContent = Math.round(v).toLocaleString(); },
        onComplete: () => { _tonnageAnim = null; }
      });
    }
  }
  if (eEl) eEl.textContent = String(exDone);

  if (rail) {
    if (rail.children.length !== totalSets) {
      rail.innerHTML = '<div class="live-rail-seg"></div>'.repeat(totalSets);
    }
    for (let i = 0; i < rail.children.length; i++) {
      rail.children[i].classList.toggle('done', i < setsDone);
    }
  }
}

export function _toggleWeek() {
  const current = getWeekMode();
  const next = current === 'A' ? 'B' : 'A';
  setWeekMode(next);
  renderSelect();
}

/**
 * W-1 Add Exercise Live: open the picker, on select build a fresh exercise
 * entry, push it into State.plan, persist, and re-render. Added exercises
 * land in a synthetic 'custom' block so they appear in the summary as a
 * distinct chamber rather than silently bloating one of the four programmed
 * blocks. The isAdded flag is preserved through to IDB so future analytics
 * can separate programmed work from ad-hoc additions; the custom flag tells
 * the engine the exercise name is not in the library (no 1RM, no plateau).
 *
 * Ghost values: 3 default sets at 0kg × 10 reps. Pre-fill from prior sessions
 * is a deliberate W-1 v2 follow-up — would need a name → last-set lookup that
 * also handles custom names. For v1, user enters numbers on first set.
 */
export async function _addLiveExercise() {
  if (State.phase !== 'active') return;
  const { openExercisePickerModal } = await import('./modals.js');
  await openExercisePickerModal(null, async ({ name, custom }) => {
    const ghostSets = [
      { weight: 0, reps: 10, done: false },
      { weight: 0, reps: 10, done: false },
      { weight: 0, reps: 10, done: false },
    ];
    State.plan.push({
      name,
      block: 'custom',
      isAdded: true,
      custom: !!custom,
      isUnilateral: false,
      isBW: false,
      noDb: false,
      sets: ghostSets,
    });
    persistSession();
    const { renderActive } = await import('./render.js');
    await renderActive();
    Toast.show(isRu() ? `${name} добавлено` : `${name} added`, 'success');
  });
}
async function _checkAIProactive() { /* placeholder */ }
