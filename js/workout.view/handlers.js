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
import { showReceipt } from '../ui/receipt.js';

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
    const meta = card.querySelector('#ex-done-count-' + ei);
    if (meta) meta.textContent = doneSets > 0 ? ` · ${doneSets} done` : '';
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

/* ════════════════════════════════════════════════════════
   SELECT TYPE
   ════════════════════════════════════════════════════════ */
export async function selectType(type) {
  const activePlan = getActivePlan();
  State.type = type === 'active' ? (activePlan?.type || 'push') : type;
  
  const [workouts, restDurRaw] = await Promise.all([
    DB.Workouts.getAll().catch(() => []),
    DB.Settings.get('rest-duration').catch(() => null),
  ]);
  _restDuration = parseInt(restDurRaw || 90);

  State.plan = buildSession(type, { workouts });
  State.phase = 'active';
  State.startedAt = Date.now();

  persistSession();

  Timer.start((s) => {
    const el = document.getElementById('session-timer-val');
    if (el) el.textContent = Timer.fmt(s);
  });

  // @ts-ignore
  if (window.DynamicIsland) window.DynamicIsland.show();

  await renderActive();
}

export async function _startProgram(id) {
  const active = getActivePlan();
  if (active && active.id !== id) {
    if (!confirm('Switching programs will reset your current cycle. Proceed?')) return;
  }
  _haptic(20);
  startPlan(id);
  await selectType('active');
  Toast.show('Program Cycle Started', 'success');
}

/* ════════════════════════════════════════════════════════
   COMPLETE SESSION
   ════════════════════════════════════════════════════════ */
export async function completeSession() {
  const doneSets = State.plan.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
  if (doneSets === 0) {
    if (!confirm('No sets completed. Finish anyway?')) return;
  }

  const duration = Date.now() - State.startedAt;
  let tonnage = 0;
  State.plan.forEach((ex) => {
    const mul = ex.isUnilateral ? 2 : 1;
    ex.sets.forEach((s) => {
      if (s.done) tonnage += (s.weight || 0) * (s.reps || 0) * mul;
    });
  });

  const activePlan = getActivePlan();
  const session = {
    type: State.type,
    planId: activePlan?.id || null,
    timestamp: State.startedAt,
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
  if (activePlan) advancePlan();

  // @ts-ignore
  if (window.DynamicIsland) window.DynamicIsland.hide();

  Timer.stop();
  await renderSelect();
  await showReceipt(session);
}

export async function cancelSession() {
  if (!confirm('Cancel this session? Progress will be lost.')) return;
  State.phase = 'select';
  State.startedAt = 0;
  State.plan = [];
  persistSession();
  Timer.stop();
  // @ts-ignore
  if (window.DynamicIsland) window.DynamicIsland.hide();
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
  State.plan.forEach((ex) => {
    const mul = ex.isUnilateral ? 2 : 1;
    let allDone = true, anyDone = false;
    ex.sets.forEach((s) => {
      if (s.done) {
        tonnage += (s.weight || 0) * (s.reps || 0) * mul;
        setsDone++;
        anyDone = true;
      } else allDone = false;
    });
    if (anyDone && allDone) exDone++;
  });
  const tEl = document.getElementById('live-tonnage');
  const sEl = document.getElementById('live-sets-done');
  const eEl = document.getElementById('live-ex-done');
  const pEl = document.getElementById('workout-progress-fill');
  
  if (tEl) tEl.textContent = tonnage.toLocaleString();
  if (sEl) sEl.textContent = String(setsDone);
  if (eEl) eEl.textContent = String(exDone);
  
  if (pEl && State.plan.length > 0) {
    const pct = (exDone / State.plan.length) * 100;
    pEl.style.width = `${pct}%`;
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
