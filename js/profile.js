// @ts-check
/* ════════════════════════════════════════════════════════
   profile.js — Athlete Pro  |  Profile: settings, metrics, data management
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { renderPrivacyCard } from './privacy.view.js';
import { renderProfile } from './profile.view.js';
import { VERSION } from './version.js';

export const Profile = (() => {
  /* ══════════════════════════════════════════════
     MAIN LOAD
     ══════════════════════════════════════════════ */
  /**
   * Load and render the profile screen.
   * @returns {Promise<void>}
   */
  async function load() {
    console.log('Profile.load() called');
    const screen = document.getElementById('s-profile');
    if (!screen) {
      console.error('s-profile screen not found');
      return;
    }

    try {
      const [settings, langRaw, pandaHidden] = await Promise.all([
        DB.Settings.getAll(),
        DB.Settings.get('lang', 'en'),
        DB.Settings.get('ai-panda-hidden', false),
      ]);
      const lang = langRaw || 'en'; // Absolute default
      const ru = lang === 'ru';
      const trainingMode = settings['training-mode'] || 'strength';
      const sessionTime  = Number(settings['session-time']) || 0;
      const _modeActive  = (m) => trainingMode === m ? ' active' : '';
      const _timeActive  = (t) => sessionTime === t ? ' active' : '';

      screen.innerHTML = `
      <div class="screen-header">
        <div>
          <div class="screen-title">${ru ? 'Профиль' : 'Profile'}</div>
          <div class="screen-sub">${ru ? 'Настройки и данные' : 'Settings & data'}</div>
        </div>
      </div>

      <!-- ── Passport UI ── -->
      <div id="profile-passport"></div>

      <!-- ── Settings ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">${ru ? 'Настройки' : 'Preferences'}</span>
      </div>
      <div class="profile-card">
        <div class="pref-row pref-col" style="gap: 12px; margin-bottom: var(--sp-1);">
          <div class="pref-info">
            <div class="pref-title">AI Engine</div>
            <div class="pref-sub">${ru ? 'Выберите "мозг" вашего тренера' : 'Select the brain for your Coach'}</div>
          </div>
          <div class="engine-toggle-grid">
            <button class="engine-toggle-btn claude-active ${(settings['ai-engine'] || 'anthropic') === 'anthropic' ? 'active' : ''}" 
                    onclick="Profile.setEngine('anthropic')">
              Claude
              ${(settings['ai-engine'] || 'anthropic') === 'anthropic' ? '<span class="engine-dot"></span>' : ''}
            </button>
            <button class="engine-toggle-btn gemini-active ${settings['ai-engine'] === 'gemini' ? 'active' : ''}" 
                    onclick="Profile.setEngine('gemini')">
              Gemini
              ${settings['ai-engine'] === 'gemini' ? '<span class="engine-dot"></span>' : ''}
            </button>
          </div>
          <div class="pref-sub" style="color: var(--c-text-3); font-size: 11px;">
            ${settings['ai-engine'] === 'gemini' ? (ru ? 'Ключ Gemini отсутствует.' : 'Gemini KEY missing.') : (ru ? 'Claude 3.5 Sonnet активен.' : 'Claude 3.5 Sonnet active.')}
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">${ru ? 'Время отдыха' : 'Rest Duration'}</div>
            <div class="pref-sub">${ru ? 'По умолчанию между подходами' : 'Default rest between sets'}</div>
          </div>
          <div class="mini-stepper" style="background: var(--c-bg-3); border-radius: 12px; padding: 6px 10px; gap: 12px; display: flex; align-items: center;">
            <button onclick="Profile.adjustRest(-15)" style="width: 32px; height: 32px; border-radius: 8px; background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-1);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <span id="pref-rest-val" style="font-size: 15px; font-weight: 800; min-width: 36px; text-align: center;">${settings['rest-duration'] || 90}s</span>
            <button onclick="Profile.adjustRest(15)" style="width: 32px; height: 32px; border-radius: 8px; background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-1);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
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

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">${ru ? 'Тактильный отклик' : 'Haptic Feedback'}</div>
            <div class="pref-sub">${ru ? 'Вибрация при завершении подхода' : 'Vibrate on set completion'}</div>
          </div>
          <div class="switch-wrap" onclick="Profile.toggleHaptic()">
            <div class="switch ${settings['haptic'] !== 'off' ? 'on' : ''}" id="sw-haptic">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">${ru ? 'Не выключать экран' : 'Keep Screen Awake'}</div>
            <div class="pref-sub">${ru ? 'Предотвращать засыпание во время тренировки' : 'Prevent screen timeout during workout'}</div>
          </div>
          <div class="switch-wrap" onclick="Profile.toggleKeepAwake()">
            <div class="switch ${settings['keep-awake'] === 'on' ? 'on' : ''}" id="sw-keep-awake">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="setting-title">${ru ? 'AI Panda Помощник' : 'AI Panda Assistant'}</div>
            <div class="setting-desc">${ru ? 'Показывать панду на экране' : 'Show floating assistant'}</div>
          </div>
          <div class="switch-wrap" onclick="Profile._togglePanda()">
            <div class="switch ${!pandaHidden ? 'on' : ''}" id="sw-panda">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
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

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">${ru ? 'Маскот' : 'Home Screen Mascot'}</div>
            <div class="pref-sub">${ru ? 'Показывать панду на главном экране' : 'Show panda on empty home screen'}</div>
          </div>
          <div class="switch-wrap" onclick="Profile.toggleMascot()">
            <div class="switch ${settings['show-mascot'] !== 'off' ? 'on' : ''}" id="sw-mascot">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">Language / Язык</div>
            <div class="pref-sub">Interface language</div>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn ${lang !== 'ru' ? 'active' : ''}"
                    onclick="Profile.setLang('en')">EN</button>
            <button class="toggle-btn ${lang === 'ru' ? 'active' : ''}"
                    onclick="Profile.setLang('ru')">RU</button>
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row pref-col">
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

        <div class="pref-row pref-col">
          <div class="pref-info">
            <div class="pref-title">${ru ? 'Ограничения' : 'Limitations'}</div>
            <div class="pref-sub">${ru ? 'Травмы или инвентарь' : 'Injuries or equipment restrictions'}</div>
          </div>
          <textarea class="pref-textarea" id="pref-injuries" maxlength="200"
                    placeholder="${ru ? 'напр. болит плечо, нет штанги' : 'e.g. bad left shoulder, no barbell'}"
                    onblur="Profile.saveInjuries(this.value)"></textarea>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">${ru ? 'Длина сессии' : 'Session Length'}</div>
            <div class="pref-sub">${ru ? 'Макс. время тренировки' : 'Max time cap for suggestions'}</div>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn seg-sm${_timeActive(30)}" onclick="Profile.setSessionTime(30)">30</button>
            <button class="toggle-btn seg-sm${_timeActive(45)}" onclick="Profile.setSessionTime(45)">45</button>
            <button class="toggle-btn seg-sm${_timeActive(60)}" onclick="Profile.setSessionTime(60)">60</button>
            <button class="toggle-btn seg-sm${_timeActive(90)}" onclick="Profile.setSessionTime(90)">90</button>
            <button class="toggle-btn seg-sm${_timeActive(0)}" onclick="Profile.setSessionTime(0)">—</button>
          </div>
        </div>
      </div>

      <!-- ── Privacy ── -->
      ${renderPrivacyCard()}

      <!-- ── Data Management ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">${ru ? 'Данные' : 'Data'}</span>
      </div>
      <div class="profile-card">
        <button class="data-btn" onclick="Profile.exportData()">
          <div class="data-btn-icon" style="background:var(--c-blue-bg)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
          <div class="data-btn-info"><div class="data-btn-title">${ru ? 'Экспорт' : 'Export Backup'}</div><div class="data-btn-sub">${ru ? 'Скачать всё как JSON' : 'Download full data as JSON'}</div></div>
        </button>
        <div class="pref-divider"></div>
        <button class="data-btn" onclick="Profile.importData()">
          <div class="data-btn-icon" style="background:var(--c-accent-bg)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
          <div class="data-btn-info"><div class="data-btn-title">${ru ? 'Импорт' : 'Import Backup'}</div><div class="data-btn-sub">${ru ? 'Восстановить из файла' : 'Restore from JSON file'}</div></div>
        </button>
        <input type="file" id="import-file-input" accept=".json" style="display:none" onchange="Profile._onImportFile(event)">
      </div>

      <!-- ── Danger Zone ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label" style="color:var(--c-red)">${ru ? 'Опасная зона' : 'Danger Zone'}</span>
      </div>
      <div class="profile-card" style="border-color:rgba(255,77,136,0.15)">
        <button class="data-btn" id="clear-data-btn" onclick="Profile.clearAllData()">
          <div class="data-btn-icon" style="background:var(--c-red-bg)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <path d="M3 6h18M19 6l-1.2 13.2a2 2 0 01-2 1.8H8.2a2 2 0 01-2-1.8L5 6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
            </svg>
          </div>
          <div class="data-btn-info">
            <div class="data-btn-title" style="color:var(--c-red)">${ru ? 'Сброс всех данных' : 'Clear All Data'}</div>
            <div class="data-btn-sub">${ru ? 'Безвозвратное удаление' : 'Permanently delete everything'}</div>
          </div>
        </button>
      </div>

      <!-- ── Version (Subtle Elite) ── -->
      <div style="margin-top: 12px; padding-bottom: 80px; text-align: center; opacity: 0.25; font-size: 10px; font-weight: 800; letter-spacing: 0.15em; color: var(--c-text-2); text-transform: uppercase;">
        Athlete Pro v${VERSION} · Elite Edition
      </div>
    `;

      const injuriesEl = document.getElementById('pref-injuries');
      if (injuriesEl) injuriesEl.value = settings['coach.injuries'] || '';

      const passportEl = document.getElementById('profile-passport');
      if (passportEl) renderProfile(passportEl, lang).catch(console.error);
    } catch (err) {
      console.error('Profile load error', err);
      screen.innerHTML = '<div style="padding:20px;">Error loading profile</div>';
    }
  }

  async function adjustRest(delta) {
    const current = parseInt((await DB.Settings.get('rest-duration')) || 90);
    const next = Math.max(15, Math.min(300, current + delta));
    await DB.Settings.set('rest-duration', next);
    const el = document.getElementById('pref-rest-val');
    if (el) el.textContent = next + 's';
  }

  async function setUnit(unit) {
    await DB.Settings.set('weight-unit', unit);
    load();
  }

  async function toggleHaptic() {
    const current = await DB.Settings.get('haptic', 'on');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('haptic', next);
    load();
  }

  async function toggleAutoProgress() {
    const current = await DB.Settings.get('auto-progress', 'on');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('auto-progress', next);
    load();
  }

  async function toggleMascot() {
    const current = await DB.Settings.get('show-mascot', 'on');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('show-mascot', next);
    load();
  }

  async function setLang(lang) {
    await DB.Settings.set('lang', lang);
    localStorage.setItem('ap-settings-lang', lang);
    load();
  }

  async function setEngine(engine) {
    const { getPrivacyMode } = await import('./privacy.store.js');
    const mode = getPrivacyMode();
    
    // 🛡️ Elite Logic: Handle Privacy Restrictions
    if (mode === 'airgap') {
      Toast.show('AI disabled in Airgap mode', 'error');
      return;
    }
    
    if (mode === 'anon' && engine === 'gemini') {
      Toast.show('Gemini requires Cloud or Anon mode', 'info');
    }

    await DB.Settings.set('ai-engine', engine);
    
    // Sync FAB state & Branding
    const fab = document.getElementById('claude-fab');
    if (fab) {
      const { Claude } = await import('./claude.view.js');
      if (engine === 'gemini') {
        fab.classList.add('gemini-mode');
        const content = fab.querySelector('.fab-content');
        if (content) content.innerHTML = Claude._geminiIcon();
      } else {
        fab.classList.remove('gemini-mode');
        const content = fab.querySelector('.fab-content');
        if (content) content.innerHTML = Claude._claudeIcon();
      }
    }
    
    _haptic(20);
    load();
  }

  async function setTrainingMode(mode) {
    await DB.Settings.set('training-mode', mode);
    load();
  }

  async function saveInjuries(text) {
    await DB.Settings.set('coach.injuries', text.trim());
  }

  async function setSessionTime(minutes) {
    await DB.Settings.set('session-time', minutes);
    load();
  }

  async function exportData() {
    const json = await DB.Backup.export();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'athlete-pro-backup.json'; a.click();
  }

  function importData() {
    document.getElementById('import-file-input')?.click();
  }

  async function _onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await DB.Backup.import(text);
      Toast.show('Import success', 'success');
      load();
    } catch { Toast.show('Import failed', 'error'); }
  }

  let _deleteTapTimer = null;
  async function clearAllData() {
    const btn = document.getElementById('clear-data-btn');
    if (!btn) return;
    if (_deleteTapTimer) {
      clearTimeout(_deleteTapTimer);
      _deleteTapTimer = null;
      await DB.clearAll();
      window.location.reload();
    } else {
      _haptic(40);
      btn.classList.add('armed');
      _deleteTapTimer = setTimeout(() => {
        _deleteTapTimer = null;
        btn.classList.remove('armed');
      }, 3000);
    }
  }

  async function toggleKeepAwake() {
    const current = await DB.Settings.get('keep-awake', 'off');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('keep-awake', next);
    load();
  }

  async function _togglePanda() {
    const current = await DB.Settings.get('ai-panda-hidden', false);
    const next = !current;
    await DB.Settings.set('ai-panda-hidden', next);
    
    // Trigger FAB update
    const { Claude } = await import('./claude.view.js');
    if (next) {
      const fab = document.getElementById('claude-fab');
      if (fab) fab.remove();
    } else {
      Claude.renderFAB();
    }
    
    load();
  }

  return {
    load, adjustRest, setUnit, toggleHaptic, toggleKeepAwake, toggleAutoProgress,
    toggleMascot, setLang, setEngine, setTrainingMode,
    saveInjuries, setSessionTime, exportData, importData,
    _onImportFile, clearAllData, _togglePanda
  };
})();

function _haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }
