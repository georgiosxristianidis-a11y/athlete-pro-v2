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
      const [settings, lang] = await Promise.all([
        DB.Settings.getAll(),
        DB.Settings.get('lang', 'en'),
      ]);
      const trainingMode = settings['training-mode'] || 'strength';
      const sessionTime  = Number(settings['session-time']) || 0;
      const _modeActive  = (m) => trainingMode === m ? ' active' : '';
      const _timeActive  = (t) => sessionTime === t ? ' active' : '';
      const ru = lang === 'ru';
      screen.innerHTML = `
      <div class="screen-header">
        <div>
          <div class="screen-title">${ru ? 'Профиль' : 'Profile'}</div>
          <div class="screen-sub">${ru ? 'Настройки и данные' : 'Settings & data'}</div>
        </div>
      </div>

      <!-- ── Passport UI (rendered async below) ── -->
      <div id="profile-passport"></div>

      <!-- ── Settings ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Preferences</span>
      </div>
      <div class="profile-card">
        <div class="pref-row pref-col" style="gap: 10px;">
          <div class="pref-info">
            <div class="pref-title">AI Engine</div>
            <div class="pref-sub">Select the brain for your Coach</div>
          </div>
          <div class="toggle-group" style="gap: 12px; margin-top: 4px;">
            <button class="toggle-btn toggle-engine-btn ${(settings['ai-engine'] || 'anthropic') === 'anthropic' ? 'active' : ''}" 
                    onclick="Profile.setEngine('anthropic')" 
                    style="display: inline-flex; align-items: center; gap: 6px;">
              Anthropic
              ${(settings['ai-engine'] || 'anthropic') === 'anthropic' ? '<span class="engine-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #00e676; display: inline-block; box-shadow: 0 0 8px #00e676;"></span>' : ''}
            </button>
            <button class="toggle-btn toggle-engine-btn ${settings['ai-engine'] === 'gemini' ? 'active' : ''}" 
                    onclick="Profile.setEngine('gemini')">
              Gemini
            </button>
          </div>
          <div class="pref-sub" style="color: var(--c-text-3); font-size: 11px; margin-top: 2px;">
            Gemini KEY missing.
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">Rest Duration</div>
            <div class="pref-sub">Default rest between sets</div>
          </div>
          <div class="mini-stepper">
            <button onclick="Profile.adjustRest(-15)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" width="12" height="12">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <span id="pref-rest-val">${settings['rest-duration'] || 90}s</span>
            <button onclick="Profile.adjustRest(15)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" width="12" height="12">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">Weight Unit</div>
            <div class="pref-sub">Kilograms or pounds</div>
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
            <div class="pref-title">Haptic Feedback</div>
            <div class="pref-sub">Vibrate on set completion</div>
          </div>
          <div class="switch-wrap" onclick="Profile.toggleHaptic()">
            <div class="switch ${settings['haptic'] !== 'off' ? 'on' : ''}" id="sw-haptic">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">AI Smart Progress</div>
            <div class="pref-sub">Auto +2.5 kg when last set hit target with reps in reserve</div>
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
            <div class="pref-title">Home Screen Mascot</div>
            <div class="pref-sub">Show panda animation on empty home screen</div>
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
            <div class="pref-title">Training Mode</div>
            <div class="pref-sub">Coach adapts advice to your current phase</div>
          </div>
          <div class="toggle-group seg-full">
            <button class="toggle-btn seg-sm${_modeActive('strength')}"
                    onclick="Profile.setTrainingMode('strength')">Strength</button>
            <button class="toggle-btn seg-sm${_modeActive('hypertrophy')}"
                    onclick="Profile.setTrainingMode('hypertrophy')">Hypertrophy</button>
            <button class="toggle-btn seg-sm${_modeActive('recovery')}"
                    onclick="Profile.setTrainingMode('recovery')">Recovery</button>
            <button class="toggle-btn seg-sm${_modeActive('maintenance')}"
                    onclick="Profile.setTrainingMode('maintenance')">Maint.</button>
          </div>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row pref-col">
          <div class="pref-info">
            <div class="pref-title">Limitations</div>
            <div class="pref-sub">Injuries or equipment restrictions for Coach</div>
          </div>
          <textarea class="pref-textarea" id="pref-injuries" maxlength="200"
                    placeholder="e.g. bad left shoulder, no barbell"
                    onblur="Profile.saveInjuries(this.value)"></textarea>
        </div>

        <div class="pref-divider"></div>

        <div class="pref-row">
          <div class="pref-info">
            <div class="pref-title">Session Length</div>
            <div class="pref-sub">Max time cap for Coach suggestions</div>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn seg-sm${_timeActive(30)}"
                    onclick="Profile.setSessionTime(30)">30</button>
            <button class="toggle-btn seg-sm${_timeActive(45)}"
                    onclick="Profile.setSessionTime(45)">45</button>
            <button class="toggle-btn seg-sm${_timeActive(60)}"
                    onclick="Profile.setSessionTime(60)">60</button>
            <button class="toggle-btn seg-sm${_timeActive(90)}"
                    onclick="Profile.setSessionTime(90)">90</button>
            <button class="toggle-btn seg-sm${_timeActive(0)}"
                    onclick="Profile.setSessionTime(0)">—</button>
          </div>
        </div>
      </div>

      <!-- ── Privacy ── -->
      ${renderPrivacyCard()}

      <!-- ── Data Management ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Data</span>
      </div>
      <div class="profile-card">
        <button class="data-btn" onclick="Profile.exportData()">
          <div class="data-btn-icon" style="background:var(--c-blue-bg)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div class="data-btn-info">
            <div class="data-btn-title">Export Backup</div>
            <div class="data-btn-sub">Download full data as JSON</div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <div class="pref-divider"></div>

        <button class="data-btn" onclick="Profile.importData()">
          <div class="data-btn-icon" style="background:var(--c-accent-bg)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="data-btn-info">
            <div class="data-btn-title">Import Backup</div>
            <div class="data-btn-sub">Restore from JSON file</div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <input type="file" id="import-file-input" accept=".json"
               style="display:none" onchange="Profile._onImportFile(event)">
      </div>

      <!-- ── Danger Zone ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label" style="color:var(--c-red)">Danger Zone</span>
      </div>
      <div class="profile-card" style="border-color:rgba(255,71,87,0.15)">
        <button class="data-btn" onclick="Profile.clearAllData()">
          <div class="data-btn-icon" style="background:var(--c-red-bg)">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-red)"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </div>
          <div class="data-btn-info">
            <div class="data-btn-title" style="color:var(--c-red)">Clear All Data</div>
            <div class="data-btn-sub">Permanently delete everything</div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)"
               stroke-width="1.5" stroke-linecap="round" width="16" height="16">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      <div style="height:var(--sp-4)"></div>
      
      <!-- ── Version Footer ── -->
      <div style="margin-top: 80px; padding-bottom: 40px; text-align: center; opacity: 0.15; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--c-text-3); text-transform: uppercase;">
        Athlete Pro v${VERSION} · Elite Edition
      </div>
    `;

      // Populate injuries textarea with saved value (safe — set via .value, not innerHTML)
      const injuriesEl = document.getElementById('pref-injuries');
      if (injuriesEl) injuriesEl.value = settings['coach.injuries'] || '';

      // Render passport UI async into its placeholder
      const passportEl = document.getElementById('profile-passport');
      if (passportEl) renderProfile(passportEl, lang).catch(console.error);
    } catch (err) {
      console.error('Profile load error', err);
      screen.innerHTML = '<div style="padding:20px;">Error loading profile</div>';
    }
  }

  /* ══════════════════════════════════════════════
     RENDER HELPERS
     ══════════════════════════════════════════════ */
  /**
   * Render the body summary card (weight, height, BMI).
   * @param {{weight: number, height: number, bmi: number}|null} latest — latest body metric record
   * @returns {string} — HTML string
   */
  function _renderBodySummary(latest) {
    if (!latest)
      return `
      <div class="body-summary empty-state" style="padding:var(--sp-3)">
        <div class="empty-title" style="font-size:13px">No body metrics yet</div>
        <div class="empty-desc">Add your weight and height below</div>
      </div>`;

    const bmiLabel =
      latest.bmi < 18.5
        ? 'Underweight'
        : latest.bmi < 25
          ? 'Normal'
          : latest.bmi < 30
            ? 'Overweight'
            : 'Obese';
    const bmiColor =
      latest.bmi < 18.5
        ? 'var(--c-blue)'
        : latest.bmi < 25
          ? 'var(--c-accent)'
          : latest.bmi < 30
            ? 'var(--c-red)'
            : 'var(--c-red)';

    return `
      <div class="body-summary">
        <div class="body-stat">
          <div class="body-stat-val">${latest.weight}<span class="body-stat-unit">kg</span></div>
          <div class="body-stat-label">Weight</div>
        </div>
        <div class="body-stat-divider"></div>
        <div class="body-stat">
          <div class="body-stat-val">${latest.height}<span class="body-stat-unit">cm</span></div>
          <div class="body-stat-label">Height</div>
        </div>
        <div class="body-stat-divider"></div>
        <div class="body-stat">
          <div class="body-stat-val" style="color:${bmiColor}">${latest.bmi}</div>
          <div class="body-stat-label">${bmiLabel}</div>
        </div>
      </div>`;
  }

  /**
   * Build an input field HTML snippet for a body measurement.
   * @param {string} id — element id
   * @param {string} label — field label text
   * @param {string|number} value — current value
   * @param {string} unit — unit label (e.g. 'cm', 'kg')
   * @returns {string} — HTML string
   */
  function _measurementField(id, label, value, unit) {
    return `
      <div class="metric-field">
        <label class="metric-label">${label}</label>
        <div class="metric-input-wrap">
          <input class="metric-input" id="${id}" type="number"
            inputmode="decimal" step="0.5" placeholder="—"
            value="${value || ''}">
          <span class="metric-unit">${unit}</span>
        </div>
      </div>`;
  }

  /**
   * Render the weight history section (last 5 entries).
   * @param {Array<{timestamp: number, weight: number, bmi: number}>} metrics
   * @returns {string} — HTML string
   */
  function _renderMetricsHistory(metrics) {
    const recent = metrics.slice(0, 5);
    return `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Weight History</span>
      </div>
      <div class="profile-card">
        ${recent
          .map(
            (m) => `
          <div class="history-row">
            <span class="history-date">${new Date(m.timestamp).toLocaleDateString('en', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}</span>
            <span class="history-val">${m.weight} kg</span>
            <span class="history-bmi" style="color:${m.bmi < 25 ? 'var(--c-accent)' : 'var(--c-red)'}">
              BMI ${m.bmi}
            </span>
          </div>`
          )
          .join('')}
      </div>`;
  }

  /* ══════════════════════════════════════════════
     SAVE METRICS
     ══════════════════════════════════════════════ */
  /**
   * Save body metrics (weight, height) from form inputs.
   * @returns {Promise<void>}
   */
  async function saveMetrics() {
    const w = parseFloat(document.getElementById('m-weight')?.value);
    const h = parseFloat(document.getElementById('m-height')?.value);
    if (!w || !h || w <= 0 || h <= 0) {
      Toast.show('Enter valid weight and height', 'error');
      return;
    }
    await DB.Metrics.save(w, h);
    Toast.show('Body metrics saved', 'success');
    load();
  }

  /**
   * Save body measurements from form inputs.
   * @returns {Promise<void>}
   */
  async function saveMeasurements() {
    const fields = [
      'm-chest',
      'm-waist',
      'm-hips',
      'm-arm-l',
      'm-arm-r',
      'm-thigh-l',
      'm-thigh-r',
      'm-neck',
    ];
    const saves = fields.map((id) => {
      const val = document.getElementById(id)?.value;
      return val ? DB.Settings.set(id, val) : Promise.resolve();
    });
    await Promise.all(saves);
    Toast.show('Measurements saved', 'success');
  }

  /* ══════════════════════════════════════════════
     PREFERENCES
     ══════════════════════════════════════════════ */
  /**
   * Adjust the default rest duration by a delta value.
   * @param {number} delta — seconds to add or subtract (e.g. 15 or -15)
   * @returns {Promise<void>}
   */
  async function adjustRest(delta) {
    const current = parseInt((await DB.Settings.get('rest-duration')) || 90);
    const next = Math.max(15, Math.min(300, current + delta));
    await DB.Settings.set('rest-duration', next);
    const el = document.getElementById('pref-rest-val');
    if (el) el.textContent = next + 's';
  }

  /**
   * Set the preferred weight unit and update the toggle UI.
   * @param {'kg'|'lbs'} unit
   * @returns {Promise<void>}
   */
  async function setUnit(unit) {
    await DB.Settings.set('weight-unit', unit);
    document.querySelectorAll('.toggle-btn').forEach((b) => {
      b.classList.toggle('active', b.textContent.trim() === unit);
    });
  }

  /**
   * Toggle haptic feedback preference between on and off.
   * @returns {Promise<void>}
   */
  async function toggleHaptic() {
    const current = await DB.Settings.get('haptic', 'on');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('haptic', next);
    const sw = document.getElementById('sw-haptic');
    if (sw) sw.classList.toggle('on', next === 'on');
  }

  /**
   * Toggle AI Smart Progress: auto +2.5kg when last set hits target with reps in reserve.
   * Read by buildSession() in workout.store.js when starting a session.
   * @returns {Promise<void>}
   */
  async function toggleAutoProgress() {
    const current = await DB.Settings.get('auto-progress', 'on');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('auto-progress', next);
    const sw = document.getElementById('sw-auto-progress');
    if (sw) sw.classList.toggle('on', next === 'on');
  }

  /**
   * Toggle the home screen mascot (panda video) on or off.
   * @returns {Promise<void>}
   */
  async function toggleMascot() {
    const current = await DB.Settings.get('show-mascot', 'on');
    const next = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('show-mascot', next);
    const sw = document.getElementById('sw-mascot');
    if (sw) sw.classList.toggle('on', next === 'on');
  }

  /**
   * Set the UI language and reload profile screen.
   * @param {'en'|'ru'} lang
   * @returns {Promise<void>}
   */
  async function setLang(lang) {
    await DB.Settings.set('lang', lang);
    load();
  }

  /* ══════════════════════════════════════════════
     AI COACH PREFERENCES
     ══════════════════════════════════════════════ */

  /**
   * Set the active AI engine (anthropic or gemini)
   * @param {'anthropic'|'gemini'} engine
   * @returns {Promise<void>}
   */
  async function setEngine(engine) {
    const { getPrivacyMode } = await import('./privacy.store.js');
    if (getPrivacyMode() === 'airgap') {
      if (confirm('AI Coach is blocked in Air-Gapped mode. Would you like to open Privacy settings to enable it?')) {
        const card = document.querySelector('.privacy-card');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth' });
          card.style.transition = 'box-shadow 0.3s ease';
          card.style.boxShadow = '0 0 15px var(--c-accent)';
          setTimeout(() => {
            card.style.boxShadow = '';
          }, 1500);
        }
      }
      return;
    }

    await DB.Settings.set('ai-engine', engine);

    const fab = document.getElementById('claude-fab');
    if (fab) {
      const { Claude } = await import('./claude.view.js');
      const vid = fab.querySelector('video');
      if (!vid) {
        if (engine === 'gemini') {
          fab.innerHTML = Claude._geminiIcon();
        } else {
          fab.innerHTML = Claude._claudeIcon();
        }
      }
    }

    load();
  }

  /**
   * Set the training mode (strength / hypertrophy / recovery / maintenance).
   * @param {'strength'|'hypertrophy'|'recovery'|'maintenance'} mode
   * @returns {Promise<void>}
   */
  async function setTrainingMode(mode) {
    await DB.Settings.set('training-mode', mode);
    document.querySelectorAll('[onclick^="Profile.setTrainingMode"]').forEach((b) => {
      const btnMode = b.getAttribute('onclick').match(/'([^']+)'/)?.[1];
      b.classList.toggle('active', btnMode === mode);
    });
  }

  /**
   * Save the free-text limitations/injuries note for AI Coach.
   * @param {string} text — raw value from textarea
   * @returns {Promise<void>}
   */
  async function saveInjuries(text) {
    const trimmed = String(text || '').slice(0, 200).trim();
    await DB.Settings.set('coach.injuries', trimmed);
  }

  /**
   * Set the session time cap (minutes). 0 = unlimited.
   * @param {number} minutes — 30 | 45 | 60 | 90 | 0
   * @returns {Promise<void>}
   */
  async function setSessionTime(minutes) {
    await DB.Settings.set('session-time', minutes);
    document.querySelectorAll('[onclick^="Profile.setSessionTime"]').forEach((b) => {
      const btnTime = Number(b.getAttribute('onclick').match(/\((\d+)\)/)?.[1] ?? -1);
      b.classList.toggle('active', btnTime === minutes);
    });
  }

  /* ══════════════════════════════════════════════
     EXPORT / IMPORT
     ══════════════════════════════════════════════ */
  /**
   * Export all application data as a JSON file download.
   * @returns {Promise<void>}
   */
  async function exportData() {
    try {
      const json = await DB.Backup.export();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `athlete-pro-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show('Backup downloaded', 'success');
    } catch (e) {
      Toast.show('Export failed', 'error');
    }
  }

  /**
   * Open the file picker to import a JSON backup file.
   * @returns {void}
   */
  function importData() {
    document.getElementById('import-file-input')?.click();
  }

  /**
   * Handle the file input change event to process a JSON import.
   * @param {Event} e — file input change event
   * @returns {Promise<void>}
   */
  async function _onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await DB.Backup.import(text);
      Toast.show('Data imported successfully', 'success');
      load();
      Dashboard.load();
    } catch (err) {
      Toast.show('Import failed — invalid file', 'error');
    }
    e.target.value = '';
  }

  /* ══════════════════════════════════════════════
     DANGER ZONE
     ══════════════════════════════════════════════ */
  /**
   * Clear all application data after user confirmation.
   * @returns {Promise<void>}
   */
  async function clearAllData() {
    const confirmed = confirm(
      'This will permanently delete ALL workouts, metrics, and settings. This cannot be undone.\n\nType OK to confirm.'
    );
    if (!confirmed) return;
    await DB.clearAll();
    Toast.show('All data cleared', 'info');
    load();
    Dashboard.load();
  }

  return {
    load,
    saveMetrics,
    saveMeasurements,
    adjustRest,
    setUnit,
    toggleHaptic,
    toggleAutoProgress,
    toggleMascot,
    setLang,
    setEngine,
    setTrainingMode,
    saveInjuries,
    setSessionTime,
    exportData,
    importData,
    _onImportFile,
    clearAllData,
  };
})();
