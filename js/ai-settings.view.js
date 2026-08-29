// @ts-check
/**
 * AI settings sheet — engine, BYOK key, coach tone.
 * Hung on body; both the s-intel gear and the Profile pointer call openAiSettings().
 */
import { esc, haptic } from './shared/utils.js';
import { t } from './locale.store.js';
import { on, onInput, onBlur, onChange } from './events.js';
import { DB } from './db.js';
import { Toast } from './shell.js';
import { probeAiStatus } from './shared/ai-status.js';
import { ensureCss } from './shared/lazy-css.js';
import { DEFAULT_AI_ENGINE } from './shared/ai-engine.js';
import {
  KEY_DEBOUNCE_MS,
  bumpKeyCheckSeq,
  keyLooksValid,
  keyConnInitState,
  keyPrefix,
  getTone,
  setTone,
  setEngine,
  commitKey,
  normalizeEngine,
} from './ai-settings.store.js';

on('ai:openSettings', () => openAiSettings());
on('ai:closeSettings', () => closeAiSettings());
on('ai:setEngine', (el) => _onSetEngine(el.dataset.engine));
on('ai:toggleKeyVis', () => toggleKeyVisibility());
on('ai:keyRecheck', async () => {
  const icon = document.getElementById('key-conn-icon');
  icon?.classList.add('is-spinning');
  try {
    await recheckKey();
  } finally {
    if (icon) {
      icon.classList.remove('is-spinning');
      icon.classList.add('is-settled');
      setTimeout(() => icon.classList.remove('is-settled'), 500);
    }
  }
});
onInput('ai:keyInput', (el) => onKeyInput(el.dataset.engine, el.value));
onBlur('ai:keyBlur', (el) => applyKey(el.dataset.engine, el.value));
onInput('ai:toneInput', (el) => {
  const val = document.getElementById('intel-tone-val');
  if (val) val.textContent = el.value;
});
onChange('ai:toneChange', (el) => setTone(el.value));

const OVERLAY_ID = 'ai-settings-overlay';

/** Last probe — engine-block refresh must not wait on the network. */
let _serverStatus = { gemini: false, anthropic: false };

let _keyTimer = null;

const KEY_CONN_TEXT = {
  empty: () => t('settings.key_empty'),
  server: () => t('settings.key_server'),
  saved: () => t('settings.key_saved'),
  partial: () => t('settings.key_partial'),
  checking: () => t('settings.key_checking'),
  ok: () => t('settings.key_ok'),
  invalid: () => t('settings.key_invalid'),
  disabled: () => t('settings.key_disabled'),
  offline: () => t('settings.key_offline'),
  blocked: () => t('settings.key_blocked'),
};

/**
 * Отрисовать состояние индикатора коннекта. Единственная точка, которая
 * трогает DOM индикатора — состояние живёт в data-state, вся анимация в CSS.
 * Хендлеры ключа НЕ перерисовывают блок настроек: подмена разметки между
 * mousedown и click съела бы тап, вызвавший blur.
 *
 * @param {'empty'|'server'|'saved'|'partial'|'checking'|'ok'|'invalid'|'disabled'|'offline'|'blocked'} state
 * @param {{ latencyMs?: number }} [extra]
 */
export function setKeyConn(state, extra = {}) {
  const box = document.getElementById('key-conn');
  if (!box) return;
  const label = box.querySelector('.key-conn-label');
  if (!label) return;

  if (state === 'empty' && box.dataset.server === '1') state = 'server';

  const text = (KEY_CONN_TEXT[state] && KEY_CONN_TEXT[state]()) || '';
  const ms = Number(extra.latencyMs) || 0;
  label.textContent = state === 'ok' && ms ? `${text} · ${ms} ${t('settings.key_ms')}` : text;

  if (box.dataset.state !== state) {
    box.dataset.state = state;
    box.classList.remove('is-swap');
    void box.offsetWidth;
    box.classList.add('is-swap');
    if (state === 'ok') haptic(10);
  }
}

/** @param {object} settings */
export async function patchAiStatus(settings) {
  try {
    const probed = await probeAiStatus();
    _serverStatus = { gemini: !!probed.gemini, anthropic: !!probed.anthropic };
    const currentEngine = settings['ai-engine'] || DEFAULT_AI_ENGINE;
    const geminiActive = probed.gemini || !!settings['gemini-key'];
    const anthropicActive = probed.anthropic || !!settings['anthropic-key'];

    const anthropicEl = document.getElementById('ai-status-anthropic');
    if (anthropicEl) {
      anthropicEl.className = `ai-indicator ${anthropicActive ? (currentEngine === 'anthropic' ? 'active' : 'ready') : 'missing'}`;
    }
    const geminiEl = document.getElementById('ai-status-gemini');
    if (geminiEl) {
      geminiEl.className = `ai-indicator ${geminiActive ? (currentEngine === 'gemini' ? 'active' : 'ready') : 'missing'}`;
    }
    if (probed.gemini) {
      document.getElementById('engine-btn-gemini')?.classList.remove('ai-glow-error');
    }
  } catch (_) {
    /* probeAiStatus does not throw; keep local-key indicators */
  }
}

/**
 * Engine toggle + BYOK field for the currently selected engine.
 * @param {Object<string, *>} settings
 * @param {{ gemini?: boolean, anthropic?: boolean }} serverStatus
 */
export function renderEngineAndKey(settings, serverStatus = {}) {
  const currentEngine = settings['ai-engine'] || DEFAULT_AI_ENGINE;
  const hasLocalGemini = !!settings['gemini-key'];
  const hasLocalAnthropic = !!settings['anthropic-key'];
  const geminiActive = !!(serverStatus.gemini || hasLocalGemini);
  const anthropicActive = !!(serverStatus.anthropic || hasLocalAnthropic);

  const isGem = currentEngine === 'gemini';
  const keyId = isGem ? 'gemini-key' : 'anthropic-key';
  const val = settings[keyId] || '';
  const prefix = keyPrefix(currentEngine);
  const label = isGem ? t('settings.gemini_key') : t('settings.claude_key');
  const getLbl = isGem ? t('settings.gemini_get_key') : t('settings.claude_get_key');
  const getUrl = isGem
    ? 'https://aistudio.google.com/app/apikey'
    : 'https://console.anthropic.com/settings/keys';
  const serverHas = !!(isGem ? serverStatus.gemini : serverStatus.anthropic);
  const placeholder = isGem
    ? serverHas
      ? t('settings.gemini_placeholder_server')
      : t('settings.gemini_placeholder_opt')
    : serverHas
      ? t('settings.claude_placeholder_server')
      : t('settings.claude_placeholder_opt');
  const initState = keyConnInitState(val, prefix, serverHas);
  const initLabel = {
    server: t('settings.key_server'),
    empty: t('settings.key_empty'),
    saved: t('settings.key_saved'),
    partial: t('settings.key_partial'),
  }[initState];

  return `
        <div class="engine-toggle-grid">
          <button class="engine-toggle-btn claude-active ${currentEngine === 'anthropic' ? 'active' : ''}"
                  data-action="ai:setEngine" data-engine="anthropic">
            <span class="ai-indicator ${anthropicActive ? (currentEngine === 'anthropic' ? 'active' : 'ready') : 'missing'}" id="ai-status-anthropic"></span>
            ${t('settings.engine_claude')}
          </button>
          <button class="engine-toggle-btn gemini-active ${currentEngine === 'gemini' ? 'active' : ''} ${currentEngine === 'gemini' && !geminiActive ? 'ai-glow-error' : ''}"
                  id="engine-btn-gemini"
                  data-action="ai:setEngine" data-engine="gemini">
            <span class="ai-indicator ${geminiActive ? (currentEngine === 'gemini' ? 'active' : 'ready') : 'missing'}" id="ai-status-gemini"></span>
            ${t('settings.engine_gemini')}
          </button>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-0-5);">
            <div class="pref-sub" style="font-size: var(--fs-1); margin: 0; font-weight: var(--fw-bold);">${esc(label)}</div>
            <a href="${getUrl}" target="_blank" class="pref-sub"
               style="font-size: var(--fs-1); color: var(--c-blue); text-decoration: none; font-weight: var(--fw-black);">
               ${esc(getLbl)} ↗
            </a>
          </div>
          <div style="position: relative; display: flex; align-items: center;">
            <!-- Правые 44px — не ритм, а клиренс под абсолютную кнопку показа ключа
                 (тап-таргет 44×44). Вне шкалы --sp-* осознанно. -->
            <input type="password" id="ai-key-input" class="pref-textarea" style="height: 38px; padding: 0 44px 0 var(--sp-1-5); margin: 0; font-family: monospace; border-radius: var(--r-m); width: 100%; box-sizing: border-box;"
                   placeholder="${esc(placeholder)}"
                   value="${esc(val)}"
                   data-engine="${isGem ? 'gemini' : 'anthropic'}"
                   data-input="ai:keyInput"
                   data-blur="ai:keyBlur">
            <div style="position: absolute; right: 8px; display: flex; align-items: center; gap: var(--sp-1);">
              <button class="btn-text" data-action="ai:toggleKeyVis" style="padding: var(--sp-0-5); color: var(--c-text-3);">
                <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                   <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="key-conn" id="key-conn" data-state="${initState}" data-server="${serverHas ? '1' : '0'}">
            <span class="key-conn-dot"></span>
            <span class="key-conn-label">${esc(initLabel)}</span>
            <button class="key-conn-recheck" data-action="ai:keyRecheck" aria-label="${esc(t('settings.key_recheck'))}">
              <svg class="icon-rotate" id="key-conn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
        </div>`;
}

function _toneRow(tone) {
  return `
        <div class="intel-tone-row">
          <div class="intel-tone-head">
            <span class="intel-tone-label">${esc(t('settings.tone_label'))}</span>
            <span id="intel-tone-val" class="intel-tone-val">${esc(String(tone))}</span>
          </div>
          <input type="range" id="intel-tone-slider" class="intel-tone-slider" min="0" max="100" value="${esc(String(tone))}" data-input="ai:toneInput" data-change="ai:toneChange">
          <div class="intel-tone-scale">
            <span>${esc(t('settings.tone_therapist'))}</span><span>${esc(t('settings.tone_neutral'))}</span><span>${esc(t('settings.tone_goggins'))}</span>
          </div>
        </div>`;
}

export async function openAiSettings() {
  // Стили тумблера/ключа живут в profile.css, слайдера тона — в intel.css.
  // Шторка открывается с обоих экранов, каждый из которых грузит только своё.
  await ensureCss('css/profile.css', 'css/intel.css');

  document.getElementById(OVERLAY_ID)?.remove();

  const [settings, tone] = await Promise.all([DB.Settings.getAll(), getTone()]);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div class="modal-title">${esc(t('settings.ai_sheet'))}</div>
          <button class="btn-icon-sm" data-action="ai:closeSettings" aria-label="${esc(t('settings.ai_close'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div id="ai-settings-engine" style="display:flex; flex-direction:column; gap: var(--sp-2);">
          ${renderEngineAndKey(settings, _serverStatus)}
        </div>
        <p class="pref-sub" style="margin: var(--sp-2) 0 0; font-size: var(--fs-1);">${esc(t('settings.voice_gemini'))}</p>
        ${_toneRow(tone)}
        <button class="btn btn-primary intel-settings-save" data-action="ai:closeSettings">${esc(t('settings.done'))}</button>
      </div>
    `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAiSettings();
  });
  patchAiStatus(settings);
}

export async function closeAiSettings() {
  const slider = /** @type {HTMLInputElement|null} */ (
    document.getElementById('intel-tone-slider')
  );
  if (slider) await setTone(slider.value);
  document.getElementById(OVERLAY_ID)?.remove();
}

/** @param {string} engine @param {string} raw */
export function onKeyInput(engine, raw) {
  clearTimeout(_keyTimer);
  const val = String(raw || '').trim();

  if (!val) {
    bumpKeyCheckSeq();
    setKeyConn('empty');
    _keyTimer = setTimeout(() => applyKey(engine, ''), KEY_DEBOUNCE_MS);
    return;
  }
  if (!keyLooksValid(engine, val)) {
    bumpKeyCheckSeq();
    setKeyConn('partial');
    return;
  }

  setKeyConn('checking');
  _keyTimer = setTimeout(() => applyKey(engine, val), KEY_DEBOUNCE_MS);
}

/** @param {string} engine @param {string} raw */
async function applyKey(engine, raw) {
  clearTimeout(_keyTimer);
  const result = await commitKey(engine, raw);
  if (result.stale) return;

  if (normalizeEngine(engine) === 'gemini') {
    const { Claude } = await import('./claude.view.js');
    document.getElementById('claude-fab-container')?.remove();
    Claude.renderFAB();
  }
  patchAiStatus(await DB.Settings.getAll());
  setKeyConn(/** @type {any} */ (result.state), result);
  await window.IntelView?.refreshKeyBadge?.();
}

async function recheckKey() {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('ai-key-input'));
  if (!inp) return;
  haptic(10);
  await applyKey(inp.dataset.engine || 'anthropic', inp.value);
}

function toggleKeyVisibility() {
  const inp = document.getElementById('ai-key-input');
  const icon = document.getElementById('eye-icon');
  if (!inp || !icon) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.innerHTML =
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><path d="M2 2l20 20"/>';
  } else {
    inp.type = 'password';
    icon.innerHTML =
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

/** @param {string} [engine] */
async function _onSetEngine(engine) {
  const result = await setEngine(engine);
  if (!result.ok) {
    Toast.show(t('profile.ai_airgap'), 'error');
    return;
  }
  const fab = document.getElementById('claude-fab');
  if (fab) {
    const { Claude } = await import('./claude.view.js');
    if (result.engine === 'gemini') {
      fab.classList.add('gemini-mode');
      const content = fab.querySelector('.fab-content');
      if (content) content.innerHTML = Claude._geminiIcon();
    } else {
      fab.classList.remove('gemini-mode');
      const content = fab.querySelector('.fab-content');
      if (content) content.innerHTML = Claude._claudeIcon();
    }
  }
  haptic(20);
  const settings = await DB.Settings.getAll();
  const el = document.getElementById('ai-settings-engine');
  if (el) el.innerHTML = renderEngineAndKey(settings, _serverStatus);
  patchAiStatus(settings);
  await window.IntelView?.refreshKeyBadge?.();
}
