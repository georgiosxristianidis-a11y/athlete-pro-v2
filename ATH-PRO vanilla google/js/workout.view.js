// @ts-check
import { DB } from './db.js';
import { Timer } from './timer.js';
import { Nav, Toast } from './shell.js';
import { State, EXERCISE_LIBRARY, SESSION_KEY, loadPlan, savePlan, buildSession, persistSession, tryRestoreSession, getExerciseLibrary, filterExercises, getUniqueValues, getCustomWorkouts, saveCustomWorkout, deleteCustomWorkout } from './workout.store.js';


let _planEditorActiveTab = () => 'push';
let _planEditorSetTab = () => {};

const TYPE_COLOR = {
  push: 'var(--c-accent)',
  pull: 'var(--c-purple)',
  legs: 'var(--c-blue)',
};

function svgArrow(dir) {
  const p = {
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    up: '<polyline points="18 15 12 9 6 15"/>',
    down: '<polyline points="6 9 12 15 18 9"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">${p[dir]}</svg>`;
}

function typeIcon(type, color) {
  const icons = {
    push: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M5 12H3M21 12h-2M12 3V5M12 19v2"/><circle cx="12" cy="12" r="4"/></svg>`,
    pull: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><path d="M9 12h6M12 9l3 3-3 3"/></svg>`,
    legs: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" width="20" height="20"><path d="M8 3s0 5-2 9-3 8-2 10M13 3s1 5 1 9-1 8 0 10M8 12c2 0 4 0 5 3"/></svg>`,
  };
  return icons[type] || '';
}

function fmtVol(kg) {
  return kg >= 1000 ? (kg / 1000).toFixed(1) + 'k' : Math.round(kg).toString();
}

function renderSelect() {
  State.phase = 'select';
  const plan = loadPlan();

  document.getElementById('s-train').innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">Workout</div>
        <div class="screen-sub" id="train-date"></div>
      </div>
    </div>
    <div class="section-header" style="margin-bottom:var(--sp-1)">
      <span class="section-label">Select Type</span>
      <button class="btn-text" onclick="Workout.openPlanEditor()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Edit Plan
      </button>
    </div>
    <div class="type-grid">
      ${['push', 'pull', 'legs'].map(t => `
        <button class="type-card" data-type="${t}" onclick="Workout.selectType('${t}')">
          <div class="type-card-icon" style="background:${t === 'push' ? 'var(--c-accent-bg)' : t === 'pull' ? 'var(--c-purple-bg)' : 'var(--c-blue-bg)'}">
            ${typeIcon(t, t === 'push' ? 'var(--c-accent)' : t === 'pull' ? 'var(--c-purple)' : 'var(--c-blue)')}
          </div>
          <div class="type-card-name">${t.charAt(0).toUpperCase() + t.slice(1)}</div>
          <div class="type-card-meta">${(plan[t] || []).length} exercises</div>
        </button>`).join('')}
    </div>
    <div class="section-header" style="margin-top:var(--sp-2);margin-bottom:var(--sp-1)">
      <span class="section-label">Pre-Workout Checklist</span>
    </div>
    <div class="checklist-card" id="pre-checklist">
      ${['Warmup', 'Hydration', 'Gear', 'Energy', 'Plan', 'Focus'].map((text, i) => `
        <div class="checklist-item" id="chk-pre-${i}" onclick="Workout.toggleChecklist(${i})">
          <div class="checklist-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="checklist-text">${text}</span>
        </div>`).join('')}
    </div>
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Last Sessions</span>
    </div>
    <div id="last-sessions-preview"><div style="text-align:center;padding:var(--sp-3);color:var(--c-text-3);font-size:12px">Loading...</div></div>
  `;

  document.getElementById('train-date').textContent = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  DB.Workouts.getLast(3).then((list) => {
    const el = document.getElementById('last-sessions-preview');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<div class="empty-state" style="padding:var(--sp-3)"><div class="empty-title" style="font-size:13px">No sessions yet</div></div>`;
      return;
    }
    el.innerHTML = list.map((w) => {
      const dot = TYPE_COLOR[w.type] || 'var(--c-text-3)';
      const date = new Date(w.timestamp).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      const dur = w.duration ? Timer.format(Math.round(w.duration / 1000)) : '--';
      return `<div class="session-item"><div class="session-dot" style="background:${dot}"></div><div class="session-info"><div class="session-title">${w.type.charAt(0).toUpperCase() + w.type.slice(1)} Day</div><div class="session-meta">${date} · ${dur}</div></div><div class="session-vol">${fmtVol(w.tonnage)} kg</div></div>`;
    }).join('');
  });
}

function openPlanEditor() {
  const plan = loadPlan();
  let activeTab = 'push';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'plan-editor-overlay';

  function tabContent(type) {
    const p = loadPlan();
    Object.assign(plan, p);
    let exercises = plan[type] || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      exercises = exercises.filter(ex => ex.name.toLowerCase().includes(q));
    }
    const exercisesHTML = exercises.length > 0 ? exercises.map((ex, filteredIndex) => {
      const originalIndex = plan[type].indexOf(ex);
      return `<div class="plan-row" id="plan-row-${type}-${originalIndex}" data-pi="${originalIndex}"><div class="plan-drag-handle"><svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg></div><input class="plan-input" value="${ex.name}" onchange="Workout._updatePlanName('${type}',${originalIndex},this.value)"><div class="plan-row-meta"><span class="plan-meta-label">Sets</span><div class="mini-stepper"><button onclick="Workout._adjustPlan('${type}',${originalIndex},'sets',-1)">${svgArrow('minus')}</button><span id="ps-sets-${type}-${originalIndex}">${ex.sets}</span><button onclick="Workout._adjustPlan('${type}',${originalIndex},'sets',1)">${svgArrow('plus')}</button></div><span class="plan-meta-label">Reps</span><div class="mini-stepper"><button onclick="Workout._adjustPlan('${type}',${originalIndex},'reps',-1)">${svgArrow('minus')}</button><span id="ps-reps-${type}-${originalIndex}">${ex.reps}</span><button onclick="Workout._adjustPlan('${type}',${originalIndex},'reps',1)">${svgArrow('plus')}</button></div><button class="plan-delete" onclick="Workout._deletePlanEx('${type}',${originalIndex})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div></div>`;
    }).join('') : `<div class="plan-empty">No exercises found for "${searchQuery}"</div>`;
    return exercisesHTML + `<button class="btn-add-ex" onclick="Workout._addPlanEx('${type}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Exercise</button>`;
  }

  let searchQuery = '';
  function render() {
    overlay.innerHTML = `<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-header"><div class="modal-title">Edit Plan</div><button class="btn-icon-sm" onclick="Workout._closePlanEditor()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="plan-search-wrap"><svg class="plan-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input class="plan-search-input" id="plan-search" type="text" placeholder="Search exercises..." value="${searchQuery}" oninput="Workout._setPlanSearch(this.value)"></div><div class="plan-tabs">${['push', 'pull', 'legs'].map(t => `<button class="plan-tab ${t === activeTab ? 'active' : ''}" onclick="Workout._switchPlanTab('${t}')" style="${t === activeTab ? 'color:' + TYPE_COLOR[t] + ';border-color:' + TYPE_COLOR[t] : ''}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join('')}</div><div class="plan-list" id="plan-list">${tabContent(activeTab)}</div><button class="btn btn-primary" style="margin-top:var(--sp-2)" onclick="Workout._savePlanAndClose()">Save Plan</button></div>`;
  }

  render();
  requestAnimationFrame(_initPlanDrag);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _closePlanEditor(); });
  _planEditorActiveTab = () => activeTab;
  _planEditorSetTab = (t) => { activeTab = t; render(); requestAnimationFrame(_initPlanDrag); };
  window._planSetSearch = (q) => { searchQuery = q; render(); };
}

function _switchPlanTab(type) { _planEditorSetTab(type); }
function _setPlanSearch(query) { if (window._planSetSearch) window._planSetSearch(query); }
function _closePlanEditor() { const el = document.getElementById('plan-editor-overlay'); if (el) el.remove(); }
const _checklistState = new Array(6).fill(false);
function toggleChecklist(i) { _checklistState[i] = !_checklistState[i]; const item = document.getElementById(`chk-pre-${i}`); if (item) item.classList.toggle('checked', _checklistState[i]); _haptic(8); }
function _savePlanAndClose() { _closePlanEditor(); Toast.show('Plan saved', 'success'); }
function _updatePlanName(type, i, val) { const plan = loadPlan(); plan[type][i].name = val.trim() || plan[type][i].name; savePlan(plan); }
function _adjustPlan(type, i, field, delta) { const plan = loadPlan(); const min = field === 'sets' ? 1 : 1; plan[type][i][field] = Math.max(min, plan[type][i][field] + delta); savePlan(plan); const el = document.getElementById(`ps-${field}-${type}-${i}`); if (el) el.textContent = plan[type][i][field]; }

async function _addPlanEx(type) {
  openExercisePickerModal(type, async (exercise) => {
    const plan = loadPlan();
    let lastWeight = 0;
    let lastReps = 10;
    try {
      const history = await DB.Workouts.getAll();
      const lastSession = history.sort((a, b) => b.timestamp - a.timestamp).find(w => w.exercises && w.exercises.some(ex => ex.name === exercise.name));
      if (lastSession) {
        const exData = lastSession.exercises.find(ex => ex.name === exercise.name);
        if (exData && exData.sets && exData.sets.length > 0) {
          lastWeight = exData.sets[0].weight || 0;
          lastReps = exData.sets[0].reps || 10;
        }
      }
    } catch (e) {}
    plan[type].push({ name: exercise.name, sets: 3, reps: lastReps, weight: lastWeight });
    savePlan(plan);
    _switchPlanTab(type);
  });
}

function _deletePlanEx(type, i) { const plan = loadPlan(); plan[type].splice(i, 1); savePlan(plan); _switchPlanTab(_planEditorActiveTab()); }

function selectType(type) {
  State.type = type;
  State.plan = buildSession(type);
  State.phase = 'active';
  State.startedAt = Date.now();
  persistSession();
  Timer.start((s) => { const el = document.getElementById('session-timer-val'); if (el) el.textContent = Timer.format(s); });
  if (window.Hardware) window.Hardware.keepScreenAwake();
  renderActive();
}

function renderActive() {
  const color = TYPE_COLOR[State.type];
  const exCount = State.plan.length;
  const totalSets = State.plan.reduce((s, e) => s + e.sets.length, 0);

  document.getElementById('s-train').innerHTML = `
    <div class="screen-header"><div><div class="screen-title">${State.type.charAt(0).toUpperCase() + State.type.slice(1)} Day</div><div class="screen-sub">${exCount} exercises · ${totalSets} sets</div></div><div class="session-timer-chip" style="border-color:${color}20"><div class="session-timer-dot" style="background:${color}"></div><span id="session-timer-val" style="color:${color}">00:00</span></div></div>
    <div class="live-bar"><div class="live-stat"><span class="live-val" id="live-tonnage">0</span><span class="live-lbl">kg</span></div><div class="live-divider"></div><div class="live-stat"><span class="live-val" id="live-sets-done">0</span><span class="live-lbl">/ ${totalSets} sets</span></div><div class="live-divider"></div><div class="live-stat"><span class="live-val" id="live-ex-done">0</span><span class="live-lbl">/ ${exCount} ex</span></div></div>
    <div id="rest-timer-wrap" style="display:none"><div class="rest-header"><span class="section-label">Rest</span><span id="rest-val" style="color:var(--c-accent);font-weight:700;font-size:13px">90s</span></div><div class="rest-track"><div class="rest-fill" id="rest-fill"></div></div></div>
    <div id="exercise-list">${State.plan.map((ex, ei) => renderExerciseCard(ex, ei)).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:var(--sp-1);margin-top:var(--sp-2)"><button class="btn btn-primary" onclick="Workout.completeSession()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>Complete Session</button><button class="btn btn-ghost" onclick="Workout.cancelSession()">Cancel</button></div><div style="height:var(--sp-2)"></div>
  `;
  requestAnimationFrame(_initDrag);
}

function renderExerciseCard(ex, ei) {
  const doneSets = ex.sets.filter((s) => s.done).length;
  return `<div class="exercise-card" id="ex-card-${ei}" data-ei="${ei}"><div class="exercise-header" onclick="Workout.toggleCard(${ei})"><div class="drag-handle" onclick="event.stopPropagation()"><svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg></div><div class="exercise-icon"><span class="ex-num">${ei + 1}</span></div><div class="exercise-info"><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${ex.sets.length} sets<span id="ex-done-count-${ei}" style="color:var(--c-accent)">${doneSets > 0 ? ' · ' + doneSets + ' done' : ''}</span></div></div><button class="ex-replace-btn" title="Replace exercise" onclick="event.stopPropagation();Workout.openReplaceExModal(${ei})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg></button><div class="exercise-chevron" id="ex-chevron-${ei}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg></div></div><div class="sets-wrap" id="sets-wrap-${ei}"><div class="set-header-row"><span style="width:20px"></span><span class="set-col-label">Weight kg</span><span class="set-col-label">Reps</span><span class="set-col-label">RPE</span><span style="width:40px"></span></div>${ex.sets.map((set, si) => renderSetRow(ex, ei, set, si)).join('')}<button class="add-set-btn" onclick="Workout.addSet(${ei})">${svgArrow('plus')} Add Set</button></div></div>`;
}

function renderSetRow(ex, ei, set, si) {
  return `<div class="set-row ${set.done ? 'set-done' : ''}" id="set-row-${ei}-${si}"><span class="set-num">${si + 1}</span><div class="stepper" id="sw-${ei}-${si}"><button class="stepper-btn ${set.weight <= 0 ? 'at-min' : ''}" ontouchstart="Workout.stepWeight(${ei},${si},-2.5);event.preventDefault()" onclick="Workout.stepWeight(${ei},${si},-2.5)">${svgArrow('minus')}</button><span class="stepper-val" id="swv-${ei}-${si}" ondblclick="Workout.editVal('w',${ei},${si})">${set.weight}</span><input class="stepper-input" id="swi-${ei}-${si}" type="number" inputmode="decimal" step="2.5" value="${set.weight}" onblur="Workout.commitVal('w',${ei},${si})" onkeydown="if(event.key==='Enter')this.blur()"><button class="stepper-btn" ontouchstart="Workout.stepWeight(${ei},${si},2.5);event.preventDefault()" onclick="Workout.stepWeight(${ei},${si},2.5)">${svgArrow('plus')}</button></div><div class="stepper" id="sr-${ei}-${si}"><button class="stepper-btn ${set.reps <= 1 ? 'at-min' : ''}" ontouchstart="Workout.stepReps(${ei},${si},-1);event.preventDefault()" onclick="Workout.stepReps(${ei},${si},-1)">${svgArrow('down')}</button><span class="stepper-val" id="srv-${ei}-${si}" ondblclick="Workout.editVal('r',${ei},${si})">${set.reps}</span><input class="stepper-input" id="sri-${ei}-${si}" type="number" inputmode="numeric" step="1" value="${set.reps}" onblur="Workout.commitVal('r',${ei},${si})" onkeydown="if(event.key==='Enter')this.blur()"><button class="stepper-btn" ontouchstart="Workout.stepReps(${ei},${si},1);event.preventDefault()" onclick="Workout.stepReps(${ei},${si},1)">${svgArrow('up')}</button></div><div class="rpe-row" id="rpe-${ei}-${si}">${[6, 7, 8, 9, 10].map((v) => `<button class="rpe-btn ${set.rpe === v ? 'rpe-active' : ''}" data-val="${v}" onclick="Workout.setRPE(${ei},${si},${v})">${v}</button>`).join('')}</div><button class="set-check ${set.done ? 'done' : ''}" id="chk-${ei}-${si}" onclick="Workout.toggleSet(${ei},${si})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg></button></div>`;
}

function stepWeight(ei, si, delta) {
  const key = `w-${ei}-${si}`; const now = Date.now();
  if (State.stepDebounce[key] && now - State.stepDebounce[key] < 250) return;
  State.stepDebounce[key] = now; _haptic(10);
  const set = State.plan[ei].sets[si];
  set.weight = Math.max(0, Math.round((set.weight + delta) * 10) / 10);
  _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
  _updateLiveStats(); persistSession();
}

function stepReps(ei, si, delta) {
  const key = `r-${ei}-${si}`; const now = Date.now();
  if (State.stepDebounce[key] && now - State.stepDebounce[key] < 250) return;
  State.stepDebounce[key] = now; _haptic(10);
  const set = State.plan[ei].sets[si];
  set.reps = Math.max(1, set.reps + delta);
  _updateStepperUI('r', ei, si, set.reps, set.reps <= 1);
  _updateLiveStats(); persistSession();
}

function _updateStepperUI(type, ei, si, val, atMin) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  const minBtn = document.querySelector(`#${prefix}-${ei}-${si} .stepper-btn:first-child`);
  if (valEl) valEl.textContent = val; if (inpEl) inpEl.value = val; if (minBtn) minBtn.classList.toggle('at-min', atMin);
}

function editVal(type, ei, si) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  if (!valEl || !inpEl) return;
  valEl.classList.add('hidden'); inpEl.classList.add('active'); inpEl.focus(); inpEl.select();
}

function commitVal(type, ei, si) {
  const prefix = type === 'w' ? 'sw' : 'sr';
  const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
  const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
  if (!valEl || !inpEl) return;
  const parsed = parseFloat(inpEl.value);
  if (!isNaN(parsed)) {
    const set = State.plan[ei].sets[si];
    if (type === 'w') set.weight = Math.max(0, parsed); else set.reps = Math.max(1, Math.round(parsed));
    valEl.textContent = type === 'w' ? set.weight : set.reps;
  }
  valEl.classList.remove('hidden'); inpEl.classList.remove('active');
  _updateLiveStats(); persistSession();
}

function setRPE(ei, si, val) {
  _haptic(8); const set = State.plan[ei].sets[si]; set.rpe = set.rpe === val ? null : val;
  const row = document.getElementById(`rpe-${ei}-${si}`);
  if (!row) return;
  row.querySelectorAll('.rpe-btn').forEach((btn) => {
    const v = parseInt(btn.dataset.val); btn.classList.toggle('rpe-active', v === set.rpe);
  });
}

let _restInterval = null;
let _restDuration = 90;

function toggleSet(ei, si) {
  const set = State.plan[ei].sets[si];
  if (window.Hardware) {
    if (!set.done) window.Hardware.success(); else window.Hardware.tap();
  } else {
    _haptic(15);
  }
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

  _updateLiveStats(); persistSession();

  if (set.done) { _startRest(_restDuration); } else { _stopRest(); }
}

function _startRest(seconds) {
  const wrap = document.getElementById('rest-timer-wrap'); if (!wrap) return;
  wrap.style.display = 'block'; let remaining = seconds;
  const valEl = document.getElementById('rest-val'); const fillEl = document.getElementById('rest-fill');
  clearInterval(_restInterval);
  _restInterval = setInterval(() => {
    remaining--;
    if (valEl) valEl.textContent = remaining + 's';
    if (fillEl) fillEl.style.width = (remaining / seconds) * 100 + '%';
    if (remaining <= 0) { _stopRest(); _haptic(40); Toast.show('Rest complete — next set!', 'info'); }
  }, 1000);
  if (valEl) valEl.textContent = seconds + 's'; if (fillEl) fillEl.style.width = '100%';
}

function _stopRest() { clearInterval(_restInterval); const wrap = document.getElementById('rest-timer-wrap'); if (wrap) wrap.style.display = 'none'; }

function toggleCard(ei) {
  const wrap = document.getElementById(`sets-wrap-${ei}`); const chevron = document.getElementById(`ex-chevron-${ei}`);
  if (!wrap) return;
  const open = wrap.style.display !== 'none'; wrap.style.display = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? 'rotate(-90deg)' : 'rotate(0)';
}

async function openExercisePickerModal(filterCategory, onSelect) {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'exercise-picker-overlay';
  overlay.innerHTML = `<div class="modal-sheet" style="max-height:85vh;display:flex;flex-direction:column"><div class="modal-handle"></div><div class="modal-header"><div class="modal-title">Add Exercise</div><button class="btn-icon-sm" id="picker-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="add-ex-search-wrap"><input class="add-ex-search" id="picker-search" type="text" placeholder="Search exercises…" autocomplete="off" autocorrect="off" spellcheck="false"></div><div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 4px"><button class="pill-filter active" data-cat="all" style="border-color:var(--c-accent);color:var(--c-accent);background:rgba(0,200,110,0.08)">All</button><button class="pill-filter" data-cat="push" style="border-color:var(--c-indigo);color:var(--c-indigo);background:rgba(99,102,241,0.08)">Push</button><button class="pill-filter" data-cat="pull" style="border-color:var(--c-cyan);color:var(--c-cyan);background:rgba(6,182,212,0.08)">Pull</button><button class="pill-filter" data-cat="legs" style="border-color:var(--c-amber);color:var(--c-amber);background:rgba(245,158,11,0.08)">Legs</button><button class="pill-filter" data-cat="core" style="border-color:var(--c-yellow);color:var(--c-yellow);background:rgba(233,196,106,0.08)">Core</button></div><div style="font-size:11px;color:var(--c-text-3);padding:6px 0"><span id="picker-count">Loading…</span></div><div class="add-ex-list" id="picker-list" style="flex:1;overflow-y:auto"></div><div style="padding-top:12px;border-top:1px solid var(--c-surface-2)"><input class="add-ex-search" id="picker-custom" type="text" placeholder="Or type custom exercise name…" autocomplete="off" style="margin-bottom:8px"><button class="btn btn-primary btn-sm" id="picker-add-custom" style="width:100%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Custom Exercise</button></div></div>`;
  document.body.appendChild(overlay);
  const searchEl = overlay.querySelector('#picker-search'); const customEl = overlay.querySelector('#picker-custom'); const listEl = overlay.querySelector('#picker-list'); const countEl = overlay.querySelector('#picker-count'); const filterBtns = overlay.querySelectorAll('.pill-filter');
  let activeFilter = filterCategory || 'all'; let allExercises = []; let currentQuery = '';
  try { allExercises = await getExerciseLibrary(); renderList(); } catch (err) { listEl.innerHTML = `<div class="add-ex-empty">Failed to load exercises</div>`; countEl.textContent = 'Error loading library'; }
  function renderList() {
    let filtered = allExercises;
    if (activeFilter !== 'all') filtered = filtered.filter(ex => ex.category === activeFilter);
    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      filtered = filtered.filter(ex => ex.name.toLowerCase().includes(q) || ex.tags?.some(t => t.toLowerCase().includes(q)) || ex.primaryMuscles?.some(m => m.toLowerCase().includes(q)) || ex.secondaryMuscles?.some(m => m.toLowerCase().includes(q)));
    }
    countEl.textContent = `${filtered.length} exercises`; listEl.innerHTML = '';
    if (!filtered.length) { listEl.innerHTML = `<div class="add-ex-empty">No exercises found</div>`; return; }
    filtered.slice(0, 50).forEach((ex) => {
      const btn = document.createElement('button'); btn.className = 'add-ex-item'; btn.style.cssText = 'text-align:left;padding:10px 12px;height:auto';
      btn.innerHTML = `<div style="font-weight:700;font-size:13px;color:var(--c-text-1)">${ex.name}</div><div style="font-size:10px;color:var(--c-text-3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap"><span style="text-transform:capitalize">${ex.muscleGroup}</span><span>·</span><span style="text-transform:capitalize">${ex.equipment}</span><span>·</span><span style="text-transform:capitalize">${ex.mechanic}</span></div>`;
      btn.dataset.name = ex.name; listEl.appendChild(btn);
    });
  }
  searchEl.addEventListener('input', () => { currentQuery = searchEl.value; renderList(); });
  filterBtns.forEach((btn) => { btn.addEventListener('click', () => { filterBtns.forEach(b => { b.classList.remove('active'); b.style.cssText = ''; }); btn.classList.add('active'); activeFilter = btn.dataset.cat; renderList(); }); });
  overlay.querySelector('#picker-add-custom').addEventListener('click', () => { const customName = customEl.value.trim(); if (customName) { onSelect({ name: customName, id: customName.toLowerCase().replace(/[^a-z0-9]+/g, '-') }); overlay.remove(); } });
  listEl.addEventListener('click', (e) => { const btn = e.target.closest('[data-name]'); if (!btn) return; const name = btn.dataset.name.trim(); if (name) { const exercise = allExercises.find(ex => ex.name === name); onSelect(exercise || { name }); overlay.remove(); } });
  overlay.querySelector('#picker-close').addEventListener('click', () => overlay.remove()); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); }); requestAnimationFrame(() => searchEl.focus());
}

async function openReplaceExModal(ei) {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'replace-ex-overlay';
  overlay.innerHTML = `<div class="modal-sheet" style="max-height:85vh;display:flex;flex-direction:column"><div class="modal-handle"></div><div class="modal-header"><div class="modal-title">Replace Exercise</div><button class="btn-icon-sm" id="replace-ex-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="add-ex-search-wrap"><input class="add-ex-search" id="replace-ex-search" type="text" placeholder="Search exercises…" autocomplete="off" autocorrect="off" spellcheck="false"></div><div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 4px"><button class="pill-filter active" data-cat="all" style="border-color:var(--c-accent);color:var(--c-accent);background:rgba(0,200,110,0.08)">All</button><button class="pill-filter" data-cat="push" style="border-color:var(--c-indigo);color:var(--c-indigo);background:rgba(99,102,241,0.08)">Push</button><button class="pill-filter" data-cat="pull" style="border-color:var(--c-cyan);color:var(--c-cyan);background:rgba(6,182,212,0.08)">Pull</button><button class="pill-filter" data-cat="legs" style="border-color:var(--c-amber);color:var(--c-amber);background:rgba(245,158,11,0.08)">Legs</button><button class="pill-filter" data-cat="core" style="border-color:var(--c-yellow);color:var(--c-yellow);background:rgba(233,196,106,0.08)">Core</button></div><div style="font-size:11px;color:var(--c-text-3);padding:6px 0"><span id="replace-count">Loading…</span></div><div class="add-ex-list" id="replace-ex-list" style="flex:1;overflow-y:auto"></div><div style="padding-top:12px;border-top:1px solid var(--c-surface-2)"><input class="add-ex-search" id="replace-custom" type="text" placeholder="Or type custom exercise name…" autocomplete="off" style="margin-bottom:8px"><button class="btn btn-primary btn-sm" id="replace-add-custom" style="width:100%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Use Custom Exercise</button></div></div>`;
  document.body.appendChild(overlay);
  const searchEl = overlay.querySelector('#replace-ex-search'); const customEl = overlay.querySelector('#replace-custom'); const listEl = overlay.querySelector('#replace-ex-list'); const countEl = overlay.querySelector('#replace-count'); const filterBtns = overlay.querySelectorAll('.pill-filter');
  let activeFilter = 'all'; let allExercises = []; let currentQuery = '';
  try { allExercises = await getExerciseLibrary(); renderList(); } catch (err) { listEl.innerHTML = `<div class="add-ex-empty">Failed to load exercises</div>`; countEl.textContent = 'Error loading library'; }
  function renderList() {
    let filtered = allExercises;
    if (activeFilter !== 'all') filtered = filtered.filter(ex => ex.category === activeFilter);
    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      filtered = filtered.filter(ex => ex.name.toLowerCase().includes(q) || ex.tags?.some(t => t.toLowerCase().includes(q)) || ex.primaryMuscles?.some(m => m.toLowerCase().includes(q)) || ex.secondaryMuscles?.some(m => m.toLowerCase().includes(q)));
    }
    countEl.textContent = `${filtered.length} exercises`; listEl.innerHTML = '';
    if (!filtered.length) { listEl.innerHTML = `<div class="add-ex-empty">No exercises found</div>`; return; }
    filtered.slice(0, 50).forEach((ex) => {
      const btn = document.createElement('button'); btn.className = 'add-ex-item'; btn.style.cssText = 'text-align:left;padding:10px 12px;height:auto';
      btn.innerHTML = `<div style="font-weight:700;font-size:13px;color:var(--c-text-1)">${ex.name}</div><div style="font-size:10px;color:var(--c-text-3);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap"><span style="text-transform:capitalize">${ex.muscleGroup}</span><span>·</span><span style="text-transform:capitalize">${ex.equipment}</span><span>·</span><span style="text-transform:capitalize">${ex.mechanic}</span></div>`;
      btn.dataset.name = ex.name; listEl.appendChild(btn);
    });
  }
  searchEl.addEventListener('input', () => { currentQuery = searchEl.value; renderList(); });
  filterBtns.forEach((btn) => { btn.addEventListener('click', () => { filterBtns.forEach(b => { b.classList.remove('active'); b.style.cssText = ''; }); btn.classList.add('active'); activeFilter = btn.dataset.cat; renderList(); }); });
  overlay.querySelector('#replace-add-custom').addEventListener('click', () => { const customName = customEl.value.trim(); if (customName) { State.plan[ei].name = customName; persistSession(); overlay.remove(); const nameEl = document.querySelector(`#ex-card-${ei} .exercise-name`); if (nameEl) nameEl.textContent = customName; _haptic(15); Toast.show(`Replaced with ${customName}`, 'info'); } });
  listEl.addEventListener('click', (e) => { const btn = e.target.closest('[data-name]'); if (!btn) return; const name = btn.dataset.name.trim(); if (name) { State.plan[ei].name = name; persistSession(); overlay.remove(); const nameEl = document.querySelector(`#ex-card-${ei} .exercise-name`); if (nameEl) nameEl.textContent = name; _haptic(15); Toast.show(`Replaced with ${name}`, 'info'); } });
  overlay.querySelector('#replace-ex-close').addEventListener('click', () => overlay.remove()); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); }); requestAnimationFrame(() => searchEl.focus());
}

async function openCustomWorkoutModal() {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'custom-workout-overlay';
  const customWorkouts = getCustomWorkouts();
  overlay.innerHTML = `<div class="modal-sheet" style="max-height:85vh;display:flex;flex-direction:column"><div class="modal-handle"></div><div class="modal-header"><div class="modal-title">My Workouts</div><button class="btn-icon-sm" id="custom-wk-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="section-header" style="margin-bottom:var(--sp-1)"><span class="section-label">Your Custom Workouts</span><button class="btn-text" onclick="Workout._createNewCustomWorkout()" style="font-size:11px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New</button></div><div class="custom-workouts-list" id="custom-wk-list">${customWorkouts.length === 0 ? '<div class="plan-empty" style="padding:var(--sp-3)">No custom workouts yet. Create your first!</div>' : customWorkouts.map(w => `<div class="custom-workout-item" data-id="${w.id}"><div class="custom-workout-info"><div class="custom-workout-name">${w.name}</div><div class="custom-workout-meta">${w.exercises?.length || 0} exercises · ${w.type || 'custom'}</div></div><div class="custom-workout-actions"><button class="btn-icon-sm" onclick="Workout._editCustomWorkout('${w.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-icon-sm" onclick="Workout._deleteCustomWorkout('${w.id}')" style="color:var(--c-red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button><button class="btn btn-primary btn-sm" onclick="Workout._startCustomWorkout('${w.id}')" style="margin-left:auto">Start</button></div></div>`).join('')}</div><button class="btn btn-primary" style="margin-top:var(--sp-2)" onclick="Workout._closeCustomWorkoutModal()">Close</button></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#custom-wk-close').addEventListener('click', () => overlay.remove()); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function _createNewCustomWorkout() {
  const name = prompt('Enter workout name:'); if (!name) return;
  const type = prompt('Enter type (push/pull/legs/custom):', 'custom') || 'custom';
  const newWorkout = { id: 'custom-' + Date.now(), name, type, exercises: [] };
  await openExercisePickerModal(type, (exercise) => { newWorkout.exercises.push({ name: exercise.name, sets: 3, reps: 10, weight: 0 }); saveCustomWorkout(newWorkout); openCustomWorkoutModal(); });
}

async function _editCustomWorkout(id) {
  const workouts = getCustomWorkouts(); const workout = workouts.find(w => w.id === id); if (!workout) return;
  document.getElementById('custom-workout-overlay')?.remove();
  await openExercisePickerModal(workout.type || 'custom', (exercise) => { workout.exercises.push({ name: exercise.name, sets: 3, reps: 10, weight: 0 }); saveCustomWorkout(workout); openCustomWorkoutModal(); });
}

function _deleteCustomWorkout(id) { if (confirm('Delete this workout?')) { deleteCustomWorkout(id); openCustomWorkoutModal(); } }

function _startCustomWorkout(id) {
  const workouts = getCustomWorkouts(); const workout = workouts.find(w => w.id === id); if (!workout) return;
  State.type = workout.type || 'custom'; State.plan = workout.exercises.map(ex => ({ name: ex.name, sets: Array.from({ length: ex.sets || 3 }, () => ({ weight: ex.weight || 0, reps: ex.reps || 10, rpe: null, done: false, })), })); State.phase = 'active'; State.startedAt = Date.now();
  persistSession(); renderActive();
}

function _closeCustomWorkoutModal() { document.getElementById('custom-workout-overlay')?.remove(); }

function addSet(ei) {
  const ex = State.plan[ei]; const last = ex.sets[ex.sets.length - 1] || { weight: 0, reps: 10 };
  ex.sets.push({ weight: last.weight, reps: last.reps, rpe: null, done: false });
  const wrap = document.getElementById(`sets-wrap-${ei}`);
  if (wrap) { const headerRow = wrap.querySelector('.set-header-row').outerHTML; const addBtn = wrap.querySelector('.add-set-btn').outerHTML; const rows = ex.sets.map((s, si) => renderSetRow(ex, ei, s, si)).join(''); wrap.innerHTML = headerRow + rows + addBtn; }
  _updateLiveStats(); persistSession();
}

async function _updateLiveStats() {
  let setsDone = 0; let exDone = 0; const allSets = [];
  State.plan.forEach((ex) => { let allDone = true; ex.sets.forEach((s) => { allSets.push(s); if (s.done) { setsDone++; } else { allDone = false; } }); if (allDone && ex.sets.length) exDone++; });
  const { MathWorker } = await import('./utils/worker-client.js');
  const tonnage = await MathWorker.calcTonnage(allSets);
  const t = document.getElementById('live-tonnage'); const s = document.getElementById('live-sets-done'); const e = document.getElementById('live-ex-done');
  if (t) t.textContent = tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 'k' : Math.round(tonnage);
  if (s) s.textContent = setsDone; if (e) e.textContent = exDone;
}

async function completeSession() {
  Timer.pause(); const duration = Timer.seconds() * 1000; Timer.reset();
  if (window.Hardware) window.Hardware.releaseScreen();
  let tonnage = 0; State.plan.forEach((ex) => ex.sets.forEach((s) => { if (s.done) tonnage += s.weight * s.reps; }));
  const session = { type: State.type, timestamp: State.startedAt, duration, tonnage, exercises: State.plan.map((ex) => ({ name: ex.name, sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe, done: s.done, })), })), };
  await DB.Workouts.save(session); await DB.Events.log('workout_complete', { type: State.type, tonnage });
  const { SyncEngine } = await import('./sync.js'); SyncEngine.addToQueue('workout_complete', session);
  localStorage.removeItem(SESSION_KEY); localStorage.setItem('ap-last-workout-type', State.type);
  Toast.show(`Session saved — ${Math.round(tonnage)} kg`, 'success'); _stopRest();
  State.phase = 'select'; Nav.go('s-home');
}

function cancelSession() {
  _showConfirm('Cancel Session?', 'All progress for this workout will be lost. This cannot be undone.', 'Cancel Session', () => { Timer.reset(); _stopRest(); localStorage.removeItem(SESSION_KEY); State.phase = 'select'; if (window.Hardware) window.Hardware.releaseScreen(); renderSelect(); });
}

function _showConfirm(title, body, confirmLabel, onConfirm) {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.style.zIndex = '5000';
  overlay.innerHTML = `<div class="modal-sheet" style="padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))"><div class="modal-handle"></div><div style="text-align:center;padding:8px 0 20px;"><div style="font-size:17px;font-weight:800;color:var(--c-text-1);margin-bottom:10px;">${title}</div><div style="font-size:13px;color:var(--c-text-2);line-height:1.5;">${body}</div></div><div style="display:flex;flex-direction:column;gap:8px;"><button class="btn btn-ghost" id="wk-confirm-ok" style="border-color:rgba(255,71,87,0.3);color:var(--c-red)">${confirmLabel}</button><button class="btn btn-primary" id="wk-confirm-cancel">Keep Training</button></div></div>`;
  document.body.appendChild(overlay); requestAnimationFrame(() => overlay.classList.add('visible'));
  const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 300); };
  overlay.querySelector('#wk-confirm-ok').addEventListener('click', () => { close(); onConfirm(); }); overlay.querySelector('#wk-confirm-cancel').addEventListener('click', close); overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function _initDrag() {
  const list = document.getElementById('exercise-list'); if (!list) return;
  list.querySelectorAll('.exercise-card').forEach((card) => {
    const handle = card.querySelector('.drag-handle'); if (!handle) return;
    let dragging = false; let startY = 0; let srcIdx = parseInt(card.dataset.ei);
    handle.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dragging = true; startY = e.clientY; handle.setPointerCapture(e.pointerId); card.classList.add('ex-dragging'); _haptic(15); });
    handle.addEventListener('pointermove', (e) => { if (!dragging) return; const dy = e.clientY - startY; card.style.transform = `translateY(${dy}px)`; card.style.zIndex = '50'; list.querySelectorAll('.exercise-card').forEach((other) => { if (other === card) return; const rect = other.getBoundingClientRect(); const inZone = e.clientY >= rect.top && e.clientY <= rect.bottom; other.classList.toggle('ex-drag-over', inZone); }); });
    handle.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; card.style.transform = ''; card.style.zIndex = ''; card.classList.remove('ex-dragging'); let dropIdx = srcIdx; list.querySelectorAll('.exercise-card').forEach((other) => { if (other.classList.contains('ex-drag-over')) { dropIdx = parseInt(other.dataset.ei); other.classList.remove('ex-drag-over'); } }); if (dropIdx !== srcIdx) { const moved = State.plan.splice(srcIdx, 1)[0]; State.plan.splice(dropIdx, 0, moved); persistSession(); const scrollY = document.getElementById('s-train').scrollTop; renderActive(); requestAnimationFrame(() => { const s = document.getElementById('s-train'); if (s) s.scrollTop = scrollY; }); } });
  });
}

function _initPlanDrag() {
  const list = document.getElementById('plan-list'); if (!list) return;
  list.querySelectorAll('.plan-row').forEach((row) => {
    const handle = row.querySelector('.plan-drag-handle'); if (!handle) return;
    let dragging = false; let startY = 0; let srcIdx = parseInt(row.dataset.pi);
    handle.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dragging = true; startY = e.clientY; handle.setPointerCapture(e.pointerId); row.classList.add('plan-row-dragging'); _haptic(15); });
    handle.addEventListener('pointermove', (e) => { if (!dragging) return; const dy = e.clientY - startY; row.style.transform = `translateY(${dy}px)`; row.style.zIndex = '50'; list.querySelectorAll('.plan-row').forEach((other) => { if (other === row) return; const rect = other.getBoundingClientRect(); other.classList.toggle('plan-row-over', e.clientY >= rect.top && e.clientY <= rect.bottom); }); });
    handle.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; row.style.transform = ''; row.style.zIndex = ''; row.classList.remove('plan-row-dragging'); let dropIdx = srcIdx; list.querySelectorAll('.plan-row').forEach((other) => { if (other.classList.contains('plan-row-over')) { dropIdx = parseInt(other.dataset.pi); other.classList.remove('plan-row-over'); } }); if (dropIdx !== srcIdx) { const type = _planEditorActiveTab(); const p = loadPlan(); const moved = p[type].splice(srcIdx, 1)[0]; p[type].splice(dropIdx, 0, moved); savePlan(p); _switchPlanTab(type); } });
  });
}

function _haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }

async function init() {
  const restored = tryRestoreSession();
  if (restored) {
    Timer.restore(); Timer.start((sec) => { const el = document.getElementById('session-timer-val'); if (el) el.textContent = Timer.format(sec); });
    renderActive(); window.Toast?.show('Session restored', 'info'); return true;
  }
  renderSelect(); return false;
}

export const Workout = { init, renderSelect, renderActive, selectType, openPlanEditor, openCustomWorkoutModal, _closePlanEditor, _savePlanAndClose, _switchPlanTab, _setPlanSearch, _updatePlanName, _adjustPlan, _addPlanEx, _deletePlanEx, _createNewCustomWorkout, _editCustomWorkout, _deleteCustomWorkout, _startCustomWorkout, _closeCustomWorkoutModal, toggleChecklist, stepWeight, stepReps, editVal, commitVal, setRPE, toggleSet, toggleCard, addSet, completeSession, cancelSession, openReplaceExModal };
