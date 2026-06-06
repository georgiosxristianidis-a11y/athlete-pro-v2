// @ts-check
import { DB } from '../db.js';
import { Timer } from '../timer.js';
import { Nav, Toast } from '../shell.js';
import { State, SESSION_KEY, loadPlan, savePlan, buildSession, persistSession, getWeekMode, setWeekMode, getCustomWorkouts, saveCustomWorkout, deleteCustomWorkout, loadCoreChecklist, saveCoreChecklist, getActivePlan, startPlan, advancePlan } from '../workout.store.js';
import { generateRecommendations } from '../claude.store.js';
import { Heatmap } from '../claude.store.js';
import { renderSelect, renderActive, renderSetRow, renderFocusMode, _renderCoreSection, _coreCheckedState } from './render.js';
import { openExercisePickerModal } from './modals.js';
import { initDragNumbers } from '../ui/drag-number.js';
import { initGravitySubmit } from '../ui/gravity-submit.js';
import { initDrumPickers, syncDrum } from '../ui/drum-picker.js';
import { showReceipt } from '../ui/receipt.js';
import { RestTimer } from '../rest-timer.js';

function _haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }

/* ════════════════════════════════════════════════════════
   SELECT TYPE
   ════════════════════════════════════════════════════════ */
export async function selectType(type) {
  const activePlan = getActivePlan();
  State.type = type === 'active' ? (activePlan?.type || 'push') : type;
  
  const [workouts, autoProgressFlag, restDurRaw] = await Promise.all([
    DB.Workouts.getAll().catch(() => []),
    DB.Settings.get('auto-progress', 'on').catch(() => 'on'),
    DB.Settings.get('rest-duration').catch(() => null),
  ]);
  _restDuration = parseInt(restDurRaw || 90);
  const autoProgress = autoProgressFlag !== 'off';

  State.plan = buildSession(type, { workouts, autoProgress });
  const bumpedCount = State.plan.filter(ex => ex.autoBumped).length;
  if (bumpedCount > 0 && autoProgress) {
    Toast.show(`AI Progress: +2.5kg on ${bumpedCount} exercise${bumpedCount > 1 ? 's' : ''}`, 'success', 2400);
  }
  State.phase = 'active';
  State.startedAt = Date.now();

  persistSession();

  Timer.start((s) => {
    const el = document.getElementById('session-timer-val');
    if (el) el.textContent = Timer.fmt(s);
  });

  await renderActive();
}

/**
 * Start a structured training program from the hub.
 * @param {string} id
 */
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
   STEPPER — weight / reps
   ════════════════════════════════════════════════════════ */
export function stepWeight(ei, si, delta, isDrag = false) {
  const key = `w-${ei}-${si}`;
  const now = Date.now();
  if (!isDrag && State.stepDebounce[key] && now - State.stepDebounce[key] < 250) return;
  State.stepDebounce[key] = now;
  _haptic(10);
  const set = State.plan[ei].sets[si];
  set.weight = Math.max(0, Math.round((set.weight + delta) * 10) / 10);
  _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
  _updateLiveStats();
  persistSession();
}

export function stepReps(ei, si, delta, isDrag = false) {
  const key = `r-${ei}-${si}`;
  const now = Date.now();
  if (!isDrag && State.stepDebounce[key] && now - State.stepDebounce[key] < 250) return;
  State.stepDebounce[key] = now;
  _haptic(10);
  const set = State.plan[ei].sets[si];
  set.reps = Math.max(1, set.reps + delta);
  _updateStepperUI('r', ei, si, set.reps, set.reps <= 1);
  _updateLiveStats();
  persistSession();
}

function _updateStepperUI(type, ei, si, val, atMin) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  const minBtn = document.querySelector(`#${prefix}-${ei}-${si} .stepper-btn:first-child`);
  if (valEl) valEl.textContent = val;
  if (inpEl) inpEl.value = val;
  if (minBtn) minBtn.classList.toggle('at-min', atMin);
  syncDrum(type, ei, si, val);
}

export function editVal(type, ei, si) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  if (!valEl || !inpEl) return;
  valEl.classList.add('hidden');
  inpEl.classList.add('active');
  inpEl.focus();
  inpEl.select();
}

export function commitVal(type, ei, si) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  if (!valEl || !inpEl) return;
  const parsed = parseFloat(inpEl.value);
  if (!isNaN(parsed)) {
    const set = State.plan[ei].sets[si];
    if (type === 'w') set.weight = Math.max(0, parsed);
    else set.reps = Math.max(1, Math.round(parsed));
    valEl.textContent = type === 'w' ? set.weight : set.reps;
  }
  valEl.classList.remove('hidden');
  inpEl.classList.remove('active');
  _updateLiveStats();
  persistSession();
}

/* ════════════════════════════════════════════════════════
   RPE
   ════════════════════════════════════════════════════════ */
export function setRPE(ei, si, val) {
  _haptic(8);
  const set = State.plan[ei].sets[si];
  set.rpe = set.rpe === val ? null : val;
  const row = document.getElementById(`rpe-${ei}-${si}`);
  if (!row) return;
  row.querySelectorAll('.rpe-btn').forEach((btn) => {
    const v = parseInt(btn.dataset.val);
    btn.classList.toggle('rpe-active', v === set.rpe);
  });
}

/* ════════════════════════════════════════════════════════
   TOGGLE SET DONE + REST TIMER
   ════════════════════════════════════════════════════════ */
let _restDuration = 90;

export function toggleSet(ei, si) {
  _haptic(15);
  const set = State.plan[ei].sets[si];
  set.done = !set.done;

  const row = document.getElementById(`set-row-${ei}-${si}`);
  const chk = document.getElementById(`chk-${ei}-${si}`);
  if (row) row.classList.toggle('set-done', set.done);
  if (chk) chk.classList.toggle('done', set.done);

  const doneSets = State.plan[ei].sets.filter((s) => s.done).length;
  const countEl = document.getElementById(`ex-done-count-${ei}`);
  if (countEl) countEl.textContent = doneSets > 0 ? ` · ${doneSets} done` : '';

  if (set.done && set.weight > 0 && set.reps > 0) {
    DB.OneRM.update(State.plan[ei].name, set.weight, set.reps);
  }

  _updateLiveStats();
  persistSession();

  if (set.done) {
    _checkAIProactive();
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.pulseSetComplete();
    const exName = State.plan[ei]?.name || '';
    RestTimer.start(exName, `Set ${si + 1}`, _restDuration);
  } else {
    RestTimer.stop();
  }
}

async function _checkAIProactive() {
  try {
    const { checkProactiveTrigger } = await import('../workout-ai.view.js');
    if (checkProactiveTrigger) {
      await checkProactiveTrigger();
    }
  } catch (err) {
    console.warn('[_checkAIProactive] Error:', err);
  }
}


/* ════════════════════════════════════════════════════════
   CARD TOGGLE
   ════════════════════════════════════════════════════════ */
export function toggleCard(ei) {
  const wrap = document.getElementById(`sets-wrap-${ei}`);
  const chevron = document.getElementById(`ex-chevron-${ei}`);
  if (!wrap) return;
  const open = wrap.style.display !== 'none';
  wrap.style.display = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? 'rotate(-90deg)' : 'rotate(0)';
}

/* ════════════════════════════════════════════════════════
   CUSTOM WORKOUT MODAL
   ════════════════════════════════════════════════════════ */
export async function openCustomWorkoutModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'custom-workout-overlay';

  const customWorkouts = getCustomWorkouts();

  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">My Workouts</div>
        <button class="btn-icon-sm" id="custom-wk-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Custom workouts list -->
      <div class="section-header" style="margin-bottom:var(--sp-1)">
        <span class="section-label">Your Custom Workouts</span>
        <button class="btn-text" onclick="Workout._createNewCustomWorkout()" style="font-size:11px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New
        </button>
      </div>

      <div class="custom-workouts-list" id="custom-wk-list">
        ${customWorkouts.length === 0
          ? '<div class="plan-empty" style="padding:var(--sp-3)">No custom workouts yet. Create your first!</div>'
          : customWorkouts.map(w => `
            <div class="custom-workout-item" data-id="${w.id}">
              <div class="custom-workout-info">
                <div class="custom-workout-name">${w.name}</div>
                <div class="custom-workout-meta">${w.exercises?.length || 0} exercises · ${w.type || 'custom'}</div>
              </div>
              <div class="custom-workout-actions">
                <button class="btn-icon-sm" onclick="Workout._editCustomWorkout('${w.id}')" aria-label="Edit">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="1.5" stroke-linecap="round" width="16" height="16">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="btn-icon-sm" onclick="Workout._deleteCustomWorkout('${w.id}')" aria-label="Delete" style="color:var(--c-red)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="1.5" stroke-linecap="round" width="16" height="16">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                  </svg>
                </button>
                <button class="btn btn-primary btn-sm" onclick="Workout._startCustomWorkout('${w.id}')" style="margin-left:auto">
                  Start
                </button>
              </div>
            </div>
          `).join('')}
      </div>

      <button class="btn btn-primary" style="margin-top:var(--sp-2)" onclick="Workout._closeCustomWorkoutModal()">
        Close
      </button>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('#custom-wk-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

export async function _createNewCustomWorkout() {
  const name = prompt('Enter workout name:');
  if (!name) return;

  const type = prompt('Enter type (push/pull/legs/custom):', 'custom') || 'custom';

  const newWorkout = {
    id: 'custom-' + Date.now(),
    name,
    type,
    exercises: []
  };

  await openExercisePickerModal(type, (exercise) => {
    newWorkout.exercises.push({ name: exercise.name, sets: 3, reps: 10, weight: 0 });
    saveCustomWorkout(newWorkout);
    openCustomWorkoutModal();
  });
}

export async function _editCustomWorkout(id) {
  const workouts = getCustomWorkouts();
  const workout = workouts.find(w => w.id === id);
  if (!workout) return;

  document.getElementById('custom-workout-overlay')?.remove();

  await openExercisePickerModal(workout.type || 'custom', (exercise) => {
    workout.exercises.push({ name: exercise.name, sets: 3, reps: 10, weight: 0 });
    saveCustomWorkout(workout);
    openCustomWorkoutModal();
  });
}

export function _deleteCustomWorkout(id) {
  if (confirm('Delete this workout?')) {
    deleteCustomWorkout(id);
    openCustomWorkoutModal();
  }
}

export async function _startCustomWorkout(id) {
  const workouts = getCustomWorkouts();
  const workout = workouts.find(w => w.id === id);
  if (!workout) return;

  State.type = workout.type || 'custom';
  State.plan = workout.exercises.map(ex => ({
    name: ex.name,
    sets: Array.from({ length: ex.sets || 3 }, () => ({
      weight: ex.weight || 0,
      reps: ex.reps || 10,
      rpe: null,
      done: false,
    })),
  }));
  State.phase = 'active';
  State.startedAt = Date.now();

  persistSession();
  await renderActive();
}

export function _closeCustomWorkoutModal() {
  document.getElementById('custom-workout-overlay')?.remove();
}

/* ════════════════════════════════════════════════════════
   ADD SET
   ════════════════════════════════════════════════════════ */
export async function addSet(ei) {
  const ex = State.plan[ei];
  const last = ex.sets[ex.sets.length - 1] || { weight: 0, reps: 10 };
  ex.sets.push({ weight: last.weight, reps: last.reps, rpe: null, done: false });
  const wrap = document.getElementById(`sets-wrap-${ei}`);
  if (wrap) {
    const headerRow = wrap.querySelector('.set-header-row').outerHTML;
    const addBtn = wrap.querySelector('.add-set-btn').outerHTML;
    const rowPromises = ex.sets.map((s, si) => renderSetRow(ex, ei, s, si));
    const rows = await Promise.all(rowPromises);
    wrap.innerHTML = headerRow + rows.join('') + addBtn;
  }
  requestAnimationFrame(() => { initDragNumbers(); initGravitySubmit(); initDrumPickers(); });
  _updateLiveStats();
  persistSession();
}

/* ════════════════════════════════════════════════════════
   SMART ACTIONS (Smart Copy & Smart Coach)
   ════════════════════════════════════════════════════════ */

/**
 * Copy weight/reps from previous filled set in this session.
 */
export function smartCopy(ei, si) {
  _haptic(15);
  const ex = State.plan[ei];
  const set = ex.sets[si];
  
  // 1. Try to find the closest previous set that is DONE
  let source = [...ex.sets].reverse().find((s, idx) => (ex.sets.length - 1 - idx) < si && s.done);
  
  // 2. If no DONE sets, just take the set immediately above
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

/**
 * Intelligent weight bump based on history.
 */
export async function smartCoach(ei, si) {
  _haptic(20);
  const ex = State.plan[ei];
  const set = ex.sets[si];

  const workouts = await DB.Workouts.getAll().catch(() => []);
  const lastSession = [...workouts].reverse().find(w => 
    (w.exercises || []).some(e => e.name === ex.name)
  );
  const lastEx = lastSession?.exercises?.find(e => e.name === ex.name);
  
  if (!lastEx || !lastEx.sets?.length) {
    Toast.show('No history found', 'info');
    return;
  }

  // Linear progression: if last session was successful, +2.5kg
  const success = lastEx.sets.every(s => s.done); // simplified check
  const lastWeight = Math.max(...lastEx.sets.map(s => s.weight));
  
  set.weight = success ? lastWeight + 2.5 : lastWeight;
  _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
  _updateLiveStats();
  persistSession();
  
  Toast.show(success ? 'Turbo Boost: +2.5kg' : 'Target Restored', 'success');
}

/* ════════════════════════════════════════════════════════
   LIVE STATS
   ════════════════════════════════════════════════════════ */
export function _updateLiveStats() {
  let tonnage = 0;
  let setsDone = 0;
  let exDone = 0;

  State.plan.forEach((ex) => {
    const mul = ex.isUnilateral ? 2 : 1;
    let allDone = true;
    ex.sets.forEach((s) => {
      if (s.done) {
        tonnage += s.weight * s.reps * mul;
        setsDone++;
      } else {
        allDone = false;
      }
    });
    if (allDone && ex.sets.length) exDone++;
  });

  const t = document.getElementById('live-tonnage');
  const s = document.getElementById('live-sets-done');
  const e = document.getElementById('live-ex-done');
  if (t)
    t.textContent = tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 'k' : Math.round(tonnage);
  if (s) s.textContent = setsDone;
  if (e) e.textContent = exDone;
}

/* ════════════════════════════════════════════════════════
   COMPLETE SESSION
   ════════════════════════════════════════════════════════ */
export async function completeSession() {
  Timer.pause();
  const duration = Timer.seconds() * 1000;
  Timer.reset();

  let tonnage = 0;
  State.plan.forEach((ex) => {
    const mul = ex.isUnilateral ? 2 : 1;
    ex.sets.forEach((s) => {
      if (s.done) tonnage += s.weight * s.reps * mul;
    });
  });

  const activePlan = getActivePlan();
  const session = {
    type: State.type,
    planId: activePlan?.id || null, // Link session to specific program
    timestamp: State.startedAt,
    duration,
    tonnage,
    exercises: State.plan
      .filter(ex => !ex.noDb) // Filter out Core/Alignment from DB
      .map((ex) => ({
        name: ex.name,
        sets: ex.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
          done: s.done,
        })),
      })),
  };

  await DB.Workouts.save(session);
  if (activePlan) advancePlan(); // Move cycle forward
  await DB.Events.log('workout_complete', { type: State.type, tonnage });
  localStorage.removeItem(SESSION_KEY);
  localStorage.setItem('ap-last-workout-type', State.type);

  Toast.show(`Session saved — ${Math.round(tonnage)} kg`, 'success');
  RestTimer.stop();

  const nextType = { push: 'pull', pull: 'legs', legs: 'push' }[State.type] || 'push';
  const plan = loadPlan();
  const nextSessionPlan = plan[nextType] || [];

  if (nextSessionPlan.length) {
    try {
      const [fatigue, orms] = await Promise.all([
        Heatmap.compute(),
        DB.OneRM.getAll(),
      ]);

      const recommendations = await generateRecommendations(
        session,
        fatigue,
        orms,
        nextSessionPlan
      );

      if (recommendations) {
        await _showRecommendationsModal(recommendations);
      }
    } catch (err) {
      console.warn('[completeSession] Recommendations failed:', err.message);
    }
  }

  await showReceipt(session);

  State.phase = 'select';
  Nav.go('s-home');
}

/* ════════════════════════════════════════════════════════
   CANCEL SESSION
   ════════════════════════════════════════════════════════ */
export function cancelSession() {
  _showConfirm(
    'Cancel Session?',
    'All progress for this workout will be lost. This cannot be undone.',
    'Cancel Session',
    () => {
      Timer.reset();
      RestTimer.stop();
      localStorage.removeItem(SESSION_KEY);
      State.phase = 'select';
      renderSelect();
    }
  );
}

function _showConfirm(title, body, confirmLabel, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '5000';
  overlay.innerHTML = `
    <div class="modal-sheet" style="padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))">
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:8px 0 20px;">
        <div style="font-size:17px;font-weight:800;color:var(--c-text-1);margin-bottom:10px;">${title}</div>
        <div style="font-size:13px;color:var(--c-text-2);line-height:1.5;">${body}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-ghost" id="wk-confirm-ok" style="border-color:rgba(255,71,87,0.3);color:var(--c-red)">
          ${confirmLabel}
        </button>
        <button class="btn btn-primary" id="wk-confirm-cancel">
          Keep Training
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.querySelector('#wk-confirm-ok').addEventListener('click', () => {
    close();
    onConfirm();
  });
  overlay.querySelector('#wk-confirm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

/* ════════════════════════════════════════════════════════
   RECOMMENDATIONS MODAL
   ════════════════════════════════════════════════════════ */
async function _showRecommendationsModal(recs) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '5000';

    const nextTypeLabel = recs.type.charAt(0).toUpperCase() + recs.type.slice(1);

    overlay.innerHTML = `
      <div class="modal-sheet" style="max-width:520px;margin:auto;border-radius:var(--r-xl)">
        <div class="modal-handle"></div>

        <div class="section-header">
          <span class="section-label">Next ${nextTypeLabel} Session</span>
          <span class="badge badge-green">AI Powered</span>
        </div>

        <div class="recommendations-modal">
          ${recs.exercises
            .filter((ex) => ex.recommendedWeight > ex.currentWeight || ex.reason.includes('Progressive'))
            .slice(0, 5)
            .map(
              (ex) => `
              <div class="rec-ex-row">
                <div class="rec-ex-dot" style="background:var(--c-accent)"></div>
                <div class="rec-ex-info">
                  <span class="rec-ex-name">${ex.name}</span>
                  <span class="rec-ex-reason">${ex.reason}</span>
                </div>
                <div class="rec-ex-weights">
                  <span class="rec-old">${ex.currentWeight}kg</span>
                  <span class="rec-arrow">→</span>
                  <span class="rec-new">${ex.recommendedWeight}kg</span>
                </div>
              </div>`
            )
            .join('')}
          ${recs.exercises.filter((ex) => ex.recommendedWeight > ex.currentWeight).length > 5
            ? `<div class="rec-more">+${recs.exercises.filter((ex) => ex.recommendedWeight > ex.currentWeight).length - 5} more exercises</div>`
            : ''}
        </div>

        ${recs.aiNotes
          ? `
          <div class="ai-notes-card">
            <div class="ai-notes-icon">AI</div>
            <div class="ai-notes-text">
              <strong>Coach's Note:</strong><br>
              ${recs.aiNotes.substring(0, 200)}${recs.aiNotes.length > 200 ? '...' : ''}
            </div>
          </div>`
          : ''}

        ${recs.highFatigue?.length
          ? `
          <div class="fatigue-warning">
            <span class="fatigue-icon">[!]</span>
            <span class="fatigue-text">High fatigue: ${recs.highFatigue.join(', ')}. Consider lighter weights.</span>
          </div>`
          : ''}

        <button class="btn btn-primary btn-full" id="rec-got-it">
          Got it — Let's go!
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => {
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 300);
    };

    overlay.querySelector('#rec-got-it')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  });
}

/* ════════════════════════════════════════════════════════
   ADD LIVE EXERCISE
   ════════════════════════════════════════════════════════ */
export function _addLiveExercise() {
  if (State.phase !== 'active' || !State.plan) return;
  openExercisePickerModal(State.type, (exercise) => {
    State.plan.push({
      name: exercise.name,
      isUnilateral: false,
      sets: Array.from({ length: 3 }, () => ({ weight: 0, reps: 10, rpe: null, done: false })),
    });
    persistSession();
    renderActive();
    Toast.show(`Added: ${exercise.name}`, 'success');
  });
}

/* ════════════════════════════════════════════════════════
   WEEK TOGGLE + CORE CHECKLIST
   ════════════════════════════════════════════════════════ */
export function _toggleWeek() {
  const cur = getWeekMode();
  const next = cur === 'A' ? 'B' : 'A';
  setWeekMode(next);
  _haptic(12);
  Toast.show(`Switched to Week ${next}`, 'info', 1400);
  if (State.phase === 'active') {
    const pill = document.querySelector('#s-train .week-pill');
    if (pill) {
      pill.classList.remove('week-A', 'week-B');
      pill.classList.add('week-' + next);
      const v = pill.querySelector('.week-pill-val');
      if (v) v.textContent = next;
    }
  } else {
    renderSelect();
  }
}

export function _toggleCoreItem(day, i) {
  const items = loadCoreChecklist(day);
  const name = items[i];
  if (!name) return;
  const key = `${day}:${name}`;
  _coreCheckedState[key] = !_coreCheckedState[key];
  const el = document.getElementById(`core-item-${i}`);
  if (el) el.classList.toggle('checked', _coreCheckedState[key]);
  _haptic(8);
}

export function _addCoreItem(day) {
  const name = (prompt('Add core exercise:') || '').trim();
  if (!name) return;
  const items = loadCoreChecklist(day);
  items.push(name);
  saveCoreChecklist(day, items);
  const sec = document.getElementById('core-section');
  if (sec) sec.innerHTML = _renderCoreSection(day);
}

export function _removeCoreItem(day, i) {
  const items = loadCoreChecklist(day);
  items.splice(i, 1);
  saveCoreChecklist(day, items);
  const sec = document.getElementById('core-section');
  if (sec) sec.innerHTML = _renderCoreSection(day);
}

/* ════════════════════════════════════════════════════════
   FOCUS MODE (Phase 3.A) — long-press + swipe + actions
   ════════════════════════════════════════════════════════ */

let _focusEi = null;
let _focusTimerInterval = null;

function _focusActiveSi() {
  const ex = State.plan[_focusEi];
  if (!ex) return -1;
  const idx = ex.sets.findIndex(s => !s.done);
  return idx < 0 ? ex.sets.length - 1 : idx;
}

function _updateFocusProgress() {
  const totalSets = State.plan.reduce((acc, e) => acc + e.sets.length, 0);
  const totalDone = State.plan.reduce((acc, e) => acc + e.sets.filter(s => s.done).length, 0);
  const pct = totalSets ? (totalDone / totalSets) * 100 : 0;
  const fill = document.getElementById('focus-progress-fill');
  if (fill) fill.style.width = pct + '%';
}

export async function _openFocus(ei) {
  if (_focusEi !== null) return;
  _focusEi = ei;
  const html = await renderFocusMode(ei);
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const overlay = wrap.firstElementChild;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  _haptic(20);

  // Sync workout time every second
  clearInterval(_focusTimerInterval);
  _focusTimerInterval = setInterval(() => {
    const el = document.getElementById('focus-hero-time');
    if (el) el.textContent = Timer.fmt(Timer.seconds());
  }, 1000);

  _initFocusSwipe(overlay);
}

export function _closeFocus() {
  const overlay = document.getElementById('focus-overlay');
  if (!overlay) return;
  overlay.classList.add('closing');
  clearInterval(_focusTimerInterval);
  _focusTimerInterval = null;
  setTimeout(() => {
    overlay.remove();
    _focusEi = null;
  }, 250);
}

export async function _focusNext() {
  if (_focusEi === null) return;
  if (_focusEi >= State.plan.length - 1) { _haptic(8); return; }
  _focusEi++;
  await _refocus();
}

export async function _focusPrev() {
  if (_focusEi === null) return;
  if (_focusEi <= 0) { _haptic(8); return; }
  _focusEi--;
  await _refocus();
}

async function _refocus() {
  _haptic(12);
  const ei = _focusEi;
  const old = document.getElementById('focus-overlay');
  const html = await renderFocusMode(ei);
  if (!old) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const next = wrap.firstElementChild;
  next.classList.add('visible');
  old.replaceWith(next);
  _initFocusSwipe(next);
}

export function _focusStepW(delta) {
  if (_focusEi === null) return;
  const si = _focusActiveSi();
  if (si < 0) return;
  stepWeight(_focusEi, si, delta);
  const set = State.plan[_focusEi].sets[si];
  const el = document.getElementById('focus-w-val');
  if (el) el.textContent = set.weight;
}

export function _focusStepR(delta) {
  if (_focusEi === null) return;
  const si = _focusActiveSi();
  if (si < 0) return;
  stepReps(_focusEi, si, delta);
  const set = State.plan[_focusEi].sets[si];
  const el = document.getElementById('focus-r-val');
  if (el) el.textContent = set.reps;
}

export async function _focusCompleteSet() {
  if (_focusEi === null) return;
  const ex = State.plan[_focusEi];
  if (!ex) return;
  const si = ex.sets.findIndex(s => !s.done);
  if (si < 0) {
    // All sets done — auto-advance to next exercise
    if (_focusEi < State.plan.length - 1) {
      await _focusNext();
    } else {
      _haptic(40);
      Toast.show('All exercises complete!', 'success');
    }
    return;
  }

  toggleSet(_focusEi, si);
  _updateFocusProgress();

  // Update focus card UI for next set or auto-advance
  const ex2 = State.plan[_focusEi];
  const nextSi = ex2.sets.findIndex(s => !s.done);

  if (nextSi < 0) {
    // Exercise complete — advance to next exercise after a brief moment
    const cta = document.getElementById('focus-cta');
    if (cta) cta.querySelector('.focus-cta-text').textContent = 'Exercise Done';
    setTimeout(async () => {
      if (_focusEi < State.plan.length - 1) {
        await _focusNext();
      } else {
        const c = document.getElementById('focus-cta');
        if (c) {
          c.disabled = true;
          c.querySelector('.focus-cta-text').textContent = 'All Sets Done';
        }
      }
    }, 600);
  } else {
    // Update next-active-set UI in focus card
    const set = ex2.sets[nextSi];
    const wEl = document.getElementById('focus-w-val');
    const rEl = document.getElementById('focus-r-val');
    const sEl = document.getElementById('focus-set-cur');
    if (wEl) wEl.textContent = set.weight;
    if (rEl) rEl.textContent = set.reps;
    if (sEl) sEl.textContent = nextSi + 1;
    const overlay = document.getElementById('focus-overlay');
    if (overlay) overlay.dataset.si = nextSi;
  }

  // Show rest timer card with countdown
  _focusStartRestCountdown(_restDuration);
}

let _focusRestRaf = null;
function _focusStartRestCountdown(seconds) {
  const card = document.getElementById('focus-rest-card');
  const valEl = document.getElementById('focus-rest-val');
  if (!card || !valEl) return;
  card.classList.remove('hidden');
  const end = Date.now() + seconds * 1000;
  cancelAnimationFrame(_focusRestRaf);
  const tick = () => {
    const rem = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    valEl.textContent = Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0');
    if (rem <= 0) {
      card.classList.add('hidden');
      return;
    }
    _focusRestRaf = requestAnimationFrame(tick);
  };
  tick();
}

/* ── Touch swipe inside focus overlay ── */
function _initFocusSwipe(overlay) {
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false, scrolled = false;
  const body = overlay.querySelector('.focus-body');

  overlay.addEventListener('touchstart', (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    dx = 0; dy = 0;
    active = true;
    scrolled = false;
  }, { passive: true });

  overlay.addEventListener('touchmove', (e) => {
    if (!active) return;
    const t = e.touches[0];
    dx = t.clientX - sx;
    dy = t.clientY - sy;
    // If user is scrolling vertically inside body, mark scrolled
    if (body && Math.abs(dy) > Math.abs(dx) && body.scrollTop > 0 && dy < 0) scrolled = true;
  }, { passive: true });

  overlay.addEventListener('touchend', async () => {
    if (!active) return;
    active = false;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    // Horizontal swipe — prev/next exercise
    if (absX > 60 && absX > absY * 1.4) {
      if (dx < 0) await _focusNext();
      else await _focusPrev();
      return;
    }
    // Swipe down — close (only if not scrolled inside body)
    if (dy > 80 && absY > absX * 1.4 && !scrolled) {
      _closeFocus();
    }
  }, { passive: true });
}

/* ── Long-press init for active exercise list ── */
export function _initFocusLongPress() {
  const list = document.getElementById('exercise-list');
  if (!list) return;

  list.querySelectorAll('.exercise-card').forEach((card) => {
    const header = card.querySelector('.exercise-header');
    if (!header || header.dataset.focusBound === '1') return;
    header.dataset.focusBound = '1';

    let timer = null;
    let startX = 0, startY = 0;
    let triggered = false;

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.drag-handle') || e.target.closest('.ex-replace-btn')) return;
      startX = e.clientX; startY = e.clientY;
      triggered = false;
      timer = setTimeout(() => {
        triggered = true;
        const ei = parseInt(card.dataset.ei);
        if (!isNaN(ei)) _openFocus(ei);
      }, 400);
    });

    header.addEventListener('pointermove', (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) cancel();
    });

    header.addEventListener('pointerup', () => cancel());
    header.addEventListener('pointercancel', () => cancel());
    header.addEventListener('pointerleave', () => cancel());

    // Suppress click that follows long-press
    header.addEventListener('click', (e) => {
      if (triggered) {
        e.stopPropagation();
        e.preventDefault();
        triggered = false;
      }
    }, true);
  });
}
