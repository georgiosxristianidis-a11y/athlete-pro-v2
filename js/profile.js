// @ts-check
/* ════════════════════════════════════════════════════════
   profile.js — Athlete Pro  |  Profile: settings, metrics, data management
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { renderPrivacyCard } from './privacy.view.js';
import { renderProfile } from './profile.view.js';
import { renderSettings } from './profile.view/settings.js';
import { VERSION } from './version.js';
import { Toast } from './shell.js';

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
    if (!screen) return;

    try {
      const [settings, langRaw, pandaHidden, serverStatus] = await Promise.all([
        DB.Settings.getAll(),
        DB.Settings.get('lang', 'en'),
        DB.Settings.get('ai-panda-hidden', false),
        fetch('/api/ai-status').then(r => r.json()).catch(() => ({ gemini: false, anthropic: false }))
      ]);
      const lang = langRaw || 'en';
      const ru = lang === 'ru';

      screen.innerHTML = `
      <div class="screen-header">
        <div>
          <div class="screen-title">${ru ? 'Профиль' : 'Profile'}</div>
          <div class="screen-sub">${ru ? 'Настройки и данные' : 'Settings & data'}</div>
        </div>
      </div>

      <!-- ── Passport UI ── -->
      <div id="profile-passport"></div>

      <!-- ── APP SETTINGS (MODULAR) ── -->
      ${renderSettings(settings, lang, serverStatus)}

      <!-- ── PRIVACY ── -->
      <div class="section-label-alt">${ru ? 'ПРИВАТНОСТЬ' : 'PRIVACY'}</div>
      ${renderPrivacyCard()}

      <!-- ── DANGER ZONE ── -->
      <div class="section-label-alt" style="color:var(--c-red); opacity:0.8">DANGER ZONE</div>
      <button class="danger-btn" id="clear-data-btn" onclick="Profile.clearAllData()" style="width:calc(100% - 32px); margin: 0 auto; height:46px; font-size:14px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        <span>${ru ? 'Сброс всех данных' : 'Clear All Data'}</span>
      </button>

      <!-- ── Version (Subtle Elite) ── -->
      <div style="margin-top: 48px; padding-bottom: 120px; text-align: center; opacity: 0.25; font-size: 10px; font-weight: 800; letter-spacing: 0.15em; color: var(--c-text-2); text-transform: uppercase;">
        Athlete Pro v${VERSION} · Elite Edition
      </div>
      <input type="file" id="import-file-input" accept=".json" style="display:none" onchange="Profile._onImportFile(event)">
    `;

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
    load();
  }

  async function toggleReminder() {
    const current = await DB.Settings.get('daily-reminder', 'off');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('daily-reminder', next);
    if (next === 'on') {
      Toast.show(document.documentElement.lang === 'ru' ? 'Уведомления включены' : 'Notifications enabled', 'success');
    }
    load();
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

  async function togglePanda() {
    const current = await DB.Settings.get('ai-panda-hidden', false);
    const next = !current;
    await DB.Settings.set('ai-panda-hidden', next);
    await DB.Settings.set('show-mascot', next ? 'off' : 'on');
    
    const { Claude } = await import('./claude.view.js');
    if (next) {
      const fab = document.getElementById('claude-fab');
      if (fab) fab.remove();
    } else {
      Claude.renderFAB();
    }
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
    if (mode === 'airgap') {
      Toast.show('AI disabled in Airgap mode', 'error');
      return;
    }
    await DB.Settings.set('ai-engine', engine);
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

  async function setGeminiKey(key) {
    await DB.Settings.set('gemini-key', key.trim());
    const { Claude } = await import('./claude.view.js');
    const fab = document.getElementById('claude-fab');
    if (fab) fab.remove();
    Claude.renderFAB();
    load();
  }

  async function saveInjuries(val) {
    await DB.Settings.set('limitations', val.trim());
    Toast.show('Limitations saved', 'success');
  }

  return {
    load, adjustRest, setUnit, toggleHaptic, toggleKeepAwake, toggleAutoProgress,
    togglePanda, setLang, setEngine, setTrainingMode, setGeminiKey,
    setSessionTime, exportData, importData, toggleReminder,
    _onImportFile, clearAllData, saveInjuries
  };
})();

function _haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }
