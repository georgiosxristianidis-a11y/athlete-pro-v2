// @ts-check
/* ════════════════════════════════════════════════════════
   onboarding.js — First-run 3-step wizard
   Step 1: Goal  →  Step 2: Experience  →  Step 3: Ready

   Shown once (guarded by Settings key 'onboarding-complete').
   Saves:  ap-goal, ap-experience  to DB.Settings.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

/* ── Icon SVGs for option cards ── */
const SVG = {
  strength: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6.5" y1="12" x2="17.5" y2="12"/>
    <rect x="3" y="9" width="3" height="6" rx="1"/>
    <rect x="18" y="9" width="3" height="6" rx="1"/>
    <line x1="2" y1="11" x2="2" y2="13"/>
    <line x1="22" y1="11" x2="22" y2="13"/>
  </svg>`,

  hypertrophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2C8 2 4 5.5 4 10c0 5 5 10 8 12 3-2 8-7 8-12 0-4.5-4-8-8-8z"/>
  </svg>`,

  endurance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>`,

  beginner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v4l3 3"/>
  </svg>`,

  intermediate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>`,

  advanced: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,

  barbell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6.5" y1="12" x2="17.5" y2="12"/>
    <rect x="3" y="9" width="3" height="6" rx="1"/>
    <rect x="18" y="9" width="3" height="6" rx="1"/>
    <line x1="2" y1="11" x2="2" y2="13"/>
    <line x1="22" y1="11" x2="22" y2="13"/>
  </svg>`,
};

const STEPS = 3;
let _step = 1;
let _goal = '';
let _exp  = '';
let _overlay = null;

/**
 * Check if onboarding has been completed.
 * @returns {Promise<boolean>}
 */
export async function needsOnboarding() {
  const done = await DB.Settings.get('onboarding-complete', false);
  return !done;
}

/**
 * Show onboarding wizard and return a promise that resolves when complete.
 * @returns {Promise<void>}
 */
export function showOnboarding() {
  return new Promise((resolve) => {
    _step = 1;
    _goal = '';
    _exp  = '';

    _overlay = document.createElement('div');
    _overlay.id = 'onboarding-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Setup wizard');

    _overlay.style.cssText = `
      position: fixed; inset: 0;
      background: var(--c-bg);
      z-index: 8000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--sp-3) var(--sp-2);
      overflow-y: auto;
    `;

    _overlay._resolve = resolve;
    document.body.appendChild(_overlay);
    _render(resolve);
  });
}

function _render(resolve) {
  _overlay.innerHTML = _buildStep(_step, resolve);

  // Animate in
  _overlay.style.opacity = '0';
  requestAnimationFrame(() => {
    _overlay.style.transition = 'opacity 0.25s ease';
    _overlay.style.opacity = '1';
  });
}

function _buildStep(step, resolve) {
  const progress = `
    <div style="display:flex;gap:6px;margin-bottom:var(--sp-4)">
      ${[1,2,3].map(i => `
        <div style="
          height:3px; border-radius:2px; flex:1;
          background:${i <= step ? 'var(--c-accent)' : 'var(--c-bg-3)'};
          transition: background 0.3s ease;
        "></div>
      `).join('')}
    </div>`;

  const logo = `
    <div style="margin-bottom:var(--sp-4);text-align:center">
      <img src="icons/icon-192.png" alt="Athlete Pro"
        style="width:56px;height:56px;border-radius:16px;margin-bottom:var(--sp-2)"/>
      <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;
        text-transform:uppercase;color:var(--c-text-3)">Step ${step} of ${STEPS}</div>
    </div>`;

  if (step === 1) return _buildGoalStep(progress, logo, resolve);
  if (step === 2) return _buildExpStep(progress, logo, resolve);
  return _buildReadyStep(progress, logo, resolve);
}

function _card(key, icon, label, sub, color) {
  return `
    <button class="ob-card" data-key="${key}"
      onclick="window._obSelect(this)"
      style="
        flex:1; min-width:0;
        display:flex; flex-direction:column; align-items:center;
        gap:var(--sp-1); padding:var(--sp-2) var(--sp-1);
        background:var(--c-surface);
        border:1.5px solid var(--c-border);
        border-radius:var(--r-l);
        cursor:pointer;
        transition:all 0.18s ease;
        -webkit-tap-highlight-color:transparent;
      ">
      <div style="
        width:44px; height:44px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        background:${color}1a; color:${color};
      ">${icon}</div>
      <div style="font-size:13px;font-weight:700;color:var(--c-text-1)">${label}</div>
      <div style="font-size:10px;font-weight:500;color:var(--c-text-3);text-align:center;line-height:1.3">${sub}</div>
    </button>`;
}

function _buildGoalStep(progress, logo, resolve) {
  return `
    <div style="width:100%;max-width:420px">
      ${progress}
      ${logo}
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.03em;
        color:var(--c-text-1);text-align:center;margin-bottom:6px">
        What's your goal?
      </h1>
      <p style="font-size:13px;font-weight:500;color:var(--c-text-3);
        text-align:center;margin-bottom:var(--sp-3)">
        We'll tailor your program and AI coach to match.
      </p>
      <div style="display:flex;gap:var(--sp-1);margin-bottom:var(--sp-3)">
        ${_card('strength',    SVG.strength,    'Strength',    '1–5 reps<br>Heavy lifts',  'var(--c-accent)')}
        ${_card('hypertrophy', SVG.hypertrophy, 'Size',        '6–15 reps<br>Max muscle',  'var(--c-purple)')}
        ${_card('endurance',   SVG.endurance,   'Endurance',   '15+ reps<br>High volume',  'var(--c-blue)')}
      </div>
      <button id="ob-next-1" onclick="window._obNext1()" disabled
        style="
          width:100%; height:52px;
          background:var(--c-accent); color:#000;
          border:none; border-radius:var(--r-m);
          font-size:15px; font-weight:700; cursor:pointer;
          opacity:0.4; transition:opacity 0.18s ease;
          -webkit-tap-highlight-color:transparent;
        ">
        Continue
      </button>
    </div>
  `;
}

function _buildExpStep(progress, logo, resolve) {
  return `
    <div style="width:100%;max-width:420px">
      ${progress}
      ${logo}
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.03em;
        color:var(--c-text-1);text-align:center;margin-bottom:6px">
        Training experience?
      </h1>
      <p style="font-size:13px;font-weight:500;color:var(--c-text-3);
        text-align:center;margin-bottom:var(--sp-3)">
        Helps us set realistic starting weights and volume.
      </p>
      <div style="display:flex;gap:var(--sp-1);margin-bottom:var(--sp-3)">
        ${_card('beginner',     SVG.beginner,     'Beginner',     'Under 1 year',  'var(--c-accent)')}
        ${_card('intermediate', SVG.intermediate, 'Intermediate', '1–3 years',     'var(--c-amber)')}
        ${_card('advanced',     SVG.advanced,     'Advanced',     '3+ years',      'var(--c-purple)')}
      </div>
      <button id="ob-next-2" onclick="window._obNext2()" disabled
        style="
          width:100%; height:52px;
          background:var(--c-accent); color:#000;
          border:none; border-radius:var(--r-m);
          font-size:15px; font-weight:700; cursor:pointer;
          opacity:0.4; transition:opacity 0.18s ease;
          -webkit-tap-highlight-color:transparent;
        ">
        Continue
      </button>
    </div>
  `;
}

function _buildReadyStep(progress, logo, resolve) {
  const goalLabel = { strength: 'Strength', hypertrophy: 'Hypertrophy', endurance: 'Endurance' }[_goal];
  const expLabel  = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[_exp];
  const goalColor = { strength: 'var(--c-accent)', hypertrophy: 'var(--c-purple)', endurance: 'var(--c-blue)' }[_goal];

  return `
    <div style="width:100%;max-width:420px;text-align:center">
      ${progress}
      <div style="
        width:72px; height:72px; border-radius:50%;
        background:var(--c-accent-bg); color:var(--c-accent);
        display:flex; align-items:center; justify-content:center;
        margin:0 auto var(--sp-3);
      ">${SVG.check}</div>
      <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.03em;
        color:var(--c-text-1);margin-bottom:8px">
        You're all set.
      </h1>
      <p style="font-size:14px;font-weight:500;color:var(--c-text-3);margin-bottom:var(--sp-3)">
        Your profile is saved. The AI coach will use it to personalize every session.
      </p>

      <div style="
        display:flex; gap:var(--sp-1); justify-content:center;
        margin-bottom:var(--sp-4);
      ">
        <div style="
          padding:6px 14px; border-radius:var(--r-m);
          background:${goalColor}1a; color:${goalColor};
          font-size:12px; font-weight:700;
        ">${goalLabel}</div>
        <div style="
          padding:6px 14px; border-radius:var(--r-m);
          background:var(--c-surface); border:1px solid var(--c-border);
          color:var(--c-text-2); font-size:12px; font-weight:700;
        ">${expLabel}</div>
      </div>

      <button onclick="window._obFinish()"
        style="
          width:100%; height:56px;
          background:var(--c-accent); color:#000;
          border:none; border-radius:var(--r-m);
          font-size:16px; font-weight:800; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          gap:10px;
          -webkit-tap-highlight-color:transparent;
          box-shadow:0 0 24px rgba(0,230,118,0.3);
        ">
        ${SVG.barbell}
        Start First Workout
      </button>
      <button onclick="window._obSkipToHome()"
        style="
          width:100%; height:44px; margin-top:var(--sp-1);
          background:none; border:none;
          color:var(--c-text-3); font-size:13px; font-weight:500;
          cursor:pointer; -webkit-tap-highlight-color:transparent;
        ">
        Go to dashboard instead
      </button>
    </div>
  `;
}

/* ── Global handlers (called from onclick in injected HTML) ── */

window._obSelect = (card) => {
  const parent = card.closest('[style]');
  parent.querySelectorAll('.ob-card').forEach((c) => {
    c.style.borderColor = 'var(--c-border)';
    c.style.background  = 'var(--c-surface)';
    c.removeAttribute('aria-pressed');
  });
  card.style.borderColor = 'var(--c-accent)';
  card.style.background  = 'var(--c-accent-bg)';
  card.setAttribute('aria-pressed', 'true');

  // Enable the Continue button
  const nextBtn = document.getElementById('ob-next-1') || document.getElementById('ob-next-2');
  if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = '1'; }

  if (_step === 1) _goal = card.dataset.key;
  if (_step === 2) _exp  = card.dataset.key;
};

window._obNext1 = async () => {
  if (!_goal) return;
  _step = 2;
  _overlay.style.opacity = '0';
  await _delay(200);
  _render(_overlay._resolve);
};

window._obNext2 = async () => {
  if (!_exp) return;
  _step = 3;
  _overlay.style.opacity = '0';
  await _delay(200);
  _render(_overlay._resolve);
};

window._obFinish = async () => {
  await _save();
  _close();
  window.Nav.go('s-train', { force: true });
};

window._obSkipToHome = async () => {
  await _save();
  _close();
  window.Dashboard.load();
};

async function _save() {
  await Promise.all([
    DB.Settings.set('ap-goal', _goal || 'strength'),
    DB.Settings.set('ap-experience', _exp || 'beginner'),
    DB.Settings.set('onboarding-complete', true),
  ]);
}

function _close() {
  if (!_overlay) return;
  _overlay.style.opacity = '0';
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 280);
}

function _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
