// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/render.js — Rendering layer
   renderSelect, renderActive, renderExerciseCard, renderSetRow,
   _renderCoreSection, _initDrag + shared helpers / DB queries
   ════════════════════════════════════════════════════════ */

import { DB } from '../db.js';
import { Timer } from '../timer.js';
import { Toast } from '../shell.js';
import { esc } from '../shared/utils.js';
import { Spring } from '../shared/spring.js';
import {
  State,
  loadPlan, savePlan,
  buildSession, persistSession,
  getWeekMode, loadCoreChecklist,
  getExerciseLibrary,
  getActivePlan, getPlanStats
} from '../workout.store.js';
import { PROGRAMS } from '../workout-plans.js';
import { initDragNumbers } from '../ui/drag-number.js';
import { initGravitySubmit } from '../ui/gravity-submit.js';
import { initDrumPickers } from '../ui/drum-picker.js';

/* ── Render helpers ── */
export const TYPE_COLOR = {
  push: '#00e676', // Neon Green
  pull: '#00e5ff', // Neon Cyan
  legs: '#bc13fe', // Neon Purple
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
    width="14" height="14" style="pointer-events:none">${p[dir]}</svg>`;
}

export function typeIcon(type, color) {
  const icons = {
    push: `<svg viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M16 32 L32 32 L36 18 L12 18 Z" stroke-dasharray="3 3" opacity="0.3"/>
             <line x1="18" y1="36" x2="18" y2="12"/><polyline points="14 16 18 12 22 16"/><circle cx="18" cy="36" r="1.5" fill="${color}"/>
             <line x1="30" y1="36" x2="30" y2="12"/><polyline points="26 16 30 12 34 16"/><circle cx="30" cy="36" r="1.5" fill="${color}"/>
             <line x1="24" y1="38" x2="24" y2="18"/><circle cx="24" cy="38" r="1.5" fill="${color}"/>
           </svg>`,
    pull: `<svg viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M12 20 L36 20 L32 34 L16 34 Z" stroke-dasharray="3 3" opacity="0.3"/>
             <line x1="18" y1="12" x2="18" y2="36"/><polyline points="14 32 18 36 22 32"/><circle cx="18" cy="12" r="1.5" fill="${color}"/>
             <line x1="30" y1="12" x2="30" y2="36"/><polyline points="26 32 30 36 34 32"/><circle cx="30" cy="12" r="1.5" fill="${color}"/>
             <line x1="24" y1="10" x2="24" y2="30"/><circle cx="24" cy="10" r="1.5" fill="${color}"/>
           </svg>`,
    legs: `<svg viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M24 12 L34 36 L14 36 Z" stroke-dasharray="3 3" opacity="0.3"/>
             <line x1="16" y1="20" x2="32" y2="20"/>
             <line x1="24" y1="38" x2="24" y2="14"/>
             <polyline points="20 18 24 14 28 18"/>
             <circle cx="18" cy="36" r="1.5" fill="${color}"/>
             <circle cx="30" cy="36" r="1.5" fill="${color}"/>
           </svg>`
  };
  
  if (!icons[type]) return '';
  return `<span class="type-icon kinetic-svg" style="color:${color}; filter: drop-shadow(0 0 5px ${color}) drop-shadow(0 0 15px ${color});" aria-hidden="true">${icons[type]}</span>`;
}

export function fmtVol(kg) {
  return kg >= 1000 ? (kg / 1000).toFixed(1) + 'k' : Math.round(kg).toString();
}

function _haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

export const _coreCheckedState = {};

/* ════════════════════════════════════════════════════════
   DB HELPERS
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
        <span class="core-name">${esc(name)}</span>
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
   SELECT TYPE
   ════════════════════════════════════════════════════════ */
export async function renderSelect() {
  State.phase = 'select';
  const plan = loadPlan();
  const weekMode = getWeekMode();
  const activePlan = getActivePlan();
  const stats = getPlanStats();
  const lang = await DB.Settings.get('lang', 'en');
  const ru = lang === 'ru';

  const trainEl = document.getElementById('s-train');
  if (!trainEl) return;
  trainEl.removeAttribute('data-day');
  trainEl.innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">${ru ? 'Тренировки' : 'Training Hub'}</div>
        <div class="screen-sub" id="train-date"></div>
      </div>
      <button class="week-pill week-${weekMode}" onclick="Workout._toggleWeek()"
              aria-label="Toggle Week A/B" title="Tap to switch week">
        <span class="week-pill-lbl">${ru ? 'Неделя' : 'Week'}</span>
        <span class="week-pill-val">${weekMode}</span>
      </button>
    </div>

    ${stats ? `
    <div class="active-plan-card stagger-item" onclick="Workout.selectType('active')">
      <div class="active-plan-info">
        <div class="active-plan-title">${esc(stats.name)}</div>
        <div class="active-plan-meta">${ru ? 'Неделя' : 'Week'} ${stats.week} · ${ru ? 'День' : 'Day'} ${stats.day} ${ru ? 'из' : 'of'} ${stats.totalDays}</div>
      </div>
      <div class="active-plan-progress">
        <div class="active-plan-progress-fill" id="active-plan-bar" style="width:0%"></div>
      </div>
      <button class="btn-next-session">
        ${ru ? 'Следующая тренировка' : 'Next Session'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
    ` : ''}

    <div class="section-header stagger-item" style="margin-top:var(--sp-2)">
      <span class="section-label">${activePlan ? (ru ? 'Свободная тренировка' : 'Free Training') : (ru ? 'Выбор типа' : 'Select Type')}</span>
      <button class="btn-text" onclick="Workout.openPlanEditor()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
             width="14" height="14">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        ${ru ? 'План' : 'Edit Plan'}
      </button>
    </div>

    <div class="type-grid stagger-item">
      ${['push', 'pull', 'legs']
        .map((t) => {
          const color = t === 'push' ? '#00e676' : t === 'pull' ? '#00e5ff' : '#bc13fe';
          return `
        <button class="type-card" data-type="${t}" onclick="Workout.selectType('${t}')">
          <div class="type-card-icon" style="color: ${color}">
            ${typeIcon(t, color)}
          </div>
          <div class="type-card-text">
            <div class="type-card-name">${t.toUpperCase()}</div>
            <div class="type-card-meta">${t === 'push' ? (ru ? 'ГРУДЬ' : 'CHEST') : t === 'pull' ? (ru ? 'СПИНА' : 'BACK') : (ru ? 'ПЛЕЧИ' : 'SHOULDERS')}</div>
          </div>
        </button>`;
    })
    .join('')}
</div>

    <div class="section-header stagger-item" style="margin-top:var(--sp-3)">
      <span class="section-label">${ru ? 'Прошлые сессии' : 'Last Sessions'}</span>
    </div>
    <div id="last-sessions-preview" class="stagger-item"></div>

    <div class="section-header stagger-item" style="margin-top:var(--sp-3)">
      <span class="section-label">${ru ? 'Программы' : 'Structured Programs'}</span>
    </div>
    <div class="programs-carousel stagger-item">
      ${PROGRAMS.map(p => `
        <div class="program-card ${activePlan?.id === p.id ? 'active' : ''}" 
             onclick="Workout._startProgram('${p.id}')">
          <div class="program-type">${p.type.toUpperCase()}</div>
          <div class="program-name">${p.name}</div>
          <div class="program-dur">${p.durationWeeks} weeks · ${p.days.length} days/split</div>
          ${activePlan?.id === p.id ? '<div class="program-status">Active Cycle</div>' : ''}
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('train-date').textContent = new Date().toLocaleDateString(ru ? 'ru' : 'en', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  DB.Workouts.getLast(3).then((list) => {
    const el = document.getElementById('last-sessions-preview');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="empty-state" style="padding:var(--sp-3)">No sessions yet</div>';
      return;
    }
    el.innerHTML = list.map((w) => {
      const dot = TYPE_COLOR[w.type] || 'var(--c-text-3)';
      const date = new Date(w.timestamp).toLocaleDateString(ru ? 'ru' : 'en', { weekday: 'short', month: 'short', day: 'numeric' });
      const dur = w.duration ? Timer.fmt(Math.round(w.duration / 1000)) : '--';
      return `<div class="session-item">
        <div class="session-dot" style="background:${dot}"></div>
        <div class="session-info">
          <div class="session-title">${w.type.charAt(0).toUpperCase() + w.type.slice(1)} Day</div>
          <div class="session-meta">${date} · ${dur}</div>
        </div>
        <div class="session-vol">${fmtVol(w.tonnage)} kg</div>
      </div>`;
    }).join('');
  });

  if (stats) {
    requestAnimationFrame(() => {
      const bar = document.getElementById('active-plan-bar');
      if (bar) {
        Spring.animate({
          from: 0,
          to: stats.progress,
          onUpdate: (v) => { bar.style.transform = `scaleX(${v / 100})`; }
        });
      }
    });
  }
}

/* ════════════════════════════════════════════════════════
   ACTIVE WORKOUT
   ════════════════════════════════════════════════════════ */
export async function renderActive() {
  const lang = await DB.Settings.get('lang', 'en');
  const ru = lang === 'ru';
  const exCount = State.plan.length;
  const totalSets = State.plan.reduce((s, e) => s + e.sets.length, 0);

  const trainEl = document.getElementById('s-train');
  if (!trainEl) return;
  trainEl.setAttribute('data-day', State.type);
  trainEl.innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">${ru ? (State.type === 'push' ? 'Жим' : State.type === 'pull' ? 'Тяга' : 'Ноги') : State.type.charAt(0).toUpperCase() + State.type.slice(1)} ${ru ? 'День' : 'Day'}</div>
      </div>
      <div class="header-chips">
        <!-- Focused header: Week toggle removed, live-timer moved to dynamic island -->
      </div>
    </div>

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

    <!-- ── Global Workout Progress ── -->
    <div class="workout-progress-wrap">
      <div class="workout-progress-track">
        <div class="workout-progress-fill" id="workout-progress-fill"></div>
      </div>
    </div>

    <div id="exercise-list">
      ${await (async () => {
        let currentBlock = '';
        const cards = [];
        for (let ei = 0; ei < State.plan.length; ei++) {
          const ex = State.plan[ei];
          
          const blockMap = {
            'power': ru ? 'БЛОК I: СИЛА' : 'BLOCK I: POWER',
            'shape': ru ? 'БЛОК II: ОБЪЕМ' : 'BLOCK II: VOLUME',
            'width': ru ? 'БЛОК I: ШИРИНА' : 'BLOCK I: WIDTH',
            'thickness': ru ? 'БЛОК II: ТОЛЩИНА' : 'BLOCK II: THICKNESS',
            'heavy': ru ? 'БЛОК I: ТЯЖЕЛЫЙ' : 'BLOCK I: HEAVY',
            'iso': ru ? 'БЛОК II: ИЗОЛЯЦИЯ' : 'BLOCK II: ISOLATION',
            'arms': ru ? 'БЛОК III: РУКИ' : 'BLOCK III: ARMS',
            'shoulders': ru ? 'БЛОК III: ПЛЕЧИ' : 'BLOCK III: SHOULDERS',
            'core': ru ? 'БЛОК IV: КОР' : 'BLOCK IV: CORE',
            'align': ru ? 'БЛОК IV: ОСАНКА' : 'BLOCK IV: ALIGNMENT'
          };

          const blockLabel = blockMap[ex.block] || '';
          
          if (blockLabel && blockLabel !== currentBlock) {
            currentBlock = blockLabel;
            cards.push(`
              <div class="workout-block-header stagger-item">
                <span class="block-indicator"></span>
                ${blockLabel}
              </div>
            `);
          }
          
          cards.push(await renderExerciseCard(ex, ei));
        }
        return cards.join('');
      })()}
    </div>

    <button class="btn-add-live-ex" onclick="Workout._addLiveExercise()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add Exercise
    </button>

    <div class="core-section" id="core-section">${_renderCoreSection(State.type)}</div>

    <div style="display:flex;flex-direction:column;gap:var(--sp-1);margin-top:var(--sp-2)">
      <button class="btn btn-primary" onclick="Workout.completeSession()">${ru ? 'Завершить тренировку' : 'Complete Session'}</button>
      <button class="btn btn-ghost" onclick="Workout.cancelSession()">${ru ? 'Отмена' : 'Cancel'}</button>
    </div>
    <div style="height:var(--sp-2)"></div>
  `;

  requestAnimationFrame(() => {
    _initDrag();
    initDragNumbers();
    initGravitySubmit();
    initDrumPickers();
    if (window.Workout?._initFocusLongPress) window.Workout._initFocusLongPress();
    // Reflect current progress on (re)render — e.g. resuming a session with
    // sets already done — not only after a set toggle. Dynamic import avoids a
    // static render<->handlers import cycle.
    import('./handlers.js').then(m => m._updateLiveStats?.()).catch(() => {});
  });
}

async function getMuscleBadge(exerciseName) {
  const lib = await getExerciseLibrary().catch(() => []);
  const clean = exerciseName.toLowerCase().trim();
  const matched = lib.find(i => i.name.toLowerCase().trim() === clean) || lib.find(i => i.name.toLowerCase().includes(clean));
  
  const muscle = (matched?.muscleGroup || 'unknown').toLowerCase();
  let normalized = muscle;
  if (normalized.includes('delt')) normalized = 'shoulders';
  if (['quads', 'calves', 'hamstrings', 'glutes'].includes(normalized)) normalized = 'legs';
  if (normalized === 'biceps') normalized = 'back';

  return `<span class="muscle-badge ${normalized}">${muscle.toUpperCase()}</span>`;
}

export async function renderExerciseCard(ex, ei) {
  const doneSets = ex.sets.filter(s => s.done).length;
  const setRows = await Promise.all(ex.sets.map((set, si) => renderSetRow(ex, ei, set, si)));
  const coach = await _computeCoachTarget(ex.name);
  const muscleBadge = await getMuscleBadge(ex.name);

  const firstUndoneIdx = ex.sets.findIndex(s => !s.done);
  const targetSi = firstUndoneIdx === -1 ? 0 : firstUndoneIdx;

  const lang = await DB.Settings.get('lang', 'en');
  const ru = lang === 'ru';

  const iconCoach = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;

  return `
    <div class="exercise-card ${ex.noDb ? 'ex-no-db' : ''}" id="ex-card-${ei}" data-ei="${ei}">
      <div class="exercise-header" onclick="Workout.toggleCard(${ei})">
        <div class="drag-handle" onclick="event.stopPropagation()"><svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg></div>
        <div class="exercise-icon"><span class="ex-num">${ei + 1}</span></div>
        <div class="exercise-info">
          <div class="exercise-name">
            ${esc(ex.name)}${muscleBadge}
            ${coach ? `<span class="coach-pill">${coach.target}<span class="coach-pill-unit">kg</span></span>` : ''}
          </div>
          <div class="exercise-meta ${doneSets === ex.sets.length ? 'done' : ''}" id="ex-meta-${ei}">${doneSets}/${ex.sets.length}</div>
        </div>
        
        <div class="ex-header-actions" onclick="event.stopPropagation()">
          <button class="ex-action-btn coach" title="Smart Coach" onclick="Workout.smartCoach(${ei},${targetSi})">${iconCoach}</button>
          <button class="ex-action-btn" title="More options" onclick="Workout.showExerciseMenu(${ei})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
              <circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="6" r="1.2"/><circle cx="12" cy="18" r="1.2"/>
            </svg>
          </button>
        </div>

        <div class="exercise-chevron" id="ex-chevron-${ei}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
      <div class="sets-wrap" id="sets-wrap-${ei}" style="display:${doneSets === ex.sets.length ? 'none' : 'block'}">
        <div class="set-header-row">
          <span style="width:20px"></span>
          <span class="set-col-label">${ru ? 'Вес kg' : 'Weight kg'}</span>
          <span class="set-col-label">${ru ? 'Повторы' : 'Reps'}</span>
          <span style="width:44px"></span>
        </div>
        ${setRows.join('')}
        <button class="add-set-btn" onclick="Workout.addSet(${ei})">${svgArrow('plus')} Add Set</button>
      </div>
    </div>`;
}

export async function renderSetRow(ex, ei, set, si) {
  const firstUndoneIdx = ex.sets.findIndex(s => !s.done);
  const isActive = !set.done && si === firstUndoneIdx;
  const isBW = ex.isBW || false;
  const step = ex.isUnilateral ? 2 : 2.5;

  // Formatting weight: if BW, show as +Weight or BW
  const displayWeight = isBW 
    ? (set.weight > 0 ? `+${set.weight}` : 'BW')
    : set.weight;

  return `
    <div class="set-row ${set.done ? 'set-done' : ''} ${isActive ? 'set-active' : ''}" id="set-row-${ei}-${si}">
      <span class="set-num">${si + 1}</span>
      <div class="drum-wrap" id="sw-${ei}-${si}" 
           data-type="w" data-ei="${ei}" data-si="${si}" 
           data-value="${set.weight}" 
           data-step="${step}"><div class="drum-sel"></div><div class="drum-track"></div><span class="sw-val stepper-val hidden">${displayWeight}</span></div>
      <div class="drum-wrap" id="sr-${ei}-${si}" 
           data-type="r" data-ei="${ei}" data-si="${si}" 
           data-value="${set.reps}"><div class="drum-sel"></div><div class="drum-track"></div><span class="sr-val stepper-val hidden">${set.reps}</span></div>
      <button class="set-check ${set.done ? 'done' : ''}" id="chk-${ei}-${si}" onclick="Workout.toggleSet(${ei},${si})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg></button>
    </div>`;
}

/**
 * Render the fullscreen Focus Mode overlay.
 * @param {number} ei
 * @returns {Promise<string>}
 */
export async function renderFocusMode(ei) {
  const ex = State.plan[ei];
  if (!ex) return '';
  const firstUndone = ex.sets.findIndex(s => !s.done);
  const si = firstUndone === -1 ? ex.sets.length - 1 : firstUndone;
  const set = ex.sets[si];
  const lang = await DB.Settings.get('lang', 'en');
  const ru = lang === 'ru';
  const totalEx = State.plan.length;
  const totalSets = ex.sets.length;

  return `
    <div class="focus-overlay animate-in" id="focus-overlay" data-ei="${ei}">
      <div class="focus-header">
        <div class="focus-meta">${ru ? 'Упражнение' : 'Exercise'} ${ei + 1} ${ru ? 'из' : 'of'} ${totalEx}</div>
        <button class="focus-close" onclick="Workout._closeFocus()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="focus-glass-card">
        <div class="focus-ex-name">${esc(ex.name)}</div>
        <div class="focus-set-info">${ru ? 'Подход' : 'Set'} ${si + 1} ${ru ? 'из' : 'of'} ${totalSets}</div>
        <div class="focus-hero-row">
          <div class="focus-hero-item" onclick="Workout._focusStepW(-2.5)"><div class="focus-hero-val">${set.weight}<small>kg</small></div><div class="focus-hero-lbl">${ru ? 'Вес' : 'Weight'}</div></div>
          <div class="focus-hero-divider"></div>
          <div class="focus-hero-item" onclick="Workout._focusStepR(-1)"><div class="focus-hero-val">${set.reps}</div><div class="focus-hero-lbl">${ru ? 'Повторы' : 'Reps'}</div></div>
        </div>
        <button class="focus-cta ${set.done ? 'done' : ''}" onclick="Workout._focusCompleteSet()">${set.done ? (ru ? 'Готово!' : 'Set Complete') : (ru ? 'Завершить подход' : 'Complete Set')}</button>
      </div>
      <div class="focus-footer">
        <div class="focus-progress-dots">${ex.sets.map((s, i) => `<div class="focus-dot ${s.done ? 'done' : ''} ${i === si ? 'active' : ''}"></div>`).join('')}</div>
        <div class="focus-hint">${ru ? 'Свайп вниз — закрыть · Свайп влево — далее' : 'Swipe down to close · Swipe left to next'}</div>
      </div>
    </div>`;
}

function _initDrag() {
  const list = document.getElementById('exercise-list');
  if (!list) return;
  list.querySelectorAll('.exercise-card').forEach((card) => {
    const handle = card.querySelector('.drag-handle');
    if (!handle) return;
    let dragging = false, startY = 0, srcIdx = parseInt(card.dataset.ei);
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); dragging = true; startY = e.clientY;
      handle.setPointerCapture(e.pointerId); card.classList.add('ex-dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY; card.style.transform = `translateY(${dy}px)`;
      list.querySelectorAll('.exercise-card').forEach((other) => {
        if (other === card) return;
        const rect = other.getBoundingClientRect();
        other.classList.toggle('ex-drag-over', e.clientY >= rect.top && e.clientY <= rect.bottom);
      });
    });
    handle.addEventListener('pointerup', async () => {
      if (!dragging) return;
      dragging = false; card.style.transform = ''; card.classList.remove('ex-dragging');
      let dropIdx = srcIdx;
      list.querySelectorAll('.exercise-card').forEach((other) => { if (other.classList.contains('ex-drag-over')) { dropIdx = parseInt(other.dataset.ei); other.classList.remove('ex-drag-over'); } });
      if (dropIdx !== srcIdx) {
        const moved = State.plan.splice(srcIdx, 1)[0];
        State.plan.splice(dropIdx, 0, moved);
        persistSession(); await renderActive();
      }
    });
  });
}
