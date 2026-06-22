// @ts-check
import { esc } from '../shared/utils.js';
import { t } from '../locale.store.js';

/**
 * Render the complete Application Settings for the Profile tab.
 * @param {Object} settings - All settings from DB.Settings.getAll()
 * @param {string} lang - Current language code ('en'|'ru')
 * @param {Object} serverStatus - AI server status
 * @param {string} syncStatus - Current sync status
 * @returns {string}
 */
export function renderSettings(settings, lang, serverStatus, syncStatus = 'idle') {
  const currentEngine = settings['ai-engine'] || 'anthropic';
  const hasLocalGemini = !!settings['gemini-key'];
  const geminiActive = (serverStatus.gemini || hasLocalGemini);
  const anthropicActive = serverStatus.anthropic;

  const trainingMode = settings['training-mode'] || 'strength';
  const sessionTime  = Number(settings['session-time']) || 0;
  const _modeActive  = (m) => trainingMode === m ? ' active' : '';
  const _timeActive  = (t) => sessionTime === t ? ' active' : '';

  const syncStatusLabel = t(`sync.status.${syncStatus}`);
  const syncStatusColor = syncStatus === 'error' ? 'var(--c-red)' : (syncStatus === 'syncing' ? 'var(--c-blue)' : (syncStatus === 'offline' ? 'var(--c-text-3)' : 'var(--c-accent)'));

  return `
    <!-- ── GENERAL SETTINGS ── -->
    <div class="section-label-alt">${t('settings.general')}</div>
    <div class="profile-card" style="padding:0">
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:rgba(255,255,255,0.05)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.rest')}</div>
          <div class="pref-sub">${settings['rest-duration'] || 90}s ${t('settings.rest_sub')}</div>
        </div>
        <div class="mini-stepper" style="background: var(--c-bg-3); border-radius: 12px; padding: 4px; gap: 8px; display: flex; align-items: center;">
          <button onclick="Profile.adjustRest(-15)" style="width: 28px; height: 28px; border-radius: 8px; background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-1);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button onclick="Profile.adjustRest(15)" style="width: 28px; height: 28px; border-radius: 8px; background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-1);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      
      <div class="pref-divider" style="margin:0 16px"></div>
      
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:rgba(0,230,118,0.1)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" stroke-width="2" width="18" height="18"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.haptic')}</div>
          <div class="pref-sub">${t('settings.haptic_sub')}</div>
        </div>
        <div class="switch-wrap" onclick="Profile.toggleHaptic()">
          <div class="switch ${settings['haptic'] !== 'off' ? 'on' : ''}" id="sw-haptic">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 16px"></div>

      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:rgba(68,138,255,0.1)"><svg viewBox="0 0 24 24" fill="none" stroke="#448aff" stroke-width="2" width="18" height="18"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.awake')}</div>
          <div class="pref-sub">${t('settings.awake_sub')}</div>
        </div>
        <div class="switch-wrap" onclick="Profile.toggleKeepAwake()">
          <div class="switch ${settings['keep-awake'] !== 'off' ? 'on' : ''}" id="sw-keep-awake">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 16px"></div>

      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:rgba(255,255,255,0.05)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.lang')}</div>
          <div class="pref-sub">${t('settings.lang_sub')}</div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn ${lang !== 'ru' ? 'active' : ''}"
                  onclick="Profile.setLang('en')">EN</button>
          <button class="toggle-btn ${lang === 'ru' ? 'active' : ''}"
                  onclick="Profile.setLang('ru')">RU</button>
        </div>
      </div>
    </div>

    <!-- ── TRAINING SETTINGS ── -->
    <div class="section-label-alt">${t('settings.training')}</div>
    <div class="profile-card" style="padding:16px; display: flex; flex-direction: column; gap: 16px;">
      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${t('settings.smart_progress')}</div>
          <div class="pref-sub">${t('settings.smart_progress_sub')}</div>
        </div>
        <div class="switch-wrap" onclick="Profile.toggleAutoProgress()">
          <div class="switch ${settings['auto-progress'] !== 'off' ? 'on' : ''}" id="sw-auto-progress">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider"></div>

      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${t('settings.unit')}</div>
          <div class="pref-sub">${t('settings.unit_sub')}</div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn ${(settings['weight-unit'] || 'kg') === 'kg' ? 'active' : ''}"
                  onclick="Profile.setUnit('kg')">kg</button>
          <button class="toggle-btn ${settings['weight-unit'] === 'lbs' ? 'active' : ''}"
                  onclick="Profile.setUnit('lbs')">lbs</button>
        </div>
      </div>

      <div class="pref-divider"></div>

      <div class="pref-col">
        <div class="pref-info">
          <div class="pref-title">${t('settings.mode')}</div>
          <div class="pref-sub">${t('settings.mode_sub')}</div>
        </div>
        <div class="toggle-group seg-full">
          <button class="toggle-btn seg-sm${_modeActive('strength')}"
                  onclick="Profile.setTrainingMode('strength')">${lang === 'ru' ? 'Сила' : 'Strength'}</button>
          <button class="toggle-btn seg-sm${_modeActive('hypertrophy')}"
                  onclick="Profile.setTrainingMode('hypertrophy')">${lang === 'ru' ? 'Масса' : 'Size'}</button>
          <button class="toggle-btn seg-sm${_modeActive('recovery')}"
                  onclick="Profile.setTrainingMode('recovery')">${lang === 'ru' ? 'Отдых' : 'Recov.'}</button>
          <button class="toggle-btn seg-sm${_modeActive('maintenance')}"
                  onclick="Profile.setTrainingMode('maintenance')">${lang === 'ru' ? 'Подд.' : 'Maint.'}</button>
        </div>
      </div>

      <div class="pref-divider"></div>

      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${t('settings.length')}</div>
          <div class="pref-sub">${t('settings.length_sub')}</div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn seg-sm${_timeActive(30)}" onclick="Profile.setSessionTime(30)">30</button>
          <button class="toggle-btn seg-sm${_timeActive(45)}" onclick="Profile.setSessionTime(45)">45</button>
          <button class="toggle-btn seg-sm${_timeActive(60)}" onclick="Profile.setSessionTime(60)">60</button>
          <button class="toggle-btn seg-sm${_timeActive(90)}" onclick="Profile.setSessionTime(90)">90</button>
          <button class="toggle-btn seg-sm${_timeActive(0)}" onclick="Profile.setSessionTime(0)">—</button>
        </div>
      </div>

      <div class="pref-divider"></div>

      <div class="pref-col">
        <div class="pref-info">
          <div class="pref-title">${t('settings.limits')}</div>
          <div class="pref-sub">${t('settings.limits_sub')}</div>
        </div>
        <textarea class="pref-textarea" id="pref-injuries" maxlength="200"
                  placeholder="${t('settings.limits_placeholder')}"
                  onblur="Profile.saveInjuries(this.value)">${esc(settings['limitations'] || '')}</textarea>
      </div>
    </div>

    <!-- ── AI ASSISTANT ── -->
    <div class="section-label-alt">${t('settings.ai')}</div>
    <div class="profile-card" style="padding:16px; display: flex; flex-direction: column; gap: 16px;">
        <div class="engine-toggle-grid">
          <button class="engine-toggle-btn claude-active ${currentEngine === 'anthropic' ? 'active' : ''}"
                  onclick="Profile.setEngine('anthropic')">
            <span class="ai-indicator ${anthropicActive ? (currentEngine === 'anthropic' ? 'active' : 'ready') : 'missing'}"></span>
            ${t('settings.engine_claude')}
          </button>
          <button class="engine-toggle-btn gemini-active ${currentEngine === 'gemini' ? 'active' : ''} ${currentEngine === 'gemini' && !geminiActive ? 'ai-glow-error' : ''}"
                  onclick="Profile.setEngine('gemini')">
            <span class="ai-indicator ${geminiActive ? (currentEngine === 'gemini' ? 'active' : 'ready') : 'missing'}"></span>
            ${t('settings.engine_gemini')}
          </button>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding: 4px 0;">
          <div class="pref-info">
            <div class="pref-title">P.A.N.D.A Assistant</div>
            <div class="pref-sub">Floating AI Bubble</div>
          </div>
          <div class="switch-wrap" onclick="Profile.togglePanda()">
            <div class="switch ${settings['ai-panda-hidden'] ? '' : 'on'}" id="sw-panda">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>
        
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div class="pref-sub" style="font-size: 10px; margin: 0; font-weight: 700;">${t('settings.gemini_key')}</div>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" class="pref-sub" 
               style="font-size: 10px; color: var(--c-blue); text-decoration: none; font-weight: 800;">
               ${t('settings.gemini_get_key')} ↗
            </a>
          </div>
          <div style="position: relative; display: flex; align-items: center;">
            <input type="password" id="gemini-key-input" class="pref-textarea" style="height: 38px; padding: 0 70px 0 12px; margin: 0; font-family: monospace; border-radius: 12px; width: 100%; box-sizing: border-box;"
                   placeholder="${serverStatus.gemini ? t('settings.gemini_placeholder_server') : t('settings.gemini_placeholder_opt')}" 
                   value="${esc(settings['gemini-key'] || '')}"
                   oninput="Profile.validateGeminiKey(this.value)"
                   onblur="Profile.setGeminiKey(this.value)">
            <div style="position: absolute; right: 8px; display: flex; align-items: center; gap: 8px;">
              <button class="btn-text" onclick="Profile.toggleKeyVisibility()" style="padding: 4px; color: var(--c-text-3);">
                <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                   <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <svg id="key-valid-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" style="color: ${(settings['gemini-key'] || '').trim().startsWith('AIza') ? 'var(--c-accent)' : 'var(--c-text-3)'}; transition: color 0.3s;">
                 <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
          </div>
    </div>

    <!-- ── DATA & CLOUD SYNC ── -->
    <div class="section-label-alt">${t('settings.data')}</div>
    <div class="profile-card" style="padding:16px; display: flex; flex-direction: column; gap: 16px;">
      
      <!-- Sync -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(0,230,118,0.1); color: var(--c-accent); display: flex; align-items: center; justify-content: center;">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 600;">${t('sync.connect')}</div>
            <div style="font-size: 10px; color: ${syncStatusColor}; font-weight: 700;">${syncStatusLabel}</div>
          </div>
        </div>
        <button class="btn-text" 
                onclick="Profile.${syncStatus === 'offline' ? 'syncConnect' : 'syncDisconnect'}()" 
                style="color: var(--c-accent); font-size: 12px; font-weight: 700;">
          ${syncStatus === 'offline' ? 'CONNECT' : 'DISCONNECT'}
        </button>
      </div>

      <div class="pref-divider"></div>

      <!-- JSON Management -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>
          <div style="font-size: 14px; font-weight: 600;">${t('data.backup')}</div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-ghost" onclick="Profile.exportData()" style="flex: 1; min-width: 90px; height: 36px; font-size: 11px;">${t('data.export')}</button>
          <button class="btn btn-ghost" onclick="Profile.exportCsv()" style="flex: 1; min-width: 90px; height: 36px; font-size: 11px;">${t('data.export_csv')}</button>
          <button class="btn btn-ghost" onclick="Profile.importData()" style="flex: 1; min-width: 90px; height: 36px; font-size: 11px;">${t('data.import')}</button>
          <button class="btn btn-ghost" onclick="Profile.deduplicateDB()" style="flex: 1; min-width: 90px; height: 36px; font-size: 11px; color: var(--c-text-3);">${t('data.dedup')}</button>
        </div>
      </div>
    </div>
  `;
}
