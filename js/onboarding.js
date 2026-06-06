// @ts-check
/* ════════════════════════════════════════════════════════
   onboarding.js — Modern 6-step setup wizard
   Step 1: Goal
   Step 2: Experience
   Step 3: Bio (Sex / DOB)
   Step 4: Metrics (Height / Weight)
   Step 5: Privacy (Cloud / Airgap)
   Step 6: Ready

   Shown once (guarded by Settings key 'onboarding-complete').
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { setPrivacyMode, setAiEnabled } from './privacy.store.js';

const SVG = {
  strength: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6.5" y1="12" x2="17.5" y2="12"/><rect x="3" y="9" width="3" height="6" rx="1"/><rect x="18" y="9" width="3" height="6" rx="1"/><line x1="2" y1="11" x2="2" y2="13"/><line x1="22" y1="11" x2="22" y2="13"/></svg>`,
  hypertrophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 4 5.5 4 10c0 5 5 10 8 12 3-2 8-7 8-12 0-4.5-4-8-8-8z"/></svg>`,
  endurance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  beginner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>`,
  intermediate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  advanced: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-3.9-4.5-1.1-3.1-4-5.4-7.4-5.4-4 0-7.3 3.1-7.7 7.1C1.1 12.3 0 14 0 16c0 3.3 2.7 6 6 6h11.5"/></svg>`,
};

const STEPS = 6;
let _step = 1;
let _data = {
  goal: '',
  exp: '',
  sex: 'm',
  dob: '',
  height: '',
  weight: '',
  privacy: 'airgap',
};
let _overlay = null;

export async function needsOnboarding() {
  const done = await DB.Settings.get('onboarding-complete', false);
  return !done;
}

export function showOnboarding() {
  return new Promise((resolve) => {
    _step = 1;
    _overlay = document.createElement('div');
    _overlay.id = 'onboarding-overlay';
    _overlay.style.cssText = `
      position: fixed; inset: 0; background: var(--c-bg); z-index: 9000;
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
      padding: env(safe-area-inset-top, 20px) var(--sp-2) 40px; overflow-y: auto;
    `;
    _overlay._resolve = resolve;
    document.body.appendChild(_overlay);
    _render();
  });
}

function _render() {
  const ru = false; // Default to English for first-run
  _overlay.innerHTML = `
    <div style="width:100%; max-width:420px; display:flex; flex-direction:column; gap:var(--sp-4); padding-top:20px">
      <!-- Progress Bar -->
      <div style="display:flex; gap:6px">
        ${Array.from({length: STEPS}).map((_, i) => `
          <div style="height:4px; border-radius:2px; flex:1; background:${i + 1 <= _step ? 'var(--c-accent)' : 'var(--c-bg-3)'}; transition: background 0.3s ease;"></div>
        `).join('')}
      </div>

      <!-- Step Content -->
      ${_buildStep(ru)}
    </div>
  `;
}

function _buildStep(ru) {
  if (_step === 1) return _stepGoal(ru);
  if (_step === 2) return _stepExp(ru);
  if (_step === 3) return _stepBio(ru);
  if (_step === 4) return _stepMetrics(ru);
  if (_step === 5) return _stepPrivacy(ru);
  if (_step === 99) return _stepQuickConfirm(ru);
  return _stepReady(ru);
}

function _stepGoal(ru) {
  return `
    <div class="animate-in">
      <h1 style="font-size:28px; font-weight:900; letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:8px">
        ${ru ? 'Твоя цель?' : 'Your goal?'}
      </h1>
      <p style="font-size:15px; font-weight:500; color:var(--c-text-3); margin-bottom:32px">
        ${ru ? 'Мы адаптируем программу и коуча под тебя.' : 'We\'ll tailor your program and AI coach to match.'}
      </p>
      <div style="display:grid; gap:var(--sp-1)">
        ${_choiceCard('strength', SVG.strength, ru ? 'Сила' : 'Strength', ru ? '1–5 повторов' : '1–5 reps', 'var(--c-accent)')}
        ${_choiceCard('hypertrophy', SVG.hypertrophy, ru ? 'Масса' : 'Size', ru ? '6–12 повторов' : '6–12 reps', 'var(--c-purple)')}
        ${_choiceCard('endurance', SVG.endurance, ru ? 'Выносливость' : 'Endurance', ru ? '15+ повторов' : '15+ reps', 'var(--c-blue)')}
      </div>
      
      <div style="margin-top:32px; text-align:center">
        <button onclick="window._obQuickStart()" 
                style="background:none; border:none; color:var(--c-text-3); font-size:14px; font-weight:700; cursor:pointer; text-decoration:underline; text-underline-offset:4px">
          ${ru ? 'Пропустить и начать (Анонимно)' : 'Quick Start (Anonymous)'}
        </button>
      </div>
    </div>
    ${_navButtons(ru, !!_data.goal)}
  `;
}

function _stepQuickConfirm(ru) {
  return `
    <div class="animate-in">
      <h1 style="font-size:28px; font-weight:900; letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:8px">
        ${ru ? 'Режим работы' : 'Privacy Confirmation'}
      </h1>
      <p style="font-size:15px; font-weight:500; color:var(--c-text-3); margin-bottom:32px">
        ${ru ? 'По умолчанию: Полная анонимность.' : 'Default: Full anonymity enabled.'}
      </p>
      <div style="display:grid; gap:var(--sp-1)">
        ${_choiceCard('airgap', SVG.shield, ru ? 'Анонимно (Off-line)' : 'Private (Offline)', ru ? 'Данные только в телефоне.' : 'All data stays on this device.', 'var(--c-accent)')}
        ${_choiceCard('cloud', SVG.cloud, ru ? 'Облако (Опционально)' : 'Cloud (Optional)', ru ? 'Синхронизация между устройствами.' : 'Sync data across devices.', 'var(--c-blue)')}
      </div>
      <p style="font-size:13px; font-weight:500; color:var(--c-text-3); margin-top:24px; text-align:center; line-height:1.4">
        ${ru ? 'Остальные данные (вес, возраст) можно будет настроить позже в профиле.' : 'Other bio-metrics (weight, age) can be set later in your profile.'}
      </p>
    </div>
    <div style="display:flex; gap:12px; margin-top:auto; padding-top:32px">
      <button onclick="window._obPrev()" style="flex:1; height:52px; background:none; border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-2); font-size:15px; font-weight:700; cursor:pointer">${ru ? 'Назад' : 'Back'}</button>
      <button onclick="window._obFinish()" 
              style="flex:2; height:52px; background:var(--c-accent); color:#000; border:none; border-radius:var(--r-m); font-size:15px; font-weight:800; cursor:pointer; box-shadow:0 8px 16px rgba(0,230,118,0.2)">
        ${ru ? 'Погнали!' : 'Let\'s Go!'}
      </button>
    </div>
  `;
}

function _stepExp(ru) {
  return `
    <div class="animate-in">
      <h1 style="font-size:28px; font-weight:900; letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:8px">
        ${ru ? 'Опыт тренировок?' : 'Training experience?'}
      </h1>
      <p style="font-size:15px; font-weight:500; color:var(--c-text-3); margin-bottom:32px">
        ${ru ? 'Помогает установить стартовые веса.' : 'Helps us set realistic starting weights.'}
      </p>
      <div style="display:grid; gap:var(--sp-1)">
        ${_choiceCard('beginner', SVG.beginner, ru ? 'Новичок' : 'Beginner', ru ? 'До 1 года' : 'Under 1 year', 'var(--c-accent)')}
        ${_choiceCard('intermediate', SVG.intermediate, ru ? 'Средний' : 'Intermediate', ru ? '1–3 года' : '1–3 years', 'var(--c-amber)')}
        ${_choiceCard('advanced', SVG.advanced, ru ? 'Продвинутый' : 'Advanced', ru ? '3+ года' : '3+ years', 'var(--c-purple)')}
      </div>
    </div>
    ${_navButtons(ru, !!_data.exp)}
  `;
}

function _stepBio(ru) {
  return `
    <div class="animate-in">
      <h1 style="font-size:28px; font-weight:900; letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:8px">
        ${ru ? 'Немного о тебе' : 'Tell us about you'}
      </h1>
      <p style="font-size:15px; font-weight:500; color:var(--c-text-3); margin-bottom:32px">
        ${ru ? 'Для точного расчета уровня силы.' : 'For accurate strength tier comparisons.'}
      </p>
      <div style="display:grid; gap:var(--sp-2)">
        <div>
          <label style="display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:8px">
            ${ru ? 'Пол' : 'Sex'}
          </label>
          <div style="display:flex; gap:10px">
            <button class="ob-btn-tab ${_data.sex === 'm' ? 'active' : ''}" onclick="window._obSetData({sex:'m'})" style="flex:1">${ru ? 'М' : 'Male'}</button>
            <button class="ob-btn-tab ${_data.sex === 'f' ? 'active' : ''}" onclick="window._obSetData({sex:'f'})" style="flex:1">${ru ? 'Ж' : 'Female'}</button>
          </div>
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:8px">
            ${ru ? 'Дата рождения' : 'Date of Birth'}
          </label>
          <input type="date" value="${_data.dob}" onchange="window._obSetData({dob:this.value})" 
                 style="width:100%; height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-family:inherit; font-size:16px; padding:0 16px; box-sizing:border-box">
        </div>
      </div>
    </div>
    ${_navButtons(ru, !!_data.sex && !!_data.dob)}
  `;
}

function _stepMetrics(ru) {
  return `
    <div class="animate-in">
      <h1 style="font-size:28px; font-weight:900; letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:8px">
        ${ru ? 'Рост и Вес' : 'Body Metrics'}
      </h1>
      <p style="font-size:15px; font-weight:500; color:var(--c-text-3); margin-bottom:32px">
        ${ru ? 'Мы вычислим твой ИМТ и DOTS.' : 'We\'ll compute your BMI and DOTS score.'}
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-2)">
        <div>
          <label style="display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:8px">
            ${ru ? 'Рост (см)' : 'Height (cm)'}
          </label>
          <input type="number" value="${_data.height}" placeholder="180" oninput="window._obSetData({height:this.value})" 
                 style="width:100%; height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-family:inherit; font-size:18px; font-weight:700; padding:0 16px; box-sizing:border-box">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:8px">
            ${ru ? 'Вес (кг)' : 'Weight (kg)'}
          </label>
          <input type="number" value="${_data.weight}" placeholder="80" oninput="window._obSetData({weight:this.value})" 
                 style="width:100%; height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-family:inherit; font-size:18px; font-weight:700; padding:0 16px; box-sizing:border-box">
        </div>
      </div>
    </div>
    ${_navButtons(ru, !!_data.height && !!_data.weight)}
  `;
}

function _stepPrivacy(ru) {
  return `
    <div class="animate-in">
      <h1 style="font-size:28px; font-weight:900; letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:8px">
        ${ru ? 'Приватность' : 'Privacy First'}
      </h1>
      <p style="font-size:15px; font-weight:500; color:var(--c-text-3); margin-bottom:32px">
        ${ru ? 'Где хранить твои данные?' : 'Where should we store your data?'}
      </p>
      <div style="display:grid; gap:var(--sp-1)">
        ${_choiceCard('airgap', SVG.shield, ru ? 'Анонимно (Off-line)' : 'Private (Offline)', ru ? 'Все данные только в телефоне.' : 'All data stays on this device.', 'var(--c-accent)')}
        ${_choiceCard('cloud', SVG.cloud, ru ? 'Облако (Опционально)' : 'Cloud (Optional)', ru ? 'Синхронизация между устройствами.' : 'Sync data across devices.', 'var(--c-blue)')}
      </div>
    </div>
    ${_navButtons(ru, true)}
  `;
}

function _stepReady(ru) {
  return `
    <div class="animate-in" style="text-align:center">
      <div style="width:80px; height:80px; border-radius:50%; background:var(--c-accent-bg); color:var(--c-accent); display:flex; align-items:center; justify-content:center; margin:0 auto 24px">
        ${SVG.check}
      </div>
      <h1 style="font-size:32px; font-weight:900; letter-spacing:-0.05em; color:var(--c-text-1); margin-bottom:12px">
        ${ru ? 'Все готово.' : 'You\'re set.'}
      </h1>
      <p style="font-size:16px; font-weight:500; color:var(--c-text-3); line-height:1.5; margin-bottom:40px">
        ${ru ? 'Твой профиль настроен. Начнем тренировку?' : 'Your athlete profile is ready. Let\'s start training.'}
      </p>
      <button onclick="window._obFinish()" style="width:100%; height:56px; background:var(--c-accent); color:#000; border:none; border-radius:var(--r-m); font-size:17px; font-weight:800; cursor:pointer; box-shadow:0 12px 24px rgba(0,230,118,0.25)">
        ${ru ? 'Начать тренировку' : 'Start First Workout'}
      </button>
    </div>
  `;
}

function _choiceCard(key, icon, label, sub, color) {
  const active = _step === 1 ? _data.goal === key : _step === 2 ? _data.exp === key : _data.privacy === key;
  return `
    <button class="ob-card ${active ? 'active' : ''}" onclick="window._obSelect('${key}')" 
            style="--active-c:${color}; display:flex; align-items:center; gap:16px; padding:20px; background:var(--c-surface); border:1.5px solid ${active ? color : 'var(--c-border)'}; border-radius:var(--r-l); cursor:pointer; text-align:left; transition:all 0.2s ease;">
      <div style="width:48px; height:48px; border-radius:14px; background:${color}15; color:${color}; display:flex; align-items:center; justify-content:center; flex-shrink:0">
        ${icon}
      </div>
      <div style="flex:1">
        <div style="font-size:16px; font-weight:800; color:var(--c-text-1)">${label}</div>
        <div style="font-size:13px; font-weight:500; color:var(--c-text-3); margin-top:2px">${sub}</div>
      </div>
    </button>`;
}

function _navButtons(ru, canNext) {
  return `
    <div style="display:flex; gap:12px; margin-top:auto; padding-top:32px">
      ${_step > 1 ? `<button onclick="window._obPrev()" style="flex:1; height:52px; background:none; border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-2); font-size:15px; font-weight:700; cursor:pointer">${ru ? 'Назад' : 'Back'}</button>` : ''}
      <button onclick="window._obNext()" ${canNext ? '' : 'disabled'} 
              style="flex:2; height:52px; background:var(--c-accent); color:#000; border:none; border-radius:var(--r-m); font-size:15px; font-weight:800; cursor:pointer; opacity:${canNext ? 1 : 0.4}">
        ${ru ? 'Продолжить' : 'Continue'}
      </button>
    </div>
  `;
}

/* ── Handlers ── */

window._obQuickStart = () => {
  _step = 99; // Special Quick Confirm step
  _data.goal = _data.goal || 'hypertrophy';
  _data.exp = _data.exp || 'intermediate';
  _data.sex = 'm';
  _data.dob = '1995-01-01';
  _data.weight = '80';
  _data.height = '180';
  _data.privacy = 'airgap';
  _render();
};

window._obSelect = (key) => {
  if (_step === 1) _data.goal = key;
  if (_step === 2) _data.exp = key;
  if (_step === 5 || _step === 99) _data.privacy = key;
  _render();
};

window._obSetData = (patch) => {
  _data = { ..._data, ...patch };
  _render();
};

window._obNext = () => { if (_step < STEPS) { _step++; _render(); } };
window._obPrev = () => { if (_step > 1) { _step--; _render(); } };

window._obFinish = async () => {
  await Promise.all([
    DB.Settings.set('profile.goal', _data.goal),
    DB.Settings.set('profile.experienceYears', _data.exp === 'beginner' ? 0 : _data.exp === 'intermediate' ? 2 : 5),
    DB.Settings.set('profile.sex', _data.sex),
    DB.Settings.set('profile.dob', _data.dob),
    DB.Metrics.save(Number(_data.weight), Number(_data.height)),
    setPrivacyMode(_data.privacy),
    setAiEnabled(_data.privacy !== 'airgap'),
    DB.Settings.set('onboarding-complete', true),
  ]);
  _overlay.style.opacity = '0';
  setTimeout(() => {
    _overlay._resolve();
    _overlay.remove();
    window.Nav.go('s-train', { force: true });
  }, 300);
};

/* ── Styles ── */
const style = document.createElement('style');
style.textContent = `
  .animate-in { animation: ob-fade-in 0.4s cubic-bezier(0.4, 0, 0.2, 1) both; }
  @keyframes ob-fade-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  .ob-btn-tab { background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-3); padding:12px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all 0.2s; }
  .ob-btn-tab.active { background:var(--c-accent-bg); border-color:var(--c-accent); color:var(--c-accent); }
`;
document.head.appendChild(style);
