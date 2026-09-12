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
import { on, onChange, onInput } from './events.js';
import { t, getLang, setLang } from './locale.store.js';
import { blockTicks } from './shared/block-ticks.js';
import { esc } from './shared/utils.js';

on('ob:quickStart', () => window._obQuickStart());
on('ob:skipBack', () => window._obSkipBack());
on('ob:prev', () => window._obPrev());
on('ob:next', () => window._obNext());
on('ob:finish', () => window._obFinish());
on('ob:select', (el) => window._obSelect(el.dataset.key));
on('ob:setData', (el) => window._obSetData({ [el.dataset.key]: el.dataset.value }));
on('ob:setLang', (el) => {
  const lang = el.dataset.lang;
  if (lang !== 'en' && lang !== 'ru') return;
  setLang(lang).then(() => _render());
});
onInput('ob:setField', (el, e) => window._obSetData({ [el.dataset.key]: e.target.value }));
onChange('ob:setDob', (el, e) => window._obSetDob(el.dataset.part, e.target.value));

const SVG = {
  strength: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6.5" y1="12" x2="17.5" y2="12"/><rect x="3" y="9" width="3" height="6" rx="1"/><rect x="18" y="9" width="3" height="6" rx="1"/><line x1="2" y1="11" x2="2" y2="13"/><line x1="22" y1="11" x2="22" y2="13"/></svg>`,
  hypertrophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 4 5.5 4 10c0 5 5 10 8 12 3-2 8-7 8-12 0-4.5-4-8-8-8z"/></svg>`,
  endurance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  beginner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>`,
  intermediate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  advanced: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  cloud: `<svg viewBox="-2 -2 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-3.9-4.5-1.1-3.1-4-5.4-7.4-5.4-4 0-7.3 3.1-7.7 7.1-2 .3-3.5 2-3.5 4 0 2.2 1.8 4 4 4h11.5"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
  anonymous: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M18 21a6 6 0 0 0-12 0"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`,
};

const STEPS = 6;
/** Local-only (`ap-` skips sync in db/settings.js). Incomplete PII stays on device. */
export const ONBOARDING_DRAFT_KEY = 'ap-onboarding-draft';
export const SKIP_PLACEHOLDERS = Object.freeze({
  goal: 'hypertrophy',
  exp: 'intermediate',
  sex: 'm',
  dob: '1995-01-01',
  weight: '80',
  height: '180',
  privacy: 'airgap',
});
const DATA_KEYS = /** @type {const} */ ([
  'goal',
  'exp',
  'sex',
  'dob',
  'height',
  'weight',
  'privacy',
]);

function blankOnboardingData() {
  return {
    goal: '',
    exp: '',
    sex: '',
    dob: '',
    height: '',
    weight: '',
    privacy: '',
  };
}

export function isSexChosen(sex) {
  return sex === 'm' || sex === 'f';
}

export function isPrivacyChosen(mode) {
  return mode === 'airgap' || mode === 'cloud';
}

export function canAdvanceFromStep(step, data) {
  if (step === 1) return !!data.goal;
  if (step === 2) return !!data.exp;
  if (step === 3) {
    return isSexChosen(data.sex) && !!data.dob && data.dob.split('-').length === 3;
  }
  if (step === 4) return !!data.height && !!data.weight;
  if (step === 5) return isPrivacyChosen(data.privacy);
  return true;
}

let _step = 1;
let _data = blankOnboardingData();
let _skipConfirm = false;
let _overlay = null;

function isValidStep(n) {
  return Number.isInteger(n) && n >= 1 && n <= STEPS;
}

function sanitizeData(raw) {
  const out = blankOnboardingData();
  if (!raw || typeof raw !== 'object') return out;
  for (const k of DATA_KEYS) {
    if (typeof raw[k] === 'string') out[k] = raw[k];
  }
  return out;
}

export function snapshotOnboarding() {
  return { step: _step, data: { ..._data }, skipConfirm: _skipConfirm };
}

export async function persistOnboardingDraft() {
  await DB.Settings.set(ONBOARDING_DRAFT_KEY, {
    step: _step,
    data: { ..._data },
    skipConfirm: _skipConfirm,
  });
}

export async function restoreOnboardingDraft() {
  const draft = await DB.Settings.get(ONBOARDING_DRAFT_KEY, null);
  if (!draft || typeof draft !== 'object' || !isValidStep(draft.step)) {
    _step = 1;
    _data = blankOnboardingData();
    _skipConfirm = false;
    return false;
  }
  _step = draft.step;
  _data = sanitizeData(draft.data);
  _skipConfirm = draft.skipConfirm === true;
  return true;
}

export async function clearOnboardingDraft() {
  await DB.Settings.set(ONBOARDING_DRAFT_KEY, null);
}

export async function commitOnboarding() {
  if (!isSexChosen(_data.sex)) throw new Error('onboarding: sex required');
  if (!isPrivacyChosen(_data.privacy)) throw new Error('onboarding: privacy required');
  await Promise.all([
    DB.Settings.set('profile.goal', _data.goal),
    DB.Settings.set(
      'profile.experienceYears',
      _data.exp === 'beginner' ? 0 : _data.exp === 'intermediate' ? 2 : 5
    ),
    DB.Settings.set('profile.sex', _data.sex),
    DB.Settings.set('sex', _data.sex), // legacy mirror — body-stats Navy formula
    DB.Settings.set('profile.dob', _data.dob),
    DB.Metrics.save(Number(_data.weight), Number(_data.height)),
    setPrivacyMode(_data.privacy),
    setAiEnabled(_data.privacy !== 'airgap'),
    DB.Settings.set('onboarding-complete', true),
    clearOnboardingDraft(),
  ]);
}

export async function needsOnboarding() {
  const done = await DB.Settings.get('onboarding-complete', false);
  return !done;
}

/** F-11: шелл под оверлеем не в таб-порядке и не читается AT. FAB — сосед #app. */
export function setShellInert(on) {
  for (const id of ['app', 'claude-fab-container']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.inert = on;
    if (on) el.setAttribute('aria-hidden', 'true');
    else el.removeAttribute('aria-hidden');
  }
}

export async function showOnboarding() {
  await restoreOnboardingDraft();
  return new Promise((resolve) => {
    _overlay = document.createElement('div');
    _overlay.id = 'onboarding-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-labelledby', 'ob-title');
    _overlay.style.cssText = `
      position: fixed; inset: 0; background: var(--c-bg); z-index: 9000;
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
      padding: env(safe-area-inset-top, 20px) var(--sp-2) var(--sp-5); overflow-y: auto;
    `;
    _overlay._resolve = resolve;
    document.body.appendChild(_overlay);
    setShellInert(true);
    _render();
    const title = _overlay.querySelector('h1');
    if (title && typeof title.focus === 'function') title.focus();
  });
}

function _langToggle() {
  const lang = getLang();
  return `
      <div class="ob-lang" role="group" aria-label="${esc(t('settings.lang'))}">
        <button type="button" class="ob-lang-btn ${lang !== 'ru' ? 'active' : ''}"
                data-action="ob:setLang" data-lang="en" aria-pressed="${lang !== 'ru'}">EN</button>
        <button type="button" class="ob-lang-btn ${lang === 'ru' ? 'active' : ''}"
                data-action="ob:setLang" data-lang="ru" aria-pressed="${lang === 'ru'}">RU</button>
      </div>`;
}

function _render() {
  if (!_overlay) return;
  _overlay.innerHTML = `
    <div style="width:100%; max-width:420px; display:flex; flex-direction:column; gap:var(--sp-4); padding-top:var(--sp-3); position:relative; z-index:1;">
      ${_langToggle()}
      ${
        _skipConfirm
          ? ''
          : `<!-- Progress Bar — общая шкала этапов (js/shared/block-ticks.js).
           Была набором inline-стилей; вынесена, чтобы свечение и заливка
           жили в одном месте с полосками блоков в логгере сетов. -->
      <div style="padding: 0 var(--sp-2);">
        ${blockTicks({ index: _step - 1, total: STEPS, variant: 'bar', label: t('ob.step') })}
      </div>`
      }

      <!-- Step Content -->
      <div style="padding: 0 var(--sp-2);">
        ${_skipConfirm ? _stepSkipConfirm() : _buildStep()}
      </div>
    </div>
  `;
  const title = _overlay.querySelector('h1');
  if (title) {
    title.id = 'ob-title';
    title.tabIndex = -1;
  }
}

function _buildStep() {
  if (_step === 1) return _stepGoal();
  if (_step === 2) return _stepExp();
  if (_step === 3) return _stepBio();
  if (_step === 4) return _stepMetrics();
  if (_step === 5) return _stepPrivacy();
  return _stepReady();
}

function _stepGoal() {
  return `
    <div class="animate-in" style="display:flex; flex-direction:column; min-height: 70vh;">
      <div style="margin-bottom: var(--sp-5); position: relative;">
        <!-- Premium Hero Background Glow -->
        <div style="position:absolute; top:-20px; left:-20px; right:-20px; bottom:-20px; background: radial-gradient(circle at top left, rgba(0,230,118,0.12), transparent 70%); filter:blur(30px); z-index:-1; pointer-events:none;"></div>
        
        <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.05em; color:var(--c-text-1); margin-bottom:var(--sp-1-5); line-height:1.1;">
          ${esc(t('ob.goal_title'))}
        </h1>
        <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); line-height:1.5; max-width:90%;">
          ${esc(t('ob.goal_sub'))}
        </p>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:var(--sp-1-5); flex:1;">
        ${_choiceCard('strength', SVG.strength, t('ob.strength'), t('ob.strength_sub'), 'var(--c-accent)')}
        ${_choiceCard('hypertrophy', SVG.hypertrophy, t('ob.hypertrophy'), t('ob.hypertrophy_sub'), 'var(--c-secondary)')}
        ${_choiceCard('endurance', SVG.endurance, t('ob.endurance'), t('ob.endurance_sub'), 'var(--c-blue)')}
      </div>
      
      <!-- Elegant Fast Skip -->
      <div style="margin-top:var(--sp-4); text-align:center;">
        <button data-action="ob:quickStart" class="ob-fast-skip-btn">
          <span>${esc(t('ob.fast_skip'))}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="opacity:0.6"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        </button>
      </div>
    </div>
    <div style="margin-top:var(--sp-3);">
      ${_navButtons(!!_data.goal)}
    </div>
  `;
}

function _stepExp() {
  return `
    <div class="animate-in">
      <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:var(--sp-1)">
        ${esc(t('ob.exp_title'))}
      </h1>
      <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); margin-bottom:var(--sp-4)">
        ${esc(t('ob.exp_sub'))}
      </p>
      <div style="display:grid; gap:var(--sp-1)">
        ${_choiceCard('beginner', SVG.beginner, t('ob.beginner'), t('ob.beginner_sub'), 'var(--c-accent)')}
        ${_choiceCard('intermediate', SVG.intermediate, t('ob.intermediate'), t('ob.intermediate_sub'), 'var(--c-amber)')}
        ${_choiceCard('advanced', SVG.advanced, t('ob.advanced'), t('ob.advanced_sub'), 'var(--c-secondary)')}
      </div>
    </div>
    ${_navButtons(!!_data.exp)}
  `;
}

function _stepBio() {
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) =>
    t(`ob.mon_${String(i + 1).padStart(2, '0')}`)
  );

  const [y, m, d] = _data.dob ? _data.dob.split('-') : ['', '', ''];

  return `
    <div class="animate-in">
      <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:var(--sp-1)">
        ${esc(t('ob.bio_title'))}
      </h1>
      <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); margin-bottom:var(--sp-4)">
        ${esc(t('ob.bio_sub'))}
      </p>
      <div style="display:grid; gap:var(--sp-3)">
        <div>
          <label style="display:block; font-size:var(--fs-2); font-weight:var(--fw-bold); text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:var(--sp-1-5)">
            ${esc(t('ob.sex'))}
          </label>
          <div style="display:flex; gap:var(--sp-1-5)">
            <button class="ob-btn-tab ${_data.sex === 'm' ? 'active' : ''}" data-action="ob:setData" data-key="sex" data-value="m" style="flex:1; height:52px; border-radius:16px;">${esc(t('ob.male'))}</button>
            <button class="ob-btn-tab ${_data.sex === 'f' ? 'active' : ''}" data-action="ob:setData" data-key="sex" data-value="f" style="flex:1; height:52px; border-radius:16px;">${esc(t('ob.female'))}</button>
          </div>
        </div>
        <div>
          <label style="display:block; font-size:var(--fs-2); font-weight:var(--fw-bold); text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:var(--sp-1-5)">
            ${esc(t('ob.dob'))}
          </label>
          <!-- Зазор ушёл вниз к --sp-1: в трёхколоночной сетке он отнимается
               у селектов дважды, меньший gap = более широкая колонка. -->
          <div style="display:grid; grid-template-columns: 1.2fr 1fr 1fr; gap:var(--sp-1)">
            <select data-change="ob:setDob" data-part="y" style="height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:16px; color:var(--c-text-1); padding:0 var(--sp-1-5); font-weight:var(--fw-bold);">
              <option value="">${esc(t('ob.year'))}</option>
              ${years.map((year) => `<option value="${year}" ${y === String(year) ? 'selected' : ''}>${year}</option>`).join('')}
            </select>
            <select data-change="ob:setDob" data-part="m" style="height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:16px; color:var(--c-text-1); padding:0 var(--sp-1-5); font-weight:var(--fw-bold);">
              <option value="">${esc(t('ob.month'))}</option>
              ${months.map((name, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${m === String(i + 1).padStart(2, '0') ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            </select>
            <select data-change="ob:setDob" data-part="d" style="height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:16px; color:var(--c-text-1); padding:0 var(--sp-1-5); font-weight:var(--fw-bold);">
              <option value="">${esc(t('ob.day'))}</option>
              ${Array.from({ length: 31 }, (_, i) => {
                const val = String(i + 1).padStart(2, '0');
                return `<option value="${val}" ${d === val ? 'selected' : ''}>${i + 1}</option>`;
              }).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>
    ${_navButtons(canAdvanceFromStep(3, _data))}
  `;
}

function _stepMetrics() {
  return `
    <div class="animate-in">
      <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:var(--sp-1)">
        ${esc(t('ob.metrics_title'))}
      </h1>
      <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); margin-bottom:var(--sp-4)">
        ${esc(t('ob.metrics_sub'))}
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-2)">
        <div>
          <label style="display:block; font-size:var(--fs-2); font-weight:var(--fw-bold); text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:var(--sp-1)">
            ${esc(t('ob.height'))}
          </label>
          <input type="number" value="${esc(String(_data.height))}" placeholder="180" data-input="ob:setField" data-key="height"
                 style="width:100%; height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-family:inherit; font-size:var(--fs-4); font-weight:var(--fw-bold); padding:0 var(--sp-2); box-sizing:border-box">
        </div>
        <div>
          <label style="display:block; font-size:var(--fs-2); font-weight:var(--fw-bold); text-transform:uppercase; letter-spacing:0.1em; color:var(--c-text-3); margin-bottom:var(--sp-1)">
            ${esc(t('ob.weight'))}
          </label>
          <input type="number" value="${esc(String(_data.weight))}" placeholder="80" data-input="ob:setField" data-key="weight"
                 style="width:100%; height:52px; background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-1); font-family:inherit; font-size:var(--fs-4); font-weight:var(--fw-bold); padding:0 var(--sp-2); box-sizing:border-box">
        </div>
      </div>
    </div>
    ${_navButtons(!!_data.height && !!_data.weight)}
  `;
}

function _stepPrivacy() {
  return `
    <div class="animate-in">
      <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:var(--sp-1)">
        ${esc(t('ob.privacy_title'))}
      </h1>
      <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); margin-bottom:var(--sp-4)">
        ${esc(t('ob.privacy_sub'))}
      </p>
      <div style="display:grid; gap:var(--sp-1)">
        ${_choiceCard('airgap', SVG.anonymous, t('ob.privacy_airgap'), t('ob.privacy_airgap_sub'), '#8b5cf6')}
        ${_choiceCard('cloud', SVG.cloud, t('ob.privacy_cloud'), t('ob.privacy_cloud_sub'), 'var(--c-blue)')}
      </div>
    </div>
    ${_navButtons(canAdvanceFromStep(5, _data))}
  `;
}

function _choiceLabel(prefix, key) {
  if (!key) return '';
  const translated = t(`${prefix}${key}`);
  return translated === `${prefix}${key}` ? key : translated;
}

function _stepSkipConfirm() {
  const privacyKey = _data.privacy === 'cloud' ? 'ob.privacy_cloud' : 'ob.privacy_airgap';
  const rows = [
    [t('ob.goal_title'), _choiceLabel('ob.', _data.goal)],
    [t('ob.exp_title'), _choiceLabel('ob.', _data.exp)],
    [t('ob.sex'), _data.sex === 'f' ? t('ob.female') : t('ob.male')],
    [t('ob.dob'), _data.dob],
    [t('ob.height'), _data.height],
    [t('ob.weight'), _data.weight],
    [t('ob.privacy_title'), t(privacyKey)],
  ];
  return `
    <div class="animate-in">
      <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.04em; color:var(--c-text-1); margin-bottom:var(--sp-1)">
        ${esc(t('ob.skip_confirm_title'))}
      </h1>
      <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); margin-bottom:var(--sp-4); line-height:1.5;">
        ${esc(t('ob.skip_confirm_sub'))}
      </p>
      <div class="ob-skip-list">
        ${rows
          .map(
            ([k, v]) => `
          <div class="ob-skip-row">
            <span class="ob-skip-k">${esc(k)}</span>
            <span class="ob-skip-v">${esc(v)}</span>
          </div>`
          )
          .join('')}
      </div>
      <button type="button" data-action="ob:finish" class="ob-skip-apply">
        ${esc(t('ob.skip_confirm_apply'))}
      </button>
      <button type="button" data-action="ob:skipBack" class="ob-fast-skip-btn" style="width:100%; justify-content:center; margin-top:var(--sp-2);">
        ${esc(t('ob.skip_confirm_back'))}
      </button>
    </div>
  `;
}

function _stepReady() {
  return `
    <div class="animate-in" style="text-align:center">
      <div style="width:80px; height:80px; border-radius:50%; background:var(--c-accent-bg); color:var(--c-accent); display:flex; align-items:center; justify-content:center; margin:0 auto var(--sp-3)">
        ${SVG.check}
      </div>
      <h1 id="ob-title" tabindex="-1" style="font-size:var(--fs-6); font-weight:var(--fw-black); letter-spacing:-0.05em; color:var(--c-text-1); margin-bottom:var(--sp-1-5)">
        ${esc(t('ob.ready_title'))}
      </h1>
      <p style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-3); line-height:1.5; margin-bottom:var(--sp-5)">
        ${esc(t('ob.ready_sub'))}
      </p>
      <button data-action="ob:finish" style="width:100%; height:56px; background:var(--c-accent); color:#000; border:none; border-radius:var(--r-m); font-size:var(--fs-3); font-weight:var(--fw-black); cursor:pointer; box-shadow:0 12px 24px rgba(0,230,118,0.25)">
        ${esc(t('ob.start'))}
      </button>
    </div>
  `;
}

function _choiceCard(key, icon, label, sub, color) {
  const active =
    _step === 1 ? _data.goal === key : _step === 2 ? _data.exp === key : _data.privacy === key;
  return `
    <button class="ob-card ${active ? 'active' : ''}" data-key="${key}" data-action="ob:select"
            style="--active-c:${color}; position:relative; display:flex; align-items:center; text-align:left; gap:var(--sp-2); padding:var(--sp-3); background:var(--c-surface); border:1px solid ${active ? color : 'var(--c-border)'}; border-radius:var(--r-xl); cursor:pointer; width:100%; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow:hidden; z-index:1;">
      ${active ? `<div style="position:absolute; inset:0; background:radial-gradient(circle at left, ${color}20 0%, transparent 80%); z-index:-1;"></div>` : ''}
      <div style="width:44px; height:44px; border-radius:14px; background:${color}15; color:${color}; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow: ${active ? `0 0 16px ${color}40` : 'none'}; transition:all 0.3s ease;">
        ${icon}
      </div>
      <div style="min-width:0; flex:1;">
        <!-- 2px ниже нижней ступени шкалы (--sp-0-5 = 4px) осознанно: это
             оптический лок-ап «заголовок + подпись», а не ритм блоков. -->
        <div style="font-size:var(--fs-3); font-weight:var(--fw-black); color:var(--c-text-1); letter-spacing:-0.01em; margin-bottom:2px;">${esc(label)}</div>
        <div style="font-size:var(--fs-2); font-weight:var(--fw-md); color:var(--c-text-2); line-height:1.3">${esc(sub)}</div>
      </div>
    </button>`;
}

function _navButtons(canNext) {
  return `
    <div style="display:flex; gap:var(--sp-1-5); margin-top:auto; padding-top:var(--sp-4)">
      ${
        _step > 1
          ? `
        <button data-action="ob:prev" 
                style="width:52px; height:52px; background:none; border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-2); display:flex; align-items:center; justify-content:center; cursor:pointer">
          ${SVG.back}
        </button>
      `
          : ''
      }
      <button id="ob-next-btn" data-action="ob:next" ${canNext ? '' : 'disabled'}
              style="flex:1; height:52px; background:var(--c-accent); color:#000; border:none; border-radius:var(--r-m); font-size:var(--fs-3); font-weight:var(--fw-black); cursor:pointer; opacity:${canNext ? 1 : 0.4}">
        ${esc(t('ob.continue'))}
      </button>
    </div>
  `;
}

/* ── Handlers ── */

window._obSetDob = (part, val) => {
  let [y, m, d] = _data.dob ? _data.dob.split('-') : ['', '', ''];
  if (part === 'y') y = val;
  if (part === 'm') m = val;
  if (part === 'd') d = val;
  _data.dob = `${y}-${m}-${d}`;
  _render();
  void persistOnboardingDraft();
};

window._obQuickStart = () => {
  _data = {
    goal: _data.goal || SKIP_PLACEHOLDERS.goal,
    exp: _data.exp || SKIP_PLACEHOLDERS.exp,
    sex: SKIP_PLACEHOLDERS.sex,
    dob: SKIP_PLACEHOLDERS.dob,
    weight: SKIP_PLACEHOLDERS.weight,
    height: SKIP_PLACEHOLDERS.height,
    privacy: SKIP_PLACEHOLDERS.privacy,
  };
  _skipConfirm = true;
  _render();
  void persistOnboardingDraft();
};

window._obSkipBack = async () => {
  _skipConfirm = false;
  _data = blankOnboardingData();
  _step = 1;
  await clearOnboardingDraft();
  _render();
};

window._obSelect = (key) => {
  if (_step === 1) _data.goal = key;
  if (_step === 2) _data.exp = key;
  if (_step === 5 || _step === 99) _data.privacy = key;
  _render();
  void persistOnboardingDraft();
};

window._obSetData = (patch) => {
  _data = { ..._data, ...patch };
  _render();
  void persistOnboardingDraft();
};

window._obNext = async () => {
  if (_step < STEPS) {
    if (!canAdvanceFromStep(_step, _data)) return;
    _step++;
    await persistOnboardingDraft();
    _render();
  }
};
window._obPrev = async () => {
  if (_step > 1) {
    _step--;
    await persistOnboardingDraft();
    _render();
  }
};

window._obFinish = async () => {
  try {
    await commitOnboarding();
    if (!_overlay) return;
    _overlay.style.opacity = '0';
    setTimeout(() => {
      _overlay._resolve();
      _overlay.remove();
      _overlay = null;
    }, 300);
  } finally {
    // F-11 ставит inert при открытии. Без finally сбой commit (IDB) оставлял
    // #app + FAB inert навсегда — Train и таб-бар мертвы под живым оверлеем.
    setShellInert(false);
  }
};

/* ── Styles ── */
const style = document.createElement('style');
style.textContent = `
  .animate-in { animation: ob-fade-in 0.4s cubic-bezier(0.4, 0, 0.2, 1) both; }
  @keyframes ob-fade-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  .ob-btn-tab { background:var(--c-bg-3); border:1.5px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-3); padding:var(--sp-1-5); font-size:var(--fs-3); font-weight:var(--fw-bold); cursor:pointer; font-family:inherit; transition:all 0.2s; }
  .ob-btn-tab.active { background:var(--c-accent-bg); border-color:var(--c-accent); color:var(--c-accent); }
  .ob-fast-skip-btn { background:var(--c-surface); border:1px solid var(--c-border-h); color:var(--c-text-1); font-size:var(--fs-3); font-weight:var(--fw-md); cursor:pointer; min-height:44px; padding:var(--sp-1-5) var(--sp-3); border-radius:24px; transition:all 0.2s ease; display:inline-flex; align-items:center; gap:var(--sp-1); font-family:inherit; }
  .ob-lang { display:flex; justify-content:flex-end; padding: 0 var(--sp-2); }
  .ob-lang-btn { min-height:44px; min-width:44px; padding:var(--sp-1) var(--sp-2); background:var(--c-bg-3); border:1px solid var(--c-border); font-size:var(--fs-2); font-weight:var(--fw-md); color:var(--c-text-3); cursor:pointer; font-family:inherit; }
  .ob-lang-btn:first-child { border-radius: var(--r-s) 0 0 var(--r-s); }
  .ob-lang-btn:last-child { border-radius: 0 var(--r-s) var(--r-s) 0; margin-left: -1px; }
  .ob-lang-btn.active { background:var(--c-accent-bg); color:var(--c-accent); border-color:var(--c-accent); }
  .ob-skip-list { display:flex; flex-direction:column; gap:var(--sp-1); margin:0 0 var(--sp-4); }
  .ob-skip-row { display:flex; justify-content:space-between; align-items:baseline; gap:var(--sp-2); padding:var(--sp-2); background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--r-m); }
  .ob-skip-k { font-size:var(--fs-2); font-weight:var(--fw-bold); color:var(--c-text-3); text-transform:uppercase; letter-spacing:0.1em; }
  .ob-skip-v { font-size:var(--fs-3); font-weight:var(--fw-bold); color:var(--c-text-1); text-align:right; }
  .ob-skip-apply { width:100%; height:56px; background:var(--c-accent); color:var(--c-text-inverse); border:none; border-radius:var(--r-m); font-size:var(--fs-3); font-weight:var(--fw-black); cursor:pointer; font-family:inherit; }
`;
document.head.appendChild(style);
