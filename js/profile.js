/* ════════════════════════════════════════════════════════
   profile.js — Athlete Pro  |  Block 6
   Profile: body metrics, measurements, export/import, settings
   ════════════════════════════════════════════════════════ */

'use strict';

const Profile = (() => {

  /* ══════════════════════════════════════════════
     MAIN LOAD
     ══════════════════════════════════════════════ */
  async function load() {
    const screen = document.getElementById('s-profile');
    if (!screen) return;

    const [latest, allMetrics, settings] = await Promise.all([
      DB.Metrics.latest(),
      DB.Metrics.getAll(),
      DB.Settings.getAll(),
    ]);

    screen.innerHTML = `
      <div class="screen-header">
        <div>
          <div class="screen-title">Profile</div>
          <div class="screen-sub">Settings & data</div>
        </div>
      </div>

      <!-- ── Body Stats Summary ── -->
      ${_renderBodySummary(latest)}

      <!-- ── Body Metrics Form ── -->
      <div class="section-header">
        <span class="section-label">Body Metrics</span>
        <button class="btn-text" onclick="Profile.saveMetrics()">Save</button>
      </div>
      <div class="profile-card">
        <div class="metrics-grid">
          <div class="metric-field">
            <label class="metric-label">Weight</label>
            <div class="metric-input-wrap">
              <input class="metric-input" id="m-weight" type="number"
                inputmode="decimal" step="0.1" placeholder="80.0"
                value="${latest?.weight || ''}">
              <span class="metric-unit">kg</span>
            </div>
          </div>
          <div class="metric-field">
            <label class="metric-label">Height</label>
            <div class="metric-input-wrap">
              <input class="metric-input" id="m-height" type="number"
                inputmode="numeric" step="1" placeholder="180"
                value="${latest?.height || ''}">
              <span class="metric-unit">cm</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Body Measurements ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Measurements</span>
        <button class="btn-text" onclick="Profile.saveMeasurements()">Save</button>
      </div>
      <div class="profile-card">
        <div class="metrics-grid">
          ${_measurementField('m-chest',    'Chest',      settings['m-chest'],    'cm')}
          ${_measurementField('m-waist',    'Waist',      settings['m-waist'],    'cm')}
          ${_measurementField('m-hips',     'Hips',       settings['m-hips'],     'cm')}
          ${_measurementField('m-arm-l',    'Left Arm',   settings['m-arm-l'],    'cm')}
          ${_measurementField('m-arm-r',    'Right Arm',  settings['m-arm-r'],    'cm')}
          ${_measurementField('m-thigh-l',  'Left Thigh', settings['m-thigh-l'],  'cm')}
          ${_measurementField('m-thigh-r',  'Right Thigh',settings['m-thigh-r'],  'cm')}
          ${_measurementField('m-neck',     'Neck',       settings['m-neck'],     'cm')}
        </div>
      </div>

      <!-- ── Metrics History ── -->
      ${allMetrics.length > 1 ? _renderMetricsHistory(allMetrics) : ''}

      <!-- ── Settings ── -->
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Preferences</span>
      </div>
      <div class="profile-card">
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
            <button class="toggle-btn ${(settings['weight-unit']||'kg')==='kg'?'active':''}"
                    onclick="Profile.setUnit('kg')">kg</button>
            <button class="toggle-btn ${settings['weight-unit']==='lbs'?'active':''}"
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
            <div class="switch ${settings['haptic']!=='off'?'on':''}" id="sw-haptic">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>
      </div>

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
    `;
  }

  /* ══════════════════════════════════════════════
     RENDER HELPERS
     ══════════════════════════════════════════════ */
  function _renderBodySummary(latest) {
    if (!latest) return `
      <div class="body-summary empty-state" style="padding:var(--sp-3)">
        <div class="empty-title" style="font-size:13px">No body metrics yet</div>
        <div class="empty-desc">Add your weight and height below</div>
      </div>`;

    const bmiLabel = latest.bmi < 18.5 ? 'Underweight'
      : latest.bmi < 25 ? 'Normal' : latest.bmi < 30 ? 'Overweight' : 'Obese';
    const bmiColor = latest.bmi < 18.5 ? 'var(--c-blue)'
      : latest.bmi < 25 ? 'var(--c-accent)' : latest.bmi < 30 ? 'var(--c-amber)' : 'var(--c-red)';

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

  function _renderMetricsHistory(metrics) {
    const recent = metrics.slice(0, 5);
    return `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Weight History</span>
      </div>
      <div class="profile-card">
        ${recent.map(m => `
          <div class="history-row">
            <span class="history-date">${new Date(m.timestamp).toLocaleDateString('en',{
              month:'short', day:'numeric', year:'numeric'})}</span>
            <span class="history-val">${m.weight} kg</span>
            <span class="history-bmi" style="color:${m.bmi < 25 ? 'var(--c-accent)' : 'var(--c-amber)'}">
              BMI ${m.bmi}
            </span>
          </div>`).join('')}
      </div>`;
  }

  /* ══════════════════════════════════════════════
     SAVE METRICS
     ══════════════════════════════════════════════ */
  async function saveMetrics() {
    const w = parseFloat(document.getElementById('m-weight')?.value);
    const h = parseFloat(document.getElementById('m-height')?.value);
    if (!w || !h || w <= 0 || h <= 0) {
      Toast.show('Enter valid weight and height', 'error'); return;
    }
    await DB.Metrics.save(w, h);
    Toast.show('Body metrics saved', 'success');
    load();
  }

  async function saveMeasurements() {
    const fields = ['m-chest','m-waist','m-hips','m-arm-l','m-arm-r','m-thigh-l','m-thigh-r','m-neck'];
    const saves  = fields.map(id => {
      const val = document.getElementById(id)?.value;
      return val ? DB.Settings.set(id, val) : Promise.resolve();
    });
    await Promise.all(saves);
    Toast.show('Measurements saved', 'success');
  }

  /* ══════════════════════════════════════════════
     PREFERENCES
     ══════════════════════════════════════════════ */
  async function adjustRest(delta) {
    const current = parseInt((await DB.Settings.get('rest-duration')) || 90);
    const next    = Math.max(15, Math.min(300, current + delta));
    await DB.Settings.set('rest-duration', next);
    const el = document.getElementById('pref-rest-val');
    if (el) el.textContent = next + 's';
  }

  async function setUnit(unit) {
    await DB.Settings.set('weight-unit', unit);
    document.querySelectorAll('.toggle-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.trim() === unit);
    });
  }

  async function toggleHaptic() {
    const current = await DB.Settings.get('haptic', 'on');
    const next    = current === 'off' ? 'on' : 'off';
    await DB.Settings.set('haptic', next);
    const sw = document.getElementById('sw-haptic');
    if (sw) sw.classList.toggle('on', next === 'on');
  }

  /* ══════════════════════════════════════════════
     EXPORT / IMPORT
     ══════════════════════════════════════════════ */
  async function exportData() {
    try {
      const json = await DB.Backup.export();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href     = url;
      a.download = `athlete-pro-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show('Backup downloaded', 'success');
    } catch (e) {
      Toast.show('Export failed', 'error');
    }
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
  async function clearAllData() {
    const confirmed = confirm(
      'This will permanently delete ALL workouts, metrics, and settings. This cannot be undone.

Type OK to confirm.'
    );
    if (!confirmed) return;
    await DB.clearAll();
    Toast.show('All data cleared', 'info');
    load();
    Dashboard.load();
  }

  return {
    load, saveMetrics, saveMeasurements,
    adjustRest, setUnit, toggleHaptic,
    exportData, importData, _onImportFile,
    clearAllData,
  };

})();
