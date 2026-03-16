/* ════════════════════════════════════════════════════════
   claude.js — Athlete Pro  |  Block 8
   Claude AI Assistant + Muscle Heatmap
   ════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════
   MUSCLE MAP — which exercises hit which muscles
   ══════════════════════════════════════════════ */
const MUSCLE_MAP = {
  /* PUSH */
  'Bench Press'       : ['chest', 'front-delt', 'tricep'],
  'Incline DB Press'  : ['upper-chest', 'front-delt', 'tricep'],
  'Overhead Press'    : ['front-delt', 'mid-delt', 'tricep', 'upper-trap'],
  'Cable Fly'         : ['chest', 'front-delt'],
  'Tricep Pushdown'   : ['tricep'],
  'Lateral Raise'     : ['mid-delt'],
  'Chest Dip'         : ['chest', 'tricep', 'front-delt'],
  /* PULL */
  'Deadlift'          : ['lower-back', 'glute', 'hamstring', 'trap', 'lat'],
  'Pull-up'           : ['lat', 'bicep', 'rear-delt'],
  'Barbell Row'       : ['lat', 'mid-trap', 'rear-delt', 'bicep'],
  'Cable Row'         : ['lat', 'mid-trap', 'rear-delt'],
  'Face Pull'         : ['rear-delt', 'mid-trap', 'rotator'],
  'Bicep Curl'        : ['bicep'],
  'Hammer Curl'       : ['bicep', 'brachialis'],
  /* LEGS */
  'Squat'             : ['quad', 'glute', 'hamstring', 'lower-back'],
  'Romanian Deadlift' : ['hamstring', 'glute', 'lower-back'],
  'Leg Press'         : ['quad', 'glute'],
  'Walking Lunge'     : ['quad', 'glute', 'hamstring'],
  'Leg Curl'          : ['hamstring'],
  'Leg Extension'     : ['quad'],
  'Calf Raise'        : ['calf'],
};

/* ══════════════════════════════════════════════
   HEATMAP — muscle fatigue score per muscle
   Scale 0–1 based on recency + volume
   ══════════════════════════════════════════════ */
const Heatmap = (() => {

  /* Compute fatigue scores from last 72h workouts */
  async function compute() {
    const since    = Date.now() - 72 * 3600000;
    const workouts = await DB.Workouts.getAll();
    const recent   = workouts.filter(w => w.timestamp >= since);

    const scores = {};   // muscle → 0..1

    recent.forEach(w => {
      const ageH  = (Date.now() - w.timestamp) / 3600000;  // hours ago
      const decay = Math.max(0, 1 - ageH / 72);             // linear decay

      (w.exercises || []).forEach(ex => {
        const muscles = MUSCLE_MAP[ex.name] || [];
        const doneSets = (ex.sets || []).filter(s => s.done).length;
        const load     = doneSets * decay;
        muscles.forEach(m => {
          scores[m] = Math.min(1, (scores[m] || 0) + load * 0.15);
        });
      });
    });

    return scores;
  }

  /* Color from score: green → amber → red */
  function scoreColor(score) {
    if (!score || score < 0.05) return null;   // fresh
    if (score < 0.3)  return 'rgba(0,230,118,0.55)';   // light
    if (score < 0.6)  return 'rgba(255,179,0,0.65)';   // moderate
    return              'rgba(255,71,87,0.75)';          // heavy
  }

  function scoreLabel(score) {
    if (!score || score < 0.05) return 'Fresh';
    if (score < 0.3)  return 'Warm';
    if (score < 0.6)  return 'Fatigued';
    return              'Heavy';
  }

  return { compute, scoreColor, scoreLabel };
})();

/* ══════════════════════════════════════════════
   SVG BODY — front + back inline SVG
   Each muscle group has data-muscle attribute
   ══════════════════════════════════════════════ */
function buildBodySVG(scores) {
  function fill(muscle) {
    return Heatmap.scoreColor(scores[muscle]) || 'rgba(255,255,255,0.07)';
  }
  function stroke(muscle) {
    const c = Heatmap.scoreColor(scores[muscle]);
    return c ? c.replace(/,[^,]+\)$/, ',0.6)') : 'rgba(255,255,255,0.12)';
  }

  return `
  <svg class="body-svg" viewBox="0 0 240 400" fill="none"
       xmlns="http://www.w3.org/2000/svg">

    <!-- ═══ FRONT ═══ -->
    <text x="60" y="13" text-anchor="middle" font-size="7" font-weight="700"
      letter-spacing="0.1em" fill="rgba(90,96,112,0.7)">FRONT</text>

    <!-- Head -->
    <ellipse cx="60" cy="30" rx="13" ry="15"
      fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
    <!-- Neck -->
    <rect x="55.5" y="43" width="9" height="7" rx="3"
      fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" stroke-width="0.7"/>

    <!-- Torso -->
    <rect x="44" y="50" width="32" height="50" rx="4"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>

    <!-- Upper chest -->
    <path d="M44 50 Q60 47 76 50 L76 63 Q60 60 44 63 Z"
      fill="${fill('upper-chest')}" stroke="${stroke('upper-chest')}" stroke-width="0.7"/>
    <!-- Chest -->
    <path d="M44 63 Q60 60 76 63 L76 78 Q60 75 44 78 Z"
      fill="${fill('chest')}" stroke="${stroke('chest')}" stroke-width="0.7"/>
    <!-- Abs -->
    <rect x="50" y="78" width="20" height="10" rx="2"
      fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="0.6"/>
    <rect x="50" y="90" width="20" height="10" rx="2"
      fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="0.6"/>

    <!-- Front delt L/R -->
    <ellipse cx="38" cy="58" rx="7" ry="8"
      fill="${fill('front-delt')}" stroke="${stroke('front-delt')}" stroke-width="0.7"/>
    <ellipse cx="82" cy="58" rx="7" ry="8"
      fill="${fill('front-delt')}" stroke="${stroke('front-delt')}" stroke-width="0.7"/>
    <!-- Mid delt -->
    <ellipse cx="31" cy="63" rx="5" ry="7"
      fill="${fill('mid-delt')}" stroke="${stroke('mid-delt')}" stroke-width="0.7"/>
    <ellipse cx="89" cy="63" rx="5" ry="7"
      fill="${fill('mid-delt')}" stroke="${stroke('mid-delt')}" stroke-width="0.7"/>

    <!-- Upper arm L -->
    <rect x="24" y="68" width="10" height="22" rx="5"
      fill="${fill('bicep')}" stroke="${stroke('bicep')}" stroke-width="0.7"/>
    <!-- Upper arm R -->
    <rect x="86" y="68" width="10" height="22" rx="5"
      fill="${fill('bicep')}" stroke="${stroke('bicep')}" stroke-width="0.7"/>
    <!-- Forearm L -->
    <rect x="25" y="92" width="8" height="18" rx="4"
      fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="0.7"/>
    <!-- Forearm R -->
    <rect x="87" y="92" width="8" height="18" rx="4"
      fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="0.7"/>

    <!-- Hip -->
    <rect x="44" y="100" width="32" height="14" rx="3"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>

    <!-- Quad L -->
    <rect x="44" y="116" width="14" height="48" rx="7"
      fill="${fill('quad')}" stroke="${stroke('quad')}" stroke-width="0.7"/>
    <!-- Quad R -->
    <rect x="62" y="116" width="14" height="48" rx="7"
      fill="${fill('quad')}" stroke="${stroke('quad')}" stroke-width="0.7"/>

    <!-- Knee L/R -->
    <rect x="44" y="166" width="14" height="10" rx="4"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>
    <rect x="62" y="166" width="14" height="10" rx="4"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>

    <!-- Calf L -->
    <rect x="45" y="178" width="12" height="34" rx="6"
      fill="${fill('calf')}" stroke="${stroke('calf')}" stroke-width="0.7"/>
    <!-- Calf R -->
    <rect x="63" y="178" width="12" height="34" rx="6"
      fill="${fill('calf')}" stroke="${stroke('calf')}" stroke-width="0.7"/>

    <!-- ═══ BACK (offset x+120) ═══ -->
    <text x="180" y="13" text-anchor="middle" font-size="7" font-weight="700"
      letter-spacing="0.1em" fill="rgba(90,96,112,0.7)">BACK</text>

    <!-- Head -->
    <ellipse cx="180" cy="30" rx="13" ry="15"
      fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
    <!-- Neck -->
    <rect x="175.5" y="43" width="9" height="7" rx="3"
      fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" stroke-width="0.7"/>

    <!-- Torso back -->
    <rect x="164" y="50" width="32" height="50" rx="4"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>

    <!-- Trap -->
    <path d="M164 50 Q180 46 196 50 L196 62 Q180 58 164 62 Z"
      fill="${fill('upper-trap')}" stroke="${stroke('upper-trap')}" stroke-width="0.7"/>
    <!-- Mid trap -->
    <path d="M164 62 Q180 58 196 62 L196 72 Q180 68 164 72 Z"
      fill="${fill('mid-trap')}" stroke="${stroke('mid-trap')}" stroke-width="0.7"/>
    <!-- Lats L -->
    <path d="M164 72 L164 92 Q168 100 174 98 L174 72 Z"
      fill="${fill('lat')}" stroke="${stroke('lat')}" stroke-width="0.7"/>
    <!-- Lats R -->
    <path d="M196 72 L196 92 Q192 100 186 98 L186 72 Z"
      fill="${fill('lat')}" stroke="${stroke('lat')}" stroke-width="0.7"/>
    <!-- Lower back -->
    <rect x="172" y="92" width="16" height="16" rx="3"
      fill="${fill('lower-back')}" stroke="${stroke('lower-back')}" stroke-width="0.7"/>

    <!-- Rear delt L/R -->
    <ellipse cx="158" cy="58" rx="7" ry="8"
      fill="${fill('rear-delt')}" stroke="${stroke('rear-delt')}" stroke-width="0.7"/>
    <ellipse cx="202" cy="58" rx="7" ry="8"
      fill="${fill('rear-delt')}" stroke="${stroke('rear-delt')}" stroke-width="0.7"/>
    <!-- Tricep L -->
    <rect x="150" y="68" width="10" height="22" rx="5"
      fill="${fill('tricep')}" stroke="${stroke('tricep')}" stroke-width="0.7"/>
    <!-- Tricep R -->
    <rect x="200" y="68" width="10" height="22" rx="5"
      fill="${fill('tricep')}" stroke="${stroke('tricep')}" stroke-width="0.7"/>
    <!-- Forearm back L -->
    <rect x="151" y="92" width="8" height="18" rx="4"
      fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="0.7"/>
    <!-- Forearm back R -->
    <rect x="201" y="92" width="8" height="18" rx="4"
      fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="0.7"/>

    <!-- Hip back -->
    <rect x="164" y="100" width="32" height="14" rx="3"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>
    <!-- Glute L -->
    <rect x="164" y="116" width="14" height="24" rx="7"
      fill="${fill('glute')}" stroke="${stroke('glute')}" stroke-width="0.7"/>
    <!-- Glute R -->
    <rect x="182" y="116" width="14" height="24" rx="7"
      fill="${fill('glute')}" stroke="${stroke('glute')}" stroke-width="0.7"/>

    <!-- Hamstring L -->
    <rect x="164" y="142" width="14" height="30" rx="7"
      fill="${fill('hamstring')}" stroke="${stroke('hamstring')}" stroke-width="0.7"/>
    <!-- Hamstring R -->
    <rect x="182" y="142" width="14" height="30" rx="7"
      fill="${fill('hamstring')}" stroke="${stroke('hamstring')}" stroke-width="0.7"/>

    <!-- Knee back -->
    <rect x="164" y="174" width="14" height="8" rx="3"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>
    <rect x="182" y="174" width="14" height="8" rx="3"
      fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="0.7"/>

    <!-- Calf back L -->
    <rect x="165" y="184" width="12" height="30" rx="6"
      fill="${fill('calf')}" stroke="${stroke('calf')}" stroke-width="0.7"/>
    <!-- Calf back R -->
    <rect x="183" y="184" width="12" height="30" rx="6"
      fill="${fill('calf')}" stroke="${stroke('calf')}" stroke-width="0.7"/>

  </svg>`;
}


/* ══════════════════════════════════════════════
   RECOVERY LEGEND
   ══════════════════════════════════════════════ */
function buildLegend(scores) {
  const groups = [
    { label: 'Chest & Shoulders', muscles: ['chest','upper-chest','front-delt','mid-delt','rear-delt'] },
    { label: 'Back & Traps',      muscles: ['lat','mid-trap','upper-trap','lower-back'] },
    { label: 'Arms',              muscles: ['bicep','tricep','brachialis'] },
    { label: 'Legs',              muscles: ['quad','hamstring','glute','calf'] },
  ];

  return groups.map(g => {
    const max   = Math.max(...g.muscles.map(m => scores[m] || 0));
    const color = Heatmap.scoreColor(max);
    const label = Heatmap.scoreLabel(max);
    const hours = max > 0.05
      ? Math.round((1 - max) * 72) + 'h to recover'
      : 'Ready';

    return `
      <div class="legend-row">
        <div class="legend-dot" style="background:${color || 'rgba(0,230,118,0.4)'}"></div>
        <div class="legend-info">
          <span class="legend-group">${g.label}</span>
          <span class="legend-status" style="color:${color || 'var(--c-accent)'}">
            ${label}
          </span>
        </div>
        <span class="legend-hours">${hours}</span>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   CLAUDE ASSISTANT — Smart Coach
   ══════════════════════════════════════════════ */
const Claude = (() => {

  let _open = false;

  /* ── Render FAB button ── */
  function renderFAB() {
    if (document.getElementById('claude-fab')) return;
    const fab = document.createElement('button');
    fab.id        = 'claude-fab';
    fab.className = 'claude-fab';
    fab.setAttribute('aria-label', 'Claude AI Coach');
    fab.innerHTML = _claudeIcon();
    fab.addEventListener('click', open);
    document.body.appendChild(fab);
  }

  /* ── Open panel ── */
  async function open() {
    if (_open) return;
    _open = true;

    const [workouts, orms, scores] = await Promise.all([
      DB.Workouts.getLast(5),
      DB.OneRM.getAll(),
      Heatmap.compute(),
    ]);

    const overlay = document.createElement('div');
    overlay.id        = 'claude-overlay';
    overlay.className = 'claude-overlay';

    overlay.innerHTML = `
      <div class="claude-sheet" id="claude-sheet">
        <div class="modal-handle"></div>

        <!-- Header -->
        <div class="claude-header">
          <div class="claude-logo-wrap">
            ${_claudeIcon(28)}
            <div>
              <div class="claude-title">Claude Coach</div>
              <div class="claude-sub">AI-powered recovery insight</div>
            </div>
          </div>
          <button class="btn-icon-sm" onclick="Claude.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Muscle Heatmap -->
        <div class="section-header" style="margin-top:var(--sp-2)">
          <span class="section-label">Muscle Recovery Map</span>
          <span class="badge badge-purple">72h window</span>
        </div>
        <div class="heatmap-card">
          ${buildBodySVG(scores)}
          <div class="heatmap-legend">
            ${buildLegend(scores)}
          </div>
        </div>

        <!-- Legend scale -->
        <div class="heat-scale">
          <div class="heat-scale-bar"></div>
          <div class="heat-scale-labels">
            <span>Fresh</span><span>Warm</span><span>Fatigued</span><span>Heavy</span>
          </div>
        </div>

        <!-- Smart Coach message -->
        <div class="section-header" style="margin-top:var(--sp-2)">
          <span class="section-label">Recommendation</span>
        </div>
        <div class="coach-card">
          ${_buildRecommendation(workouts, scores)}
        </div>

        <!-- Next session -->
        ${_buildNextSession(workouts, scores)}

        <!-- 1RM Progress -->
        ${orms.length ? _buildORMProgress(orms) : ''}

        <div style="height:var(--sp-3)"></div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
  }

  function close() {
    _open = false;
    const overlay = document.getElementById('claude-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 350);
  }

  /* ── Smart recommendation engine ── */
  function _buildRecommendation(workouts, scores) {
    if (!workouts.length) {
      return `<div class="coach-msg">
        <div class="coach-msg-text">
          No workout history yet. Start with a
          <strong style="color:var(--c-accent)">Push Day</strong>
          — it's the best session to begin a PPL program.
        </div>
      </div>`;
    }

    const last = workouts[0];
    const type = last?.type;
    const nextType = { push: 'pull', pull: 'legs', legs: 'push' }[type] || 'push';
    const hoursAgo = Math.round((Date.now() - last.timestamp) / 3600000);

    // Check if most fatigued muscles are from today
    const freshEnough = hoursAgo >= 36;
    const readyMsg    = freshEnough ? 'Your muscles are ready.' : `Still ${Math.max(0,36-hoursAgo)}h of recovery left.`;

    const typeColor = { push:'var(--c-accent)', pull:'var(--c-purple)', legs:'var(--c-blue)' };

    return `
      <div class="coach-msg">
        <div class="coach-msg-text">
          Last session: <strong style="color:${typeColor[type]}">${type?.charAt(0).toUpperCase()+type?.slice(1)} Day</strong>
          ${hoursAgo}h ago. ${readyMsg}
        </div>
        <div class="coach-msg-rec">
          <div class="coach-rec-label">Next recommended</div>
          <div class="coach-rec-type" style="color:${typeColor[nextType]}">
            ${nextType.charAt(0).toUpperCase()+nextType.slice(1)} Day
          </div>
        </div>
      </div>`;
  }

  function _buildNextSession(workouts, scores) {
    if (!workouts.length) return '';

    const last     = workouts[0];
    const nextType = { push:'pull', pull:'legs', legs:'push' }[last?.type] || 'push';
    const plan     = JSON.parse(localStorage.getItem('ap-custom-plan') || 'null');
    const exercises = plan?.[nextType] || [];

    if (!exercises.length) return '';

    return `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Next Session Preview</span>
        <button class="btn-text" onclick="Claude.close();Nav.go('s-train')">Start</button>
      </div>
      <div class="next-session-card">
        ${exercises.slice(0,4).map(ex => `
          <div class="next-ex-row">
            <div class="next-ex-dot" style="background:${
              nextType==='push'?'var(--c-accent)':nextType==='pull'?'var(--c-purple)':'var(--c-blue)'
            }"></div>
            <span class="next-ex-name">${ex.name}</span>
            <span class="next-ex-meta">${ex.sets}×${ex.reps} @ ${ex.weight}kg</span>
          </div>`).join('')}
        ${exercises.length > 4 ? `<div class="next-ex-more">+${exercises.length-4} more exercises</div>` : ''}
      </div>`;
  }

  function _buildORMProgress(orms) {
    const key3 = orms
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    return `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Top Lifts</span>
        <span class="badge badge-purple">Estimated 1RM</span>
      </div>
      <div class="top-lifts-card">
        ${key3.map((o, i) => `
          <div class="top-lift-row">
            <span class="top-lift-rank">#${i+1}</span>
            <span class="top-lift-name">${o.id}</span>
            <span class="top-lift-val">${o.value} <span style="font-size:10px;color:var(--c-text-3)">kg</span></span>
          </div>`).join('')}
      </div>`;
  }

  /* ── Claude icon SVG (Anthropic ∿ style) ── */
  function _claudeIcon(size = 22) {
    return `<svg class="claude-icon" width="${size}" height="${size}"
      viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="12" fill="#CC785C"/>
      <path d="M13 27L20 13L27 27M16 22.5H24"
        stroke="white" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  return { renderFAB, open, close };

})();

/* ── Auto-render FAB when DOM ready ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Claude.renderFAB());
} else {
  Claude.renderFAB();
}
