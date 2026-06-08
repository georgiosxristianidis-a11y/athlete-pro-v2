// @ts-check
import { esc } from '../shared/utils.js';

/**
 * Render the complete Application Settings for the Profile tab.
 * @param {Object} settings - All settings from DB.Settings.getAll()
 * @param {string} lang - Current language code ('en'|'ru')
 * @param {Object} serverStatus - AI server status
 * @returns {string}
 */
export function renderSettings(settings, lang, serverStatus) {
  const ru = lang === 'ru';
  
  const currentEngine = settings['ai-engine'] || 'anthropic';
  const hasLocalGemini = !!settings['gemini-key'];
  const geminiActive = (serverStatus.gemini || hasLocalGemini);
  const anthropicActive = serverStatus.anthropic;

  const trainingMode = settings['training-mode'] || 'strength';
  const sessionTime  = Number(settings['session-time']) || 0;
  const _modeActive  = (m) => trainingMode === m ? ' active' : '';
  const _timeActive  = (t) => sessionTime === t ? ' active' : '';

  return `
    <!-- ── GENERAL SETTINGS ── -->
    <div class="section-label-alt">${ru ? 'ОСНОВНОЕ' : 'GENERAL'}</div>
    <div class="profile-card" style="padding:0">
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:rgba(255,255,255,0.05)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${ru ? 'Время отдыха' : 'Rest Duration'}</div>
          <div class="pref-sub">${settings['rest-duration'] || 90}s ${ru ? 'между подходами' : 'between sets'}</div>
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
          <div class="pref-title">${ru ? 'Тактильный отклик' : 'Haptic Feedback'}</div>
          <div class="pref-sub">${ru ? 'Вибрация интерфейса' : 'Tactile interface response'}</div>
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
          <div class="pref-title">${ru ? 'Не выключать экран' : 'Keep Screen Awake'}</div>
          <div class="pref-sub">${ru ? 'Экран не гаснет' : 'Prevent sleep mode'}</div>
        </div>
        <div class="switch-wrap" onclick="Profile.toggleKeepAwake()">
          <div class="switch ${settings['keep-awake'] === 'on' ? 'on' : ''}" id="sw-keep-awake">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 16px"></div>

      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:rgba(255,255,255,0.05)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${ru ? 'Язык' : 'Language'}</div>
          <div class="pref-sub">${ru ? 'Язык интерфейса' : 'Interface language'}</div>
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
    <div class="section-label-alt">${ru ? 'ТРЕНИРОВКИ' : 'TRAINING'}</div>
    <div class="profile-card" style="padding:16px; display: flex; flex-direction: column; gap: 16px;">
      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${ru ? 'Умная прогрессия' : 'AI Smart Progress'}</div>
          <div class="pref-sub">${ru ? 'Авто +2.5 кг при успехе' : 'Auto +2.5 kg on success'}</div>
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
          <div class="pref-title">${ru ? 'Единицы веса' : 'Weight Unit'}</div>
          <div class="pref-sub">${ru ? 'Килограммы или фунты' : 'Kilograms or pounds'}</div>
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
          <div class="pref-title">${ru ? 'Режим тренировок' : 'Training Mode'}</div>
          <div class="pref-sub">${ru ? 'Адаптация советов под фазу' : 'Coach adapts advice to phase'}</div>
        </div>
        <div class="toggle-group seg-full">
          <button class="toggle-btn seg-sm${_modeActive('strength')}"
                  onclick="Profile.setTrainingMode('strength')">${ru ? 'Сила' : 'Strength'}</button>
          <button class="toggle-btn seg-sm${_modeActive('hypertrophy')}"
                  onclick="Profile.setTrainingMode('hypertrophy')">${ru ? 'Масса' : 'Size'}</button>
          <button class="toggle-btn seg-sm${_modeActive('recovery')}"
                  onclick="Profile.setTrainingMode('recovery')">${ru ? 'Отдых' : 'Recov.'}</button>
          <button class="toggle-btn seg-sm${_modeActive('maintenance')}"
                  onclick="Profile.setTrainingMode('maintenance')">${ru ? 'Подд.' : 'Maint.'}</button>
        </div>
      </div>

      <div class="pref-divider"></div>

      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${ru ? 'Длина сессии' : 'Session Length'}</div>
          <div class="pref-sub">${ru ? 'Лимит времени (мин)' : 'Max time cap (min)'}</div>
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
          <div class="pref-title">${ru ? 'Ограничения' : 'Limitations'}</div>
          <div class="pref-sub">${ru ? 'Травмы или инвентарь' : 'Injuries or equipment restrictions'}</div>
        </div>
        <textarea class="pref-textarea" id="pref-injuries" maxlength="200"
                  placeholder="${ru ? 'напр. болит плечо, нет штанги' : 'e.g. bad left shoulder, no barbell'}"
                  onblur="Profile.saveInjuries(this.value)">${esc(settings['limitations'] || '')}</textarea>
      </div>
    </div>

    <!-- ── AI ASSISTANT ── -->
    <div class="section-label-alt">${ru ? 'AI АССИСТЕНТ' : 'AI ASSISTANT'}</div>
    <div class="profile-card" style="padding:16px; display: flex; flex-direction: column; gap: 16px;">
        <div class="engine-toggle-grid">
          <button class="engine-toggle-btn claude-active ${currentEngine === 'anthropic' ? 'active' : ''}"
                  onclick="Profile.setEngine('anthropic')">
            <span class="ai-indicator ${anthropicActive ? (currentEngine === 'anthropic' ? 'active' : 'ready') : 'missing'}"></span>
            Claude
          </button>
          <button class="engine-toggle-btn gemini-active ${currentEngine === 'gemini' ? 'active' : ''} ${currentEngine === 'gemini' && !geminiActive ? 'ai-glow-error' : ''}"
                  onclick="Profile.setEngine('gemini')">
            <span class="ai-indicator ${geminiActive ? (currentEngine === 'gemini' ? 'active' : 'ready') : 'missing'}"></span>
            Gemini
          </button>
        </div>
        
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div class="pref-sub" style="font-size: 10px; margin: 0; font-weight: 700;">GEMINI API KEY (LOCAL)</div>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" class="pref-sub" 
               style="font-size: 10px; color: var(--c-blue); text-decoration: none; font-weight: 800;">
               ${ru ? 'ПОЛУЧИТЬ КЛЮЧ' : 'GET KEY'} ↗
            </a>
          </div>
          <input type="password" id="gemini-key-input" class="pref-textarea" style="height: 38px; padding: 0 12px; margin: 0; font-family: monospace; border-radius: 12px;"
                 placeholder="${serverStatus.gemini ? (ru ? 'Используется ключ сервера' : 'Using server-side key') : 'AI... (optional)'}" 
                 value="${settings['gemini-key'] || ''}"
                 onblur="Profile.setGeminiKey(this.value)">
        </div>
    </div>

    <!-- ── DATA & CLOUD SYNC ── -->
    <div class="section-label-alt">${ru ? 'ДАННЫЕ И ОБЛАКО' : 'DATA & CLOUD'}</div>
    <div class="profile-card" style="padding:16px; display: flex; flex-direction: column; gap: 16px;">
      
      <!-- Sync -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(0,230,118,0.1); color: var(--c-accent); display: flex; align-items: center; justify-content: center;">🔄</div>
          <div>
            <div style="font-size: 14px; font-weight: 600;">${ru ? 'Синхронизация' : 'Cloud Sync'}</div>
            <div style="font-size: 10px; color: var(--c-text-3);">${ru ? 'Статус: Оффлайн' : 'Status: Offline-only'}</div>
          </div>
        </div>
        <button class="btn-text" onclick="window.Toast.show('${ru ? 'Фаза 6: Скоро!' : 'Phase 6: Coming Soon!'}', 'info')" style="color: var(--c-accent); font-size: 12px; font-weight: 700;">CONNECT</button>
      </div>

      <div class="pref-divider"></div>

      <!-- JSON Management -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;">💾</div>
          <div style="font-size: 14px; font-weight: 600;">${ru ? 'Резервное копирование' : 'Local Backup'}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-ghost" onclick="Profile.exportData()" style="flex: 1; height: 36px; font-size: 11px;">EXPORT JSON</button>
          <button class="btn btn-ghost" onclick="Profile.importData()" style="flex: 1; height: 36px; font-size: 11px;">IMPORT</button>
        </div>
      </div>
    </div>
  `;
}
