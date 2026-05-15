// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/render.js — Rendering layer
   renderSelect, renderActive, renderExerciseCard, renderSetRow,
   _renderCoreSection, _initDrag + shared helpers / DB queries
   ════════════════════════════════════════════════════════ */

import { DB } from '../db.js';
import { Timer } from '../timer.js';
import { Toast } from '../shell.js';
import {
  State,
  loadPlan, savePlan,
  buildSession, persistSession,
  getWeekMode, loadCoreChecklist,
} from '../workout.store.js';

/* ── Render helpers (exported so modals.js can re-use svgArrow) ── */
export const TYPE_COLOR = {
  push: 'var(--c-accent)',
  pull: 'var(--c-purple)',
  legs: 'var(--c-blue)',
};

export function svgArrow(dir) {
  const p = {
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
    plus:  '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    up:    '<polyline points="18 15 12 9 6 15"/>',
    down:  '<polyline points="6 9 12 15 18 9"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    style="pointer-events:none">${p[dir]}</svg>`;
}

export function typeIcon(type, color) {
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

export function fmtVol(kg) {
  return kg >= 1000 ? (kg / 1000).toFixed(1) + 'k' : Math.round(kg).toString();
}

function _haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* ── Shared checked-state for Core checklist (session-scoped) ── */
export const _coreCheckedState = {}; // { 'push:Plank': true }

/* ════════════════════════════════════════════════════════
   DB HELPERS — progressive overload queries
   ════════════════════════════════════════════════════════ */

export async function _getLastSessionWeight(exerciseName) {
  const workouts = await DB.Workouts.getAll();
  const last = workouts.reverse().find(w =>
    (w.exercises || []).some(e => e.name === exerciseName)
  );
  const ex = last?.exercises?.find(e => e.name === exerciseName);
  return ex?.sets?.[0]?.weight || 0;
}

export async function _computeCoachTarget(exerciseName) {
  const last = await _getLastSessionWeight(exerciseName);
  if (!last || last <= 0) return null;
  const raw = last * 1.025;
  const target = Math.round(raw / 2.5) * 2.5;
  return { target, last };
}

export async function _getLastSessionSummary(exerciseName) {
  try {
    const workouts = await DB.Workouts.getAll();
    const last = [...workouts].reverse().find(w =>
      (w.exercises || []).some(e => e.name === exerciseName)
    );
    const ex = last?.exercises?.find(e => e.name === exerciseName);
    const sets = (ex?.sets || []).filter(s => s.done && s.reps);
    if (!sets.length) return '';
    return sets.map(s => `${s.weight}×${s.reps}`).join(', ');
  } catch { return ''; }
}

export async function _getExerciseHistory(exerciseName) {
  const workouts = await DB.Workouts.getAll();
  return workouts
    .filter(w => (w.exercises || []).some(e => e.name === exerciseName))
    .slice(-10)
    .map(w => {
      const ex = w.exercises.find(e => e.name === exerciseName);
      return {
        weight: ex?.sets?.[0]?.weight || 0,
        oneRM: null,
      };
    });
}

/* ════════════════════════════════════════════════════════
   CORE SECTION
   ════════════════════════════════════════════════════════ */

export function _renderCoreSection(day) {
  const items = loadCoreChecklist(day);
  const rows = items.map((name, i) => {
    const key = `${day}:${name}`;
    const checked = _coreCheckedState[key] ? 'checked' : '';
    return `
      <div class="core-item ${checked}" id="core-item-${i}"
           onclick="Workout._toggleCoreItem('${day}',${i})">
        <div class="core-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" width="13" height="13">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span class="core-name">${name}</span>
        <button class="core-remove" onclick="event.stopPropagation();Workout._removeCoreItem('${day}',${i})"
                aria-label="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  return `
    <div class="section-header" style="margin-top:var(--sp-2)">
      <span class="section-label">Core</span>
      <button class="btn-text" onclick="Workout._addCoreItem('${day}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" width="14" height="14">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add
      </button>
    </div>
    <div class="core-list">
      ${rows || '<div class="core-empty">No core work — tap Add to include items.</div>'}
    </div>`;
}

/* ════════════════════════════════════════════════════════
   PHASE 1 — SELECT TYPE
   ════════════════════════════════════════════════════════ */
export function renderSelect() {
  State.phase = 'select';
  const plan = loadPlan();
  const weekMode = getWeekMode();

  const trainEl = document.getElementById('s-train');
  trainEl.removeAttribute('data-day');
  trainEl.innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">Workout</div>
        <div class="screen-sub" id="train-date"></div>
      </div>
      <button class="week-pill week-${weekMode}" onclick="Workout._toggleWeek()"
              aria-label="Toggle Week A/B" title="Tap to switch week">
        <span class="week-pill-lbl">Week</span>
        <span class="week-pill-val">${weekMode}</span>
      </button>
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

    <!-- Pre-workout checklist -->
    <div class="section-header" style="margin-top:var(--sp-2);margin-bottom:var(--sp-1)">
      <span class="section-label">Pre-Workout Checklist</span>
    </div>
    <div class="checklist-card" id="pre-checklist">
      ${[
        'Warmup — 10 min cardio or mobility',
        'Hydration — 500ml water before start',
        'Gear — shoes, belt, straps ready',
        'Energy — meal 90 min before',
        'Plan — exercises and target weights set',
        'Focus — phone on Do Not Disturb',
      ].map((text, i) => `
        <div class="checklist-item" id="chk-pre-${i}" onclick="Workout.toggleChecklist(${i})">
          <div class="checklist-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" width="13" height="13">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <span class="checklist-text">${text}</span>
        </div>`).join('')}
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

/* ════════════════════════════════════════════════════════
   PHASE 2 — ACTIVE WORKOUT
   ════════════════════════════════════════════════════════ */
export async function renderActive() {
  const color = TYPE_COLOR[State.type];
  const exCount = State.plan.length;
  const totalSets = State.plan.reduce((s, e) => s + e.sets.length, 0);
  const weekMode = getWeekMode();

  const exerciseCards = await Promise.all(
    State.plan.map((ex, ei) => renderExerciseCard(ex, ei))
  );

  const trainEl = document.getElementById('s-train');
  trainEl.setAttribute('data-day', State.type);
  trainEl.innerHTML = `

    <!-- Header -->
    <div class="screen-header">
      <div>
        <div class="screen-title">${State.type.charAt(0).toUpperCase() + State.type.slice(1)} Day</div>
        <div class="screen-sub">${exCount} exercises · ${totalSets} sets</div>
      </div>
      <div class="header-chips">
        <button class="week-pill week-${weekMode}" onclick="Workout._toggleWeek()"
                aria-label="Toggle Week A/B" title="Tap to switch week">
          <span class="week-pill-lbl">W</span>
          <span class="week-pill-val">${weekMode}</span>
        </button>
        <div class="session-timer-chip" style="border-color:${color}20">
          <div class="session-timer-dot" style="background:${color}"></div>
          <span id="session-timer-val" style="color:${color}">00:00</span>
        </div>
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

    <!-- Rest timer rendered as floating pill by RestTimer module (#rest-bar) -->

    <!-- Exercise list -->
    <div id="exercise-list">
      ${exerciseCards.join('')}
    </div>

    <!-- Add exercise to live session -->
    <button class="btn-add-live-ex" onclick="Workout._addLiveExercise()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" width="16" height="16">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add Exercise
    </button>

    <!-- Core checklist (visual-only, no metrics) -->
    <div class="core-section" id="core-section">
      ${_renderCoreSection(State.type)}
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
  requestAnimationFrame(() => {
    if (typeof window !== 'undefined' && window.Workout?._initFocusLongPress) {
      window.Workout._initFocusLongPress();
    }
  });
}

export async function renderExerciseCard(ex, ei) {
  const doneSets = ex.sets.filter((s) => s.done).length;
  const setRows = await Promise.all(ex.sets.map((set, si) => renderSetRow(ex, ei, set, si)));
  const lastSummary = await _getLastSessionSummary(ex.name);
  const coach = await _computeCoachTarget(ex.name);
  const planMax = Math.max(0, ...ex.sets.map(s => s.weight || 0));
  const overflow = coach && planMax > coach.target;

  return `
    <div class="exercise-card" id="ex-card-${ei}" data-ei="${ei}" data-day="${State.type}">
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
          <div class="exercise-name">
            ${ex.name}
            ${coach ? `<span class="coach-pill ${overflow ? 'overflow' : ''}" title="Suggested target: ${coach.last}kg × 1.025">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" width="10" height="10">
                <polyline points="5 12 19 12"/><polyline points="13 6 19 12 13 18"/>
              </svg>
              ${coach.target}<span class="coach-pill-unit">kg</span>
            </span>` : ''}
          </div>
          <div class="exercise-meta">${ex.sets.length} sets
            <span id="ex-done-count-${ei}" style="color:var(--c-accent)">
              ${doneSets > 0 ? ' · ' + doneSets + ' done' : ''}
            </span>
          </div>
          ${lastSummary ? `<div class="last-session-ref" title="Last session"><span class="last-lbl">Last</span> · ${lastSummary}</div>` : ''}
        </div>
        <button class="ex-replace-btn" title="Replace exercise" aria-label="Replace exercise"
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
          <span style="width:40px"></span>
        </div>
        ${setRows.join('')}
        <button class="add-set-btn" onclick="Workout.addSet(${ei})" aria-label="Add set">
          ${svgArrow('plus')} Add Set
        </button>
      </div>
    </div>`;
}

export async function renderSetRow(ex, ei, set, si) {
  const firstUndoneIdx = ex.sets.findIndex(s => !s.done);
  const isActive = !set.done && si === firstUndoneIdx;

  return `
    <div class="set-row ${set.done ? 'set-done' : ''} ${isActive ? 'set-active' : ''}" id="set-row-${ei}-${si}">
      <span class="set-num">${si + 1}</span>

      <!-- Weight stepper -->
      <div class="stepper" id="sw-${ei}-${si}">
        <button class="stepper-btn ${set.weight <= 0 ? 'at-min' : ''}"
          ontouchstart="Workout.stepWeight(${ei},${si},-2.5);event.cancelable&&event.preventDefault()"
          onclick="Workout.stepWeight(${ei},${si},-2.5)" aria-label="Decrease weight">
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
          ontouchstart="Workout.stepWeight(${ei},${si},2.5);event.cancelable&&event.preventDefault()"
          onclick="Workout.stepWeight(${ei},${si},2.5)" aria-label="Increase weight">
          ${svgArrow('plus')}
        </button>
      </div>

      <!-- Reps stepper -->
      <div class="stepper" id="sr-${ei}-${si}">
        <button class="stepper-btn ${set.reps <= 1 ? 'at-min' : ''}"
          ontouchstart="Workout.stepReps(${ei},${si},-1);event.cancelable&&event.preventDefault()"
          onclick="Workout.stepReps(${ei},${si},-1)" aria-label="Decrease reps">
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
          ontouchstart="Workout.stepReps(${ei},${si},1);event.cancelable&&event.preventDefault()"
          onclick="Workout.stepReps(${ei},${si},1)" aria-label="Increase reps">
          ${svgArrow('up')}
        </button>
      </div>

      <!-- Done check -->
      <button class="set-check ${set.done ? 'done' : ''}" id="chk-${ei}-${si}"
              onclick="Workout.toggleSet(${ei},${si})" aria-label="Mark set complete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" width="16" height="16">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
    </div>`;
}

/* ════════════════════════════════════════════════════════
   FOCUS MODE (Phase 3.A) — fullscreen single-exercise overlay
   ════════════════════════════════════════════════════════ */

function _focusSvg(name) {
  const paths = {
    close:  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    minus:  '<line x1="5" y1="12" x2="19" y2="12"/>',
    plus:   '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    check:  '<polyline points="20 6 9 17 4 12"/>',
    timer:  '<circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="2" x2="15" y2="2"/>',
    checkc: '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>',
  };
  const sw = name === 'check' || name === 'checkc' ? 2 : 1.6;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"
    width="24" height="24">${paths[name]}</svg>`;
}

export async function renderFocusMode(ei) {
  const ex = State.plan[ei];
  if (!ex) return '';

  const total = ex.sets.length;
  const doneCount = ex.sets.filter(s => s.done).length;
  const activeIdx = Math.min(ex.sets.findIndex(s => !s.done), total - 1);
  const si = activeIdx < 0 ? total - 1 : activeIdx;
  const set = ex.sets[si];

  const totalSets = State.plan.reduce((acc, e) => acc + e.sets.length, 0);
  const totalDone = State.plan.reduce((acc, e) => acc + e.sets.filter(s => s.done).length, 0);
  const progressPct = totalSets ? Math.round((totalDone / totalSets) * 100) : 0;

  const lastSummary = await _getLastSessionSummary(ex.name);
  const lastRows = lastSummary
    ? lastSummary.split(', ').slice(0, 3).map((s, i) => {
        const [w, r] = s.split('×');
        return `<div class="focus-last-row">
          <div style="display:flex;align-items:center;gap:14px">
            <span class="focus-last-num">${i + 1}</span>
            <span>${w} kg</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span>${r} reps</span>
            <span style="color:var(--c-accent);display:flex">${_focusSvg('check').replace('width="24" height="24"', 'width="14" height="14"')}</span>
          </div>
        </div>`;
      }).join('')
    : '';

  const dayLabel = State.type.charAt(0).toUpperCase() + State.type.slice(1) + ' Day';
  const sessionTime = Timer.fmt(Timer.seconds());

  const allDone = doneCount >= total;

  return `
    <div class="focus-overlay" id="focus-overlay" data-day="${State.type}" data-ei="${ei}" data-si="${si}">
      <div class="focus-header">
        <button class="focus-close-btn" aria-label="Close focus mode"
                onclick="Workout._closeFocus()">
          ${_focusSvg('close')}
        </button>
        <div class="focus-header-title">
          <span class="focus-header-day">${dayLabel}</span>
          <span class="focus-header-name">${ex.name}</span>
        </div>
        <button class="focus-finish-btn" aria-label="Finish session"
                onclick="Workout._closeFocus();Workout.completeSession()">Finish</button>
      </div>

      <div class="focus-progress">
        <div class="focus-progress-fill" id="focus-progress-fill" style="width:${progressPct}%"></div>
      </div>

      <div class="focus-body">
        <div class="focus-hero-timer">
          <span class="focus-hero-label">Workout Time</span>
          <span class="focus-hero-time" id="focus-hero-time">${sessionTime}</span>
        </div>

        <div class="focus-glass-card" id="focus-card">
          <div class="focus-card-top">
            <div>
              <div class="focus-chip">
                <span class="focus-chip-dot"></span>
                <span>Exercise ${ei + 1}</span>
              </div>
              <div class="focus-ex-name">${ex.name}</div>
            </div>
            <div class="focus-set-counter">
              <span class="focus-set-lbl">Set</span>
              <span class="focus-set-val">
                <span id="focus-set-cur">${si + 1}</span>
                <span class="focus-set-total"> / ${total}</span>
              </span>
            </div>
          </div>

          <div class="focus-numbers">
            <div class="focus-num-col">
              <span class="focus-num-lbl">Weight</span>
              <div class="focus-num-row">
                <button class="focus-num-btn" aria-label="Decrease weight"
                        onclick="Workout._focusStepW(-2.5)">${_focusSvg('minus')}</button>
                <span class="focus-num-val" id="focus-w-val">${set.weight}</span>
                <button class="focus-num-btn" aria-label="Increase weight"
                        onclick="Workout._focusStepW(2.5)">${_focusSvg('plus')}</button>
              </div>
              <span class="focus-num-unit">kg</span>
            </div>
            <div class="focus-num-col">
              <span class="focus-num-lbl">Reps</span>
              <div class="focus-num-row">
                <button class="focus-num-btn" aria-label="Decrease reps"
                        onclick="Workout._focusStepR(-1)">${_focusSvg('minus')}</button>
                <span class="focus-num-val" id="focus-r-val">${set.reps}</span>
                <button class="focus-num-btn" aria-label="Increase reps"
                        onclick="Workout._focusStepR(1)">${_focusSvg('plus')}</button>
              </div>
              <span class="focus-num-unit">reps</span>
            </div>
          </div>
        </div>

        ${lastRows ? `
        <div class="focus-last-ref">
          <div class="focus-last-title">Last Session</div>
          ${lastRows}
        </div>` : ''}
      </div>

      <div class="focus-footer">
        <div class="focus-rest-card hidden" id="focus-rest-card">
          <div class="focus-rest-left">
            ${_focusSvg('timer')}
            <span class="focus-rest-lbl">Rest Timer</span>
          </div>
          <span class="focus-rest-val" id="focus-rest-val">0:00</span>
        </div>
        <button class="focus-cta" id="focus-cta" ${allDone ? 'disabled' : ''}
                onclick="Workout._focusCompleteSet()">
          <span class="focus-cta-icon">${_focusSvg('checkc')}</span>
          <span class="focus-cta-text">${allDone ? 'All Sets Done' : 'Complete Set'}</span>
        </button>
      </div>
    </div>`;
}

/* ════════════════════════════════════════════════════════
   DRAG-AND-DROP REORDER (active session)
   ════════════════════════════════════════════════════════ */
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

    handle.addEventListener('pointerup', async () => {
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
        persistSession();
        try {
          const w = getWeekMode();
          const p = loadPlan(w);
          if (p[State.type]) {
            const newOrder = State.plan.map(ex => p[State.type].find(t => t.name === ex.name)).filter(Boolean);
            p[State.type].forEach(t => {
              if (!newOrder.find(n => n.name === t.name)) newOrder.push(t);
            });
            p[State.type] = newOrder;
            savePlan(p, w);
            Toast.show('Order saved to template', 'info', 1400);
          }
        } catch { /* non-blocking */ }
        const scrollY = document.getElementById('s-train').scrollTop;
        await renderActive();
        requestAnimationFrame(() => {
          const s = document.getElementById('s-train');
          if (s) s.scrollTop = scrollY;
        });
      }
    });
  });
}
