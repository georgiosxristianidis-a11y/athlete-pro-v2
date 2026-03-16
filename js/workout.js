/* ════════════════════════════════════════════════════════
   workout.js — Athlete Pro  |  Block 4
   Workout Engine: plan editor, set rows, RPE, timer sync
   ════════════════════════════════════════════════════════ */

'use strict';

const Workout = (() => {
  /* ══════════════════════════════════════════════
     DEFAULT PPL PROGRAM
     ══════════════════════════════════════════════ */
  const DEFAULT_PLAN = {
    push: [
      // Chest ×3
      { name: 'Bench Press', sets: 4, reps: 8, weight: 80 },
      { name: 'Incline DB Press', sets: 3, reps: 12, weight: 30 },
      { name: 'Cable Fly', sets: 3, reps: 15, weight: 20 },
      // Shoulders ×2
      { name: 'Overhead Press', sets: 3, reps: 10, weight: 50 },
      { name: 'Lateral Raise', sets: 3, reps: 15, weight: 12 },
      // Arms / Triceps ×2
      { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: 25 },
      { name: 'Overhead Tricep Ext.', sets: 3, reps: 12, weight: 20 },
    ],
    pull: [
      // Back ×4
      { name: 'Deadlift', sets: 4, reps: 5, weight: 120 },
      { name: 'Pull-up', sets: 3, reps: 8, weight: 0 },
      { name: 'Barbell Row', sets: 3, reps: 10, weight: 70 },
      { name: 'Cable Row', sets: 3, reps: 12, weight: 55 },
      { name: 'Face Pull', sets: 3, reps: 15, weight: 20 },
      // Arms / Biceps ×2
      { name: 'Bicep Curl', sets: 3, reps: 12, weight: 18 },
      { name: 'Hammer Curl', sets: 3, reps: 12, weight: 16 },
    ],
    legs: [
      // Legs ×6
      { name: 'Squat', sets: 4, reps: 6, weight: 100 },
      { name: 'Romanian Deadlift', sets: 3, reps: 10, weight: 80 },
      { name: 'Leg Press', sets: 3, reps: 12, weight: 140 },
      { name: 'Walking Lunge', sets: 3, reps: 12, weight: 20 },
      { name: 'Leg Curl', sets: 3, reps: 12, weight: 40 },
      { name: 'Calf Raise', sets: 4, reps: 15, weight: 60 },
      // Core ×2
      { name: 'Plank', sets: 3, reps: 60, weight: 0 },
      { name: 'Hanging Leg Raise', sets: 3, reps: 12, weight: 0 },
    ],
  };

  /* ══════════════════════════════════════════════
     STATE
     ══════════════════════════════════════════════ */
  let State = {
    phase: 'select', // select | active | done
    type: null, // push | pull | legs
    plan: [], // [{name, sets:[{weight,reps,rpe,done}]}]
    startedAt: null,
    stepDebounce: {},
  };

  const SESSION_KEY = 'ap-active-session';
  const PLAN_KEY = 'ap-custom-plan';

  /* ══════════════════════════════════════════════
     EXERCISE LIBRARY
     ══════════════════════════════════════════════ */
  const EXERCISE_LIBRARY = [
    // Push — Chest
    'Bench Press',
    'Incline Bench Press',
    'Decline Bench Press',
    'Incline DB Press',
    'DB Fly',
    'Cable Fly',
    'Pec Deck',
    'Machine Chest Press',
    // Push — Shoulders
    'Overhead Press',
    'DB Shoulder Press',
    'Arnold Press',
    'Lateral Raise',
    'Front Raise',
    'Cable Lateral Raise',
    'Upright Row',
    // Push — Triceps
    'Tricep Pushdown',
    'Overhead Tricep Ext.',
    'Skull Crusher',
    'Tricep Dip',
    'Close-Grip Bench',
    'Cable Overhead Ext.',
    // Pull — Back
    'Deadlift',
    'Romanian Deadlift',
    'Stiff-Leg Deadlift',
    'Pull-up',
    'Chin-up',
    'Lat Pulldown',
    'Barbell Row',
    'DB Row',
    'Cable Row',
    'T-Bar Row',
    'Seal Row',
    'Meadows Row',
    // Pull — Rear delt / traps
    'Face Pull',
    'Rear Delt Fly',
    'Shrug',
    'Cable Shrug',
    // Pull — Biceps
    'Bicep Curl',
    'Hammer Curl',
    'Preacher Curl',
    'Cable Curl',
    'Incline DB Curl',
    'Concentration Curl',
    'Spider Curl',
    // Legs
    'Squat',
    'Front Squat',
    'Hack Squat',
    'Smith Machine Squat',
    'Leg Press',
    'Bulgarian Split Squat',
    'Walking Lunge',
    'Step-Up',
    'Romanian Deadlift',
    'Sumo Deadlift',
    'Leg Curl',
    'Leg Extension',
    'Calf Raise',
    'Seated Calf Raise',
    'Hip Thrust',
    'Glute Bridge',
    // Core
    'Plank',
    'Side Plank',
    'Hanging Leg Raise',
    'Cable Crunch',
    'Russian Twist',
    'Ab Wheel',
    'Decline Crunch',
    'Mountain Climber',
    'Dragon Flag',
    'Toes-to-Bar',
  ].sort();

  /* ══════════════════════════════════════════════
     PLAN: load / save custom
     ══════════════════════════════════════════════ */
  function loadPlan() {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_PLAN));
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_PLAN));
    }
  }

  function savePlan(plan) {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  }

  /* ══════════════════════════════════════════════
     BUILD active session exercises from plan
     ══════════════════════════════════════════════ */
  function buildSession(type) {
    const plan = loadPlan();
    return (plan[type] || []).map((ex) => ({
      name: ex.name,
      sets: Array.from({ length: ex.sets }, () => ({
        weight: ex.weight,
        reps: ex.reps,
        rpe: null,
        done: false,
      })),
    }));
  }

  /* ══════════════════════════════════════════════
     RENDER HELPERS
     ══════════════════════════════════════════════ */
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
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      style="pointer-events:none">${p[dir]}</svg>`;
  }

  function fmtVol(kg) {
    return kg >= 1000 ? (kg / 1000).toFixed(1) + 'k' : Math.round(kg).toString();
  }

  /* ══════════════════════════════════════════════
     PHASE 1 — SELECT TYPE
     ══════════════════════════════════════════════ */
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

      <!-- Type selector -->
      <div class="section-header" style="margin-bottom:var(--sp-1)">
        <span class="section-label">Select Type</span>
        <button class="btn-text" onclick="Workout.openPlanEditor()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
               width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Edit Plan
        </button>
      </div>

      <div class="type-grid">
        ${['push', 'pull', 'legs']
          .map(
            (t) => `
          <button class="type-card" data-type="${t}"
                  onclick="Workout.selectType('${t}')">
            <div class="type-card-icon" style="background:${t === 'push' ? 'var(--c-accent-bg)' : t === 'pull' ? 'var(--c-purple-bg)' : 'var(--c-blue-bg)'}">
              ${typeIcon(t, t === 'push' ? 'var(--c-accent)' : t === 'pull' ? 'var(--c-purple)' : 'var(--c-blue)')}
            </div>
            <div class="type-card-name">${t.charAt(0).toUpperCase() + t.slice(1)}</div>
            <div class="type-card-meta">${(plan[t] || []).length} exercises</div>
          </button>`
          )
          .join('')}
      </div>

      <!-- Last sessions preview -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Last Sessions</span>
      </div>
      <div id="last-sessions-preview">
        <div style="text-align:center;padding:var(--sp-3);color:var(--c-text-3);font-size:12px">Loading...</div>
      </div>
    `;

    document.getElementById('train-date').textContent = new Date().toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    // Load last 3 sessions
    DB.Workouts.getLast(3).then((list) => {
      const el = document.getElementById('last-sessions-preview');
      if (!el) return;
      if (!list.length) {
        el.innerHTML = `<div class="empty-state" style="padding:var(--sp-3)">
          <div class="empty-title" style="font-size:13px">No sessions yet</div>
        </div>`;
        return;
      }
      el.innerHTML = list
        .map((w) => {
          const dot = TYPE_COLOR[w.type] || 'var(--c-text-3)';
          const date = new Date(w.timestamp).toLocaleDateString('en', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          const dur = w.duration ? Timer.fmt(Math.round(w.duration / 1000)) : '--';
          return `<div class="session-item">
          <div class="session-dot" style="background:${dot}"></div>
          <div class="session-info">
            <div class="session-title">${w.type.charAt(0).toUpperCase() + w.type.slice(1)} Day</div>
            <div class="session-meta">${date} · ${dur}</div>
          </div>
          <div class="session-vol">${fmtVol(w.tonnage)} kg</div>
        </div>`;
        })
        .join('');
    });
  }

  function typeIcon(type, color) {
    const icons = {
      push: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5"
               stroke-linecap="round" width="20" height="20">
               <path d="M5 12H3M21 12h-2M12 3V5M12 19v2"/>
               <circle cx="12" cy="12" r="4"/>
             </svg>`,
      pull: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5"
               stroke-linecap="round" width="20" height="20">
               <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
               <path d="M9 12h6M12 9l3 3-3 3"/>
             </svg>`,
      legs: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5"
               stroke-linecap="round" width="20" height="20">
               <path d="M8 3s0 5-2 9-3 8-2 10M13 3s1 5 1 9-1 8 0 10M8 12c2 0 4 0 5 3"/>
             </svg>`,
    };
    return icons[type] || '';
  }

  /* ══════════════════════════════════════════════
     PLAN EDITOR MODAL
     ══════════════════════════════════════════════ */
  function openPlanEditor() {
    const plan = loadPlan();
    let activeTab = 'push';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'plan-editor-overlay';

    function tabContent(type) {
      return (
        plan[type]
          .map(
            (ex, i) => `
        <div class="plan-row" id="plan-row-${type}-${i}">
          <input class="plan-input" value="${ex.name}"
            onchange="Workout._updatePlanName('${type}',${i},this.value)">
          <div class="plan-row-meta">
            <span class="plan-meta-label">Sets</span>
            <div class="mini-stepper">
              <button onclick="Workout._adjustPlan('${type}',${i},'sets',-1)">${svgArrow('minus')}</button>
              <span id="ps-sets-${type}-${i}">${ex.sets}</span>
              <button onclick="Workout._adjustPlan('${type}',${i},'sets',1)">${svgArrow('plus')}</button>
            </div>
            <span class="plan-meta-label">Reps</span>
            <div class="mini-stepper">
              <button onclick="Workout._adjustPlan('${type}',${i},'reps',-1)">${svgArrow('minus')}</button>
              <span id="ps-reps-${type}-${i}">${ex.reps}</span>
              <button onclick="Workout._adjustPlan('${type}',${i},'reps',1)">${svgArrow('plus')}</button>
            </div>
            <button class="plan-delete" onclick="Workout._deletePlanEx('${type}',${i})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>`
          )
          .join('') +
        `<button class="btn-add-ex" onclick="Workout._addPlanEx('${type}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Exercise
        </button>`
      );
    }

    function render() {
      overlay.innerHTML = `
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <div class="modal-title">Edit Plan</div>
            <button class="btn-icon-sm" onclick="Workout._closePlanEditor()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" width="18" height="18">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="plan-tabs">
            ${['push', 'pull', 'legs']
              .map(
                (t) => `
              <button class="plan-tab ${t === activeTab ? 'active' : ''}"
                      onclick="Workout._switchPlanTab('${t}')"
                      style="${t === activeTab ? 'color:' + TYPE_COLOR[t] + ';border-color:' + TYPE_COLOR[t] : ''}">
                ${t.charAt(0).toUpperCase() + t.slice(1)}
              </button>`
              )
              .join('')}
          </div>
          <div class="plan-list" id="plan-list">
            ${tabContent(activeTab)}
          </div>
          <button class="btn btn-primary" style="margin-top:var(--sp-2)"
                  onclick="Workout._savePlanAndClose()">
            Save Plan
          </button>
        </div>`;
    }

    render();
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _closePlanEditor();
    });

    // Expose tab switch
    window._planEditorActiveTab = () => activeTab;
    window._planEditorSetTab = (t) => {
      activeTab = t;
      render();
    };
  }

  function _switchPlanTab(type) {
    window._planEditorSetTab(type);
  }

  function _closePlanEditor() {
    const el = document.getElementById('plan-editor-overlay');
    if (el) el.remove();
  }

  function _savePlanAndClose() {
    _closePlanEditor();
    Toast.show('Plan saved', 'success');
  }

  function _updatePlanName(type, i, val) {
    const plan = loadPlan();
    plan[type][i].name = val.trim() || plan[type][i].name;
    savePlan(plan);
  }

  function _adjustPlan(type, i, field, delta) {
    const plan = loadPlan();
    const min = field === 'sets' ? 1 : 1;
    plan[type][i][field] = Math.max(min, plan[type][i][field] + delta);
    savePlan(plan);
    const el = document.getElementById(`ps-${field}-${type}-${i}`);
    if (el) el.textContent = plan[type][i][field];
  }

  function _addPlanEx(type) {
    const plan = loadPlan();
    plan[type].push({ name: 'New Exercise', sets: 3, reps: 10, weight: 0 });
    savePlan(plan);
    const el = document.getElementById('plan-list');
    if (el) el.innerHTML = '';
    _switchPlanTab(type);
  }

  function _deletePlanEx(type, i) {
    const plan = loadPlan();
    plan[type].splice(i, 1);
    savePlan(plan);
    _switchPlanTab(window._planEditorActiveTab());
  }

  /* ══════════════════════════════════════════════
     PHASE 2 — ACTIVE WORKOUT
     ══════════════════════════════════════════════ */
  function selectType(type) {
    State.type = type;
    State.plan = buildSession(type);
    State.phase = 'active';
    State.startedAt = Date.now();

    // Autosave session to localStorage
    _persistSession();

    Timer.start((s) => {
      const el = document.getElementById('session-timer-val');
      if (el) el.textContent = Timer.fmt(s);
    });

    renderActive();
  }

  function renderActive() {
    const color = TYPE_COLOR[State.type];
    const exCount = State.plan.length;
    const totalSets = State.plan.reduce((s, e) => s + e.sets.length, 0);

    document.getElementById('s-train').innerHTML = `

      <!-- Header -->
      <div class="screen-header">
        <div>
          <div class="screen-title">${State.type.charAt(0).toUpperCase() + State.type.slice(1)} Day</div>
          <div class="screen-sub">${exCount} exercises · ${totalSets} sets</div>
        </div>
        <div class="session-timer-chip" style="border-color:${color}20">
          <div class="session-timer-dot" style="background:${color}"></div>
          <span id="session-timer-val" style="color:${color}">00:00</span>
        </div>
      </div>

      <!-- Live stats bar -->
      <div class="live-bar">
        <div class="live-stat">
          <span class="live-val" id="live-tonnage">0</span>
          <span class="live-lbl">kg</span>
        </div>
        <div class="live-divider"></div>
        <div class="live-stat">
          <span class="live-val" id="live-sets-done">0</span>
          <span class="live-lbl">/ ${totalSets} sets</span>
        </div>
        <div class="live-divider"></div>
        <div class="live-stat">
          <span class="live-val" id="live-ex-done">0</span>
          <span class="live-lbl">/ ${exCount} ex</span>
        </div>
      </div>

      <!-- Rest timer -->
      <div id="rest-timer-wrap" style="display:none">
        <div class="rest-header">
          <span class="section-label">Rest</span>
          <span id="rest-val" style="color:var(--c-accent);font-weight:700;font-size:13px">90s</span>
        </div>
        <div class="rest-track"><div class="rest-fill" id="rest-fill"></div></div>
      </div>

      <!-- Exercise list -->
      <div id="exercise-list">
        ${State.plan.map((ex, ei) => renderExerciseCard(ex, ei)).join('')}
      </div>

      <!-- Complete / Cancel -->
      <div style="display:flex;flex-direction:column;gap:var(--sp-1);margin-top:var(--sp-2)">
        <button class="btn btn-primary" onclick="Workout.completeSession()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" width="18" height="18">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Complete Session
        </button>
        <button class="btn btn-ghost" onclick="Workout.cancelSession()">
          Cancel
        </button>
      </div>
      <div style="height:var(--sp-2)"></div>
    `;

    requestAnimationFrame(_initDrag);
  }

  function renderExerciseCard(ex, ei) {
    const doneSets = ex.sets.filter((s) => s.done).length;
    return `
      <div class="exercise-card" id="ex-card-${ei}" data-ei="${ei}">
        <div class="exercise-header" onclick="Workout.toggleCard(${ei})">
          <div class="drag-handle" onclick="event.stopPropagation()">
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <circle cx="5" cy="4"  r="1.5"/><circle cx="11" cy="4"  r="1.5"/>
              <circle cx="5" cy="8"  r="1.5"/><circle cx="11" cy="8"  r="1.5"/>
              <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
            </svg>
          </div>
          <div class="exercise-icon">
            <span class="ex-num">${ei + 1}</span>
          </div>
          <div class="exercise-info">
            <div class="exercise-name">${ex.name}</div>
            <div class="exercise-meta">${ex.sets.length} sets
              <span id="ex-done-count-${ei}" style="color:var(--c-accent)">
                ${doneSets > 0 ? ' · ' + doneSets + ' done' : ''}
              </span>
            </div>
          </div>
          <button class="ex-replace-btn" title="Replace exercise"
                  onclick="event.stopPropagation();Workout.openReplaceExModal(${ei})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                 width="15" height="15">
              <path d="M17 1l4 4-4 4"/>
              <path d="M3 11V9a4 4 0 014-4h14"/>
              <path d="M7 23l-4-4 4-4"/>
              <path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
          </button>
          <div class="exercise-chevron" id="ex-chevron-${ei}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" width="16" height="16">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
        <div class="sets-wrap" id="sets-wrap-${ei}">
          <!-- Column headers -->
          <div class="set-header-row">
            <span style="width:20px"></span>
            <span class="set-col-label">Weight kg</span>
            <span class="set-col-label">Reps</span>
            <span class="set-col-label">RPE</span>
            <span style="width:40px"></span>
          </div>
          ${ex.sets.map((set, si) => renderSetRow(ex, ei, set, si)).join('')}
          <button class="add-set-btn" onclick="Workout.addSet(${ei})">
            ${svgArrow('plus')} Add Set
          </button>
        </div>
      </div>`;
  }

  function renderSetRow(ex, ei, set, si) {
    const prevWeight = set.weight;
    const prevReps = set.reps;
    return `
      <div class="set-row ${set.done ? 'set-done' : ''}" id="set-row-${ei}-${si}">
        <span class="set-num">${si + 1}</span>

        <!-- Weight stepper -->
        <div class="stepper" id="sw-${ei}-${si}">
          <button class="stepper-btn ${set.weight <= 0 ? 'at-min' : ''}"
            ontouchstart="Workout.stepWeight(${ei},${si},-2.5);event.preventDefault()"
            onclick="Workout.stepWeight(${ei},${si},-2.5)">
            ${svgArrow('minus')}
          </button>
          <span class="stepper-val" id="swv-${ei}-${si}"
            ondblclick="Workout.editVal('w',${ei},${si})">${set.weight}</span>
          <input class="stepper-input" id="swi-${ei}-${si}"
            type="number" inputmode="decimal" step="2.5"
            value="${set.weight}"
            onblur="Workout.commitVal('w',${ei},${si})"
            onkeydown="if(event.key==='Enter')this.blur()">
          <button class="stepper-btn"
            ontouchstart="Workout.stepWeight(${ei},${si},2.5);event.preventDefault()"
            onclick="Workout.stepWeight(${ei},${si},2.5)">
            ${svgArrow('plus')}
          </button>
        </div>

        <!-- Reps stepper -->
        <div class="stepper" id="sr-${ei}-${si}">
          <button class="stepper-btn ${set.reps <= 1 ? 'at-min' : ''}"
            ontouchstart="Workout.stepReps(${ei},${si},-1);event.preventDefault()"
            onclick="Workout.stepReps(${ei},${si},-1)">
            ${svgArrow('down')}
          </button>
          <span class="stepper-val" id="srv-${ei}-${si}"
            ondblclick="Workout.editVal('r',${ei},${si})">${set.reps}</span>
          <input class="stepper-input" id="sri-${ei}-${si}"
            type="number" inputmode="numeric" step="1"
            value="${set.reps}"
            onblur="Workout.commitVal('r',${ei},${si})"
            onkeydown="if(event.key==='Enter')this.blur()">
          <button class="stepper-btn"
            ontouchstart="Workout.stepReps(${ei},${si},1);event.preventDefault()"
            onclick="Workout.stepReps(${ei},${si},1)">
            ${svgArrow('up')}
          </button>
        </div>

        <!-- RPE -->
        <div class="rpe-row" id="rpe-${ei}-${si}">
          ${[6, 7, 8, 9, 10]
            .map(
              (v) => `
            <button class="rpe-btn ${set.rpe === v ? 'rpe-active' : ''}"
                    data-val="${v}"
                    onclick="Workout.setRPE(${ei},${si},${v})">${v}</button>
          `
            )
            .join('')}
        </div>

        <!-- Done check -->
        <button class="set-check ${set.done ? 'done' : ''}" id="chk-${ei}-${si}"
                onclick="Workout.toggleSet(${ei},${si})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" width="16" height="16">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>`;
  }

  /* ══════════════════════════════════════════════
     STEPPER — weight / reps
     ══════════════════════════════════════════════ */
  function stepWeight(ei, si, delta) {
    const key = `w-${ei}-${si}`;
    const now = Date.now();
    if (State.stepDebounce[key] && now - State.stepDebounce[key] < 250) return;
    State.stepDebounce[key] = now;
    _haptic(10);
    const set = State.plan[ei].sets[si];
    set.weight = Math.max(0, Math.round((set.weight + delta) * 10) / 10);
    _updateStepperUI('w', ei, si, set.weight, set.weight <= 0);
    _updateLiveStats();
    _persistSession();
  }

  function stepReps(ei, si, delta) {
    const key = `r-${ei}-${si}`;
    const now = Date.now();
    if (State.stepDebounce[key] && now - State.stepDebounce[key] < 250) return;
    State.stepDebounce[key] = now;
    _haptic(10);
    const set = State.plan[ei].sets[si];
    set.reps = Math.max(1, set.reps + delta);
    _updateStepperUI('r', ei, si, set.reps, set.reps <= 1);
    _updateLiveStats();
    _persistSession();
  }

  function _updateStepperUI(type, ei, si, val, atMin) {
    const prefix = type === 'w' ? 'sw' : 'sr';
    const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
    const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
    const minBtn = document.querySelector(`#${prefix}-${ei}-${si} .stepper-btn:first-child`);
    if (valEl) valEl.textContent = val;
    if (inpEl) inpEl.value = val;
    if (minBtn) minBtn.classList.toggle('at-min', atMin);
  }

  function editVal(type, ei, si) {
    const prefix = type === 'w' ? 'sw' : 'sr';
    const valEl = document.getElementById(`${prefix}v-${ei}-${si}`);
    const inpEl = document.getElementById(`${prefix}i-${ei}-${si}`);
    if (!valEl || !inpEl) return;
    valEl.classList.add('hidden');
    inpEl.classList.add('active');
    inpEl.focus();
    inpEl.select();
  }

  function commitVal(type, ei, si) {
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
    _persistSession();
  }

  /* ══════════════════════════════════════════════
     RPE
     ══════════════════════════════════════════════ */
  function setRPE(ei, si, val) {
    _haptic(8);
    const set = State.plan[ei].sets[si];
    set.rpe = set.rpe === val ? null : val; // toggle off
    const row = document.getElementById(`rpe-${ei}-${si}`);
    if (!row) return;
    row.querySelectorAll('.rpe-btn').forEach((btn) => {
      const v = parseInt(btn.dataset.val);
      btn.classList.toggle('rpe-active', v === set.rpe);
    });
  }

  /* ══════════════════════════════════════════════
     TOGGLE SET DONE + REST TIMER
     ══════════════════════════════════════════════ */
  let _restInterval = null;
  let _restDuration = 90;

  function toggleSet(ei, si) {
    _haptic(15);
    const set = State.plan[ei].sets[si];
    set.done = !set.done;

    const row = document.getElementById(`set-row-${ei}-${si}`);
    const chk = document.getElementById(`chk-${ei}-${si}`);
    if (row) row.classList.toggle('set-done', set.done);
    if (chk) chk.classList.toggle('done', set.done);

    // Update exercise done count
    const doneSets = State.plan[ei].sets.filter((s) => s.done).length;
    const countEl = document.getElementById(`ex-done-count-${ei}`);
    if (countEl) countEl.textContent = doneSets > 0 ? ` · ${doneSets} done` : '';

    // Update 1RM if set done
    if (set.done && set.weight > 0 && set.reps > 0) {
      DB.OneRM.update(State.plan[ei].name, set.weight, set.reps);
    }

    _updateLiveStats();
    _persistSession();

    if (set.done) _startRest(_restDuration);
    else _stopRest();
  }

  function _startRest(seconds) {
    const wrap = document.getElementById('rest-timer-wrap');
    if (!wrap) return;
    wrap.style.display = 'block';
    let remaining = seconds;
    const valEl = document.getElementById('rest-val');
    const fillEl = document.getElementById('rest-fill');

    clearInterval(_restInterval);
    _restInterval = setInterval(() => {
      remaining--;
      if (valEl) valEl.textContent = remaining + 's';
      if (fillEl) fillEl.style.width = (remaining / seconds) * 100 + '%';
      if (remaining <= 0) {
        _stopRest();
        _haptic(40);
        Toast.show('Rest complete — next set!', 'info');
      }
    }, 1000);

    if (valEl) valEl.textContent = seconds + 's';
    if (fillEl) fillEl.style.width = '100%';
  }

  function _stopRest() {
    clearInterval(_restInterval);
    const wrap = document.getElementById('rest-timer-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  /* ══════════════════════════════════════════════
     CARD TOGGLE
     ══════════════════════════════════════════════ */
  function toggleCard(ei) {
    const wrap = document.getElementById(`sets-wrap-${ei}`);
    const chevron = document.getElementById(`ex-chevron-${ei}`);
    if (!wrap) return;
    const open = wrap.style.display !== 'none';
    wrap.style.display = open ? 'none' : 'block';
    if (chevron) chevron.style.transform = open ? 'rotate(-90deg)' : 'rotate(0)';
  }

  /* ══════════════════════════════════════════════
     REPLACE EXERCISE MODAL
     ══════════════════════════════════════════════ */
  function openReplaceExModal(ei) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'replace-ex-overlay';

    overlay.innerHTML = `
      <div class="modal-sheet" style="max-height:82vh;display:flex;flex-direction:column">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div class="modal-title">Replace Exercise</div>
          <button class="btn-icon-sm" id="replace-ex-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="add-ex-search-wrap">
          <input class="add-ex-search" id="replace-ex-search"
                 type="text" placeholder="Search or type a custom name…"
                 autocomplete="off" autocorrect="off" spellcheck="false">
        </div>
        <div class="add-ex-list" id="replace-ex-list"></div>
      </div>`;

    document.body.appendChild(overlay);

    const searchEl = overlay.querySelector('#replace-ex-search');
    const listEl = overlay.querySelector('#replace-ex-list');

    function renderList(query) {
      const q = query.trim();
      const ql = q.toLowerCase();
      const matches = ql
        ? EXERCISE_LIBRARY.filter((e) => e.toLowerCase().includes(ql))
        : EXERCISE_LIBRARY;

      listEl.innerHTML = '';

      // "Use custom" item when typed text isn't exact match in library
      if (q && !EXERCISE_LIBRARY.some((e) => e.toLowerCase() === ql)) {
        const btn = document.createElement('button');
        btn.className = 'add-ex-item';
        btn.style.cssText = 'border-color:rgba(0,230,118,0.35);color:var(--c-accent)';
        btn.textContent = `+ Use "${q}"`;
        btn.dataset.name = q;
        listEl.appendChild(btn);
      }

      matches.slice(0, 40).forEach((name) => {
        const btn = document.createElement('button');
        btn.className = 'add-ex-item';
        btn.textContent = name;
        btn.dataset.name = name;
        listEl.appendChild(btn);
      });

      if (!matches.length && !q) return;
      if (!matches.length) {
        const msg = document.createElement('div');
        msg.className = 'add-ex-empty';
        msg.textContent = 'No exercises found';
        listEl.appendChild(msg);
      }
    }

    renderList('');
    searchEl.addEventListener('input', () => renderList(searchEl.value));

    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-name]');
      if (!btn) return;
      const name = btn.dataset.name.trim();
      if (!name) return;
      State.plan[ei].name = name;
      _persistSession();
      overlay.remove();
      const nameEl = document.querySelector(`#ex-card-${ei} .exercise-name`);
      if (nameEl) nameEl.textContent = name;
      _haptic(15);
      Toast.show(`Replaced with ${name}`, 'info');
    });

    overlay.querySelector('#replace-ex-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    requestAnimationFrame(() => searchEl.focus());
  }

  /* ══════════════════════════════════════════════
     ADD SET
     ══════════════════════════════════════════════ */
  function addSet(ei) {
    const ex = State.plan[ei];
    const last = ex.sets[ex.sets.length - 1] || { weight: 0, reps: 10 };
    ex.sets.push({ weight: last.weight, reps: last.reps, rpe: null, done: false });
    // Re-render just the sets-wrap
    const wrap = document.getElementById(`sets-wrap-${ei}`);
    if (wrap) {
      const headerRow = wrap.querySelector('.set-header-row').outerHTML;
      const addBtn = wrap.querySelector('.add-set-btn').outerHTML;
      const rows = ex.sets.map((s, si) => renderSetRow(ex, ei, s, si)).join('');
      wrap.innerHTML = headerRow + rows + addBtn;
    }
    _updateLiveStats();
    _persistSession();
  }

  /* ══════════════════════════════════════════════
     LIVE STATS
     ══════════════════════════════════════════════ */
  function _updateLiveStats() {
    let tonnage = 0;
    let setsDone = 0;
    let exDone = 0;

    State.plan.forEach((ex) => {
      let allDone = true;
      ex.sets.forEach((s) => {
        if (s.done) {
          tonnage += s.weight * s.reps;
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

  /* ══════════════════════════════════════════════
     COMPLETE SESSION
     ══════════════════════════════════════════════ */
  async function completeSession() {
    Timer.pause();
    const duration = Timer.seconds() * 1000;
    Timer.reset();

    let tonnage = 0;
    State.plan.forEach((ex) =>
      ex.sets.forEach((s) => {
        if (s.done) tonnage += s.weight * s.reps;
      })
    );

    const session = {
      type: State.type,
      timestamp: State.startedAt,
      duration,
      tonnage,
      exercises: State.plan.map((ex) => ({
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
    await DB.Events.log('workout_complete', { type: State.type, tonnage });
    localStorage.removeItem(SESSION_KEY);

    Toast.show(`Session saved — ${Math.round(tonnage)} kg`, 'success');
    _stopRest();

    // Back to home
    State.phase = 'select';
    Nav.go('s-home');
  }

  /* ══════════════════════════════════════════════
     CANCEL SESSION
     ══════════════════════════════════════════════ */
  function cancelSession() {
    _showConfirm(
      '⚠ Cancel Session?',
      'All progress for this workout will be lost. This cannot be undone.',
      'Cancel Session',
      () => {
        Timer.reset();
        _stopRest();
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

  /* ══════════════════════════════════════════════
     PERSIST / RESTORE SESSION
     ══════════════════════════════════════════════ */
  function _persistSession() {
    if (State.phase !== 'active') return;
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        type: State.type,
        plan: State.plan,
        startedAt: State.startedAt,
        savedAt: Date.now(),
      })
    );
  }

  function tryRestoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      // Only restore if saved < 4 hours ago
      if (Date.now() - s.savedAt > 4 * 3600000) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      State.type = s.type;
      State.plan = s.plan;
      State.startedAt = s.startedAt;
      State.phase = 'active';

      Timer.restore();
      Timer.start((sec) => {
        const el = document.getElementById('session-timer-val');
        if (el) el.textContent = Timer.fmt(sec);
      });

      renderActive();
      Nav.go('s-train');
      Toast.show('Session restored', 'info');
      return true;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  }

  /* ══════════════════════════════════════════════
     DRAG-AND-DROP REORDER (pointer events: desktop + mobile)
     ══════════════════════════════════════════════ */
  function _initDrag() {
    const list = document.getElementById('exercise-list');
    if (!list) return;

    list.querySelectorAll('.exercise-card').forEach((card) => {
      const handle = card.querySelector('.drag-handle');
      if (!handle) return;

      let dragging = false;
      let startY = 0;
      let srcIdx = parseInt(card.dataset.ei);

      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        startY = e.clientY;
        handle.setPointerCapture(e.pointerId);
        card.classList.add('ex-dragging');
        _haptic(15);
      });

      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        card.style.transform = `translateY(${dy}px)`;
        card.style.zIndex = '50';

        list.querySelectorAll('.exercise-card').forEach((other) => {
          if (other === card) return;
          const rect = other.getBoundingClientRect();
          const inZone = e.clientY >= rect.top && e.clientY <= rect.bottom;
          other.classList.toggle('ex-drag-over', inZone);
        });
      });

      handle.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        card.style.transform = '';
        card.style.zIndex = '';
        card.classList.remove('ex-dragging');

        let dropIdx = srcIdx;
        list.querySelectorAll('.exercise-card').forEach((other) => {
          if (other.classList.contains('ex-drag-over')) {
            dropIdx = parseInt(other.dataset.ei);
            other.classList.remove('ex-drag-over');
          }
        });

        if (dropIdx !== srcIdx) {
          const moved = State.plan.splice(srcIdx, 1)[0];
          State.plan.splice(dropIdx, 0, moved);
          _persistSession();
          const scrollY = document.getElementById('s-train').scrollTop;
          renderActive();
          requestAnimationFrame(() => {
            const s = document.getElementById('s-train');
            if (s) s.scrollTop = scrollY;
          });
        }
      });
    });
  }

  /* ══════════════════════════════════════════════
     HAPTIC
     ══════════════════════════════════════════════ */
  function _haptic(ms = 10) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  /* ══════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════ */
  function init() {
    if (!tryRestoreSession()) renderSelect();
  }

  /* ── Public ── */
  return {
    init,
    renderSelect,
    selectType,
    openPlanEditor,
    _closePlanEditor,
    _savePlanAndClose,
    _switchPlanTab,
    _updatePlanName,
    _adjustPlan,
    _addPlanEx,
    _deletePlanEx,
    stepWeight,
    stepReps,
    editVal,
    commitVal,
    setRPE,
    toggleSet,
    toggleCard,
    addSet,
    completeSession,
    cancelSession,
    openReplaceExModal,
  };
})();

/* ════════════════════════════════════════════════════════
   RestTimer — Block 9
   Floating bar autostart + modal ring. Per-set state.
   ════════════════════════════════════════════════════════ */
const RestTimer = (() => {
  'use strict';
  let _raf = null,
    _end = 0,
    _total = 90,
    _tapTimer = 0;

  function start(exName, setLabel, seconds) {
    seconds = seconds || 90;
    _total = seconds;
    _end = Date.now() + seconds * 1000;
    cancelAnimationFrame(_raf);
    _show(exName, setLabel);
    _tick();
    navigator.vibrate?.([30]);
  }

  function stop() {
    cancelAnimationFrame(_raf);
    _raf = null;
    _hideBar();
    _hideModal();
  }

  function addTime(sec) {
    _end += sec * 1000;
    _total += sec;
    navigator.vibrate?.([15]);
  }

  function tapSkip() {
    const now = Date.now();
    if (now - _tapTimer < 380) {
      stop();
      return;
    }
    _tapTimer = now;
    stop();
  }

  function _tick() {
    const rem = Math.max(0, Math.ceil((_end - Date.now()) / 1000));
    _updateBar(rem);
    _updateModal(rem);
    if (rem <= 0) {
      _onDone();
      return;
    }
    _raf = requestAnimationFrame(_tick);
  }

  function _onDone() {
    navigator.vibrate?.([100, 50, 100, 50, 200]);
    _hideBar();
    _hideModal();
  }

  function _fmt(s) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function _show(exName, setLabel) {
    let bar = document.getElementById('rest-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rest-bar';
      bar.innerHTML = `
        <div class="rest-bar-inner">
          <span class="rest-bar-label" id="rb-label"></span>
          <div class="rest-bar-mid">
            <span class="rest-bar-time" id="rb-time">0:00</span>
            <button class="rest-bar-plus" onclick="RestTimer.addTime(30)">+30s</button>
          </div>
          <button class="rest-bar-skip"
            ontouchstart="RestTimer.tapSkip();event.preventDefault()"
            onclick="RestTimer.tapSkip()">Skip</button>
        </div>
        <div class="rest-bar-track">
          <div class="rest-bar-fill" id="rb-fill"></div>
        </div>`;
      bar.addEventListener('click', (e) => {
        if (!e.target.closest('button')) _openModal(exName, setLabel);
      });
      const hdr =
        document.getElementById('workout-header') || document.querySelector('.workout-top');
      if (hdr) hdr.after(bar);
      else document.getElementById('screen-workout')?.prepend(bar);
    }
    document.getElementById('rb-label').textContent = exName + ' · ' + setLabel;
    bar.classList.add('visible');
  }

  function _updateBar(rem) {
    const t = document.getElementById('rb-time');
    const f = document.getElementById('rb-fill');
    if (t) t.textContent = _fmt(rem);
    if (f) f.style.width = (rem / _total) * 100 + '%';
  }

  function _hideBar() {
    document.getElementById('rest-bar')?.classList.remove('visible');
  }

  function _openModal(exName, setLabel) {
    if (document.getElementById('rest-modal')) return;
    const m = document.createElement('div');
    m.id = 'rest-modal';
    m.className = 'rest-modal-overlay';
    m.innerHTML = `
      <div class="rest-modal-sheet">
        <div class="modal-handle"></div>
        <p class="rest-modal-sub" id="rm-sub">${exName} · ${setLabel}</p>
        <div class="rest-ring-wrap">
          <svg viewBox="0 0 120 120" class="rest-ring-svg">
            <circle cx="60" cy="60" r="52" class="ring-track"/>
            <circle cx="60" cy="60" r="52" class="ring-prog" id="rm-ring"
              stroke-dasharray="326.7" stroke-dashoffset="0"/>
          </svg>
          <div class="rest-ring-inner">
            <span class="rest-modal-time" id="rm-time">0:00</span>
            <span class="rest-modal-lbl">REST</span>
          </div>
        </div>
        <div class="rest-modal-btns">
          <button class="rest-btn-sec" onclick="RestTimer.addTime(30)">+30s</button>
          <button class="rest-btn-primary"
            ontouchstart="RestTimer.tapSkip();event.preventDefault()"
            onclick="RestTimer.tapSkip()">
            Skip<br><small>×2 = Stop</small>
          </button>
        </div>
      </div>`;
    m.onclick = (e) => {
      if (e.target === m) m.remove();
    };
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('visible'));
  }

  function _updateModal(rem) {
    const t = document.getElementById('rm-time');
    const r = document.getElementById('rm-ring');
    if (t) t.textContent = _fmt(rem);
    if (r) r.style.strokeDashoffset = 326.7 * (1 - rem / _total);
  }

  function _hideModal() {
    const m = document.getElementById('rest-modal');
    if (m) {
      m.classList.remove('visible');
      setTimeout(() => m.remove(), 300);
    }
  }

  return { start, stop, addTime, tapSkip };
})();
