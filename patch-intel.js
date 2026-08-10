const fs = require('fs');

let content = fs.readFileSync('js/intel.view.js', 'utf-8');

// 1. Add currentPlan and AbortController to the top of IntelView
content = content.replace('  let _hasValidKey = false;', \  let _hasValidKey = false;
  let _currentAbort = null;
  let currentPlan = null;

  async function _getEngine() {
    const { DB } = await import('./db.js');
    return (await DB.Settings.get('ai-engine')) || 'gemini';
  }

  function abortRequest() {
    if (_currentAbort) {
      _currentAbort.abort();
      _currentAbort = null;
      IntelStore.addLog('SYS', 'Request aborted by user.');
      IntelStore.setStatus('SYSTEM STANDBY');
      _clearModuleLoaders();
    }
  }

  const DICT = {
    en: { summary: 'SUMMARY', generate: 'GENERATE', analyze: 'ANALYZE', biometrics: 'BIOMETRICS', input: 'Command query...', sys: 'SYSTEM STANDBY' },
    ru: { summary: 'СВОДКА', generate: 'ГЕНЕРАЦИЯ', analyze: 'АНАЛИЗ', biometrics: 'БИОМЕТРИЯ', input: 'Ожидаю команду...', sys: 'ОЖИДАНИЕ' }
  };

  async function _getVoice() {
    const { DB } = await import('./db.js');
    return (await DB.Settings.get('intel-voice')) || 'Fenrir';
  }

  async function _getLang() {
    const { DB } = await import('./db.js');
    return (await DB.Settings.get('intel-lang')) || 'en';
  }\);

// 2. Add Export Plan listener to the top
content = content.replace(\on('intel:closeReport',   (el) => el.closest('.intel-report-overlay')?.remove());\, \on('intel:closeReport',   (el) => el.closest('.intel-report-overlay, .intel-overlay')?.remove());
on('intel:openSettings',  () => window.IntelView.openSettings());
on('intel:exportPlan',    async (el) => {
  const plan = window.IntelView.currentPlan;
  if (plan) {
    const { DB } = await import('./db.js');
    await DB.PlannedWorkouts.add({ date: new Date().toISOString(), plan, name: 'AI Generated Plan' });
    const btn = el;
    btn.textContent = 'Экспортировано!';
    btn.style.background = 'var(--c-accent)';
    setTimeout(() => el.closest('.intel-overlay')?.remove(), 1000);
  }
});\);

content = content.replace(\on('intel:close',         () => { window.Nav.go('s-home'); });\, \on('intel:close',         () => { window.IntelView.abortRequest(); window.Nav.go('s-home'); });\);

// 3. Update load() method
content = content.replace(/async function load\\(\\)\\s*\\{[\\s\\S]*?function renderLogs/m, \sync function load() {
    const screen = document.getElementById('s-intel');
    if (!screen) return;

    if (!_initialized) {
      IntelStore.init();
      _initialized = true;
    }

    await _checkApiKey();
    const lang = await _getLang();
    const d = DICT[lang] || DICT['en'];

    screen.innerHTML = \\\
      <header class="intel-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h1 class="intel-title" style="view-transition-name: panda-core-title;">P.A.N.D.A. Core</h1>
          <div class="intel-sub">
            <span class="ai-indicator \\\" style="margin-right:4px;"></span>
            <span style="color: \\\; font-weight:var(--fw-bold); text-transform:lowercase; opacity:0.8;">\\\</span>
            <span style="opacity:0.2; margin: 0 6px;">|</span>
            <span id="intel-status-text" style="color: var(--c-text-2); font-weight:var(--fw-black); text-transform:lowercase;">\\\</span>
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          <button data-action="intel:openSettings" style="background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer; padding:4px 12px;">⋮</button>
          <button data-action="intel:close" style="background:none; border:none; color:var(--c-text-3); font-size:var(--fs-6); font-weight:var(--fw-md); cursor:pointer; padding:0 8px;">&times;</button>
        </div>
      </header>

      <div class="intel-body">
        <div id="intel-feedback-feed"></div>

        <div id="intel-vision-preview-wrap"></div>

        <div class="intel-modules-grid">
          <button class="intel-module-card" data-action="intel:weekly">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-intel) 15%, transparent); color:var(--c-intel)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </div>
            <span class="intel-module-label" data-i18n="summary">\\\</span>
          </button>
          <button class="intel-module-card" data-action="intel:createWorkout">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-accent) 15%, transparent); color:var(--c-accent)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span class="intel-module-label" data-i18n="generate">\\\</span>
          </button>
          <button class="intel-module-card" data-action="intel:analyzeStats">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-blue) 15%, transparent); color:var(--c-blue)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </div>
            <span class="intel-module-label" data-i18n="analyze">\\\</span>
          </button>
          <button class="intel-module-card" data-action="intel:biometrics">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-red) 12%, transparent); color:var(--c-red)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <span class="intel-module-label" data-i18n="biometrics">\\\</span>
          </button>
        </div>

        <div class="intel-logs">
          <div class="intel-logs-header">
            <h3 class="intel-logs-title">STREAMING_LOGS</h3>
            <span class="intel-logs-status" id="intel-logs-status-pill">ONLINE</span>
          </div>
          <div id="intel-logs-container"></div>
        </div>
      </div>

      <div class="intel-cmd-wrap">
        <div class="intel-cmd-bar">
          <button class="intel-btn-icon" data-action="intel:camera">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </button>
          <input type="text" id="intel-input" class="intel-cmd-input" placeholder="\\\" data-keydown="intel:submitEnter" autocomplete="off" spellcheck="false">
          <button class="intel-btn-icon intel-btn-send" data-action="intel:submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <input type="file" id="intel-file-input" accept="image/*" style="display:none" data-change="intel:fileSelected">
      </div>
    \\\;

    renderLogs();
    _listen();
    _initTilt();
    
    IntelStore.setStatus(d.sys);
    const el = document.getElementById('intel-status-text');
    if (el) el.textContent = d.sys;
  }

  function renderLogs\);

// 4. Update submit API payload
content = content.replace(/body: JSON\\.stringify\\(\\{\\s*messages[\\s\\S]*?\\}\\)/, \ody: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          images: image ? [image] : [],
          workouts,
          profile,
          topLifts,
          engine: await _getEngine(),
          customKey: (await DB.Settings.get('gemini-key')) || undefined,
          language: await _getLang()
        })\);

content = content.replace(/const response = await fetch\\('\\/api\\/coach', \\{/, \bortRequest();
      _currentAbort = new AbortController();

      const response = await fetch('/api/coach', {
        signal: _currentAbort.signal,\);


// 5. Update tts API payload and animation
content = content.replace(/body: JSON\\.stringify\\(\\{\\s*text: textToSpeak,[\\s\\S]*?\\}\\)/, \ody: JSON.stringify({ 
          text: textToSpeak,
          customKey: await (await import('./db.js')).DB.Settings.get('gemini-key'),
          language: await _getLang(),
          voice: await _getVoice()
        })\);
content = content.replace(/audio\\.onended = \\(\\).*?\\URL\\.revokeObjectURL\\(audioUrl\\); \\};/g, \// Visual indicator start
      document.body.classList.add('intel-is-speaking');
      const statusPill = document.getElementById('intel-logs-status-pill');
      if (statusPill) { statusPill.textContent = 'VOICE ACTIVE'; statusPill.style.color = 'var(--c-intel)'; }

      audio.onended = () => { 
        _isSpeaking = false; 
        URL.revokeObjectURL(audioUrl); 
        document.body.classList.remove('intel-is-speaking');
        IntelStore.setStatus('SYSTEM STANDBY');
      };\);
content = content.replace(/IntelStore\\.addLog\\('ERROR', 'Voice synthesis failed'\\);[\\s]*_isSpeaking = false;/g, \IntelStore.addLog('ERROR', 'Voice synthesis failed'); 
      _isSpeaking = false; 
      document.body.classList.remove('intel-is-speaking');\);

// 6. Update Weekly API payload and overlays and generation
content = content.replace(/body: JSON\\.stringify\\(\\{\\s*workouts: recentWorkouts,[\\s\\S]*?\\}\\)/, \ody: JSON.stringify({ 
           workouts: recentWorkouts, 
           profile, 
           engine: await _getEngine(),
           customKey: (await DB.Settings.get('gemini-key')) || undefined,
           language: await _getLang()
         })\);

content = content.replace(/body: JSON\\.stringify\\(\\{\\s*workoutHistory: workouts,[\\s\\S]*?\\}\\)/, \ody: JSON.stringify({ 
           workoutHistory: workouts, 
           oneRMs,
           goals: profile.goal || 'strength',
           experience: profile.experience || 'intermediate',
           engine: await _getEngine(),
           customKey: (await DB.Settings.get('gemini-key')) || undefined,
           language: await _getLang()
         })\);

content = content.replace(/body: JSON\\.stringify\\(\\{\\s*workouts,[\\s]*profile,[\\s]*customKey[\\s\\S]*?\\}\\)/g, \ody: JSON.stringify({ 
           workouts, 
           profile, 
           engine: await _getEngine(),
           customKey: (await DB.Settings.get('gemini-key')) || undefined,
           language: await _getLang()
         })\);

// 7. Add currentAbort signals
content = content.replace(/const response = await fetch\\('\\/api\\/coach\\/weekly-report', \\{/, \bortRequest();
       _currentAbort = new AbortController();

       const response = await fetch('/api/coach/weekly-report', {
         signal: _currentAbort.signal,\);

content = content.replace(/const response = await fetch\\('\\/api\\/coach\\/generate-plan', \\{/, \bortRequest();
       _currentAbort = new AbortController();

       const response = await fetch('/api/coach/generate-plan', {
         signal: _currentAbort.signal,\);

content = content.replace(/const response = await fetch\\('\\/api\\/coach\\/analyze-latest', \\{/, \bortRequest();
       _currentAbort = new AbortController();

       const response = await fetch('/api/coach/analyze-latest', {
         signal: _currentAbort.signal,\);

content = content.replace(/const response = await fetch\\('\\/api\\/coach\\/biometrics-scan', \\{/, \bortRequest();
       _currentAbort = new AbortController();

       const response = await fetch('/api/coach/biometrics-scan', {
         signal: _currentAbort.signal,\);

// 8. Fix overlays borders and currentPlan export
content = content.replace(/border:1px solid var\\(--c-border-h\\);/g, '');
content = content.replace(/const \\{ plan \\} = await response.json\\(\\);\\n\\s*IntelStore/g, \const { plan } = await response.json();\\n       currentPlan = plan;\\n       IntelStore\);
content = content.replace(/data-plan='.*?'/, '');

// 9. Add openSettings and expose to window
content = content.replace(/function _buildReadinessWidget\\(data\\) \\{/, \sync function openSettings() {
    const lang = await _getLang();
    const voice = await _getVoice();
    
    const overlay = document.createElement('div');
    overlay.className = 'intel-overlay animate-in fade-in duration-500';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(5,5,7,0.95); backdrop-filter:blur(20px); display:flex; align-items:center; justify-content:center; padding:20px;';
    
    overlay.innerHTML = \\\
      <div style="background:var(--c-bg-1); width:100%; max-width:400px; border-radius:32px; padding:40px; position:relative;">
        <button data-action="intel:closeReport" style="position:absolute; top:24px; right:24px; background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer;">&times;</button>
        <h2 style="color:var(--c-text-1); margin-bottom:24px; font-family:var(--font-heading); font-size:var(--fs-4);">AI Settings</h2>
        
        <div style="margin-bottom:20px;">
          <label style="display:block; color:var(--c-text-3); font-size:var(--fs-1); margin-bottom:8px; text-transform:uppercase;">Language</label>
          <select id="intel-lang-select" style="width:100%; padding:12px; border-radius:12px; background:var(--c-surface); border:1px solid var(--c-border); color:var(--c-text-1);">
            <option value="en" \\\>English</option>
            <option value="ru" \\\>Русский</option>
          </select>
        </div>
        
        <div style="margin-bottom:24px;">
          <label style="display:block; color:var(--c-text-3); font-size:var(--fs-1); margin-bottom:8px; text-transform:uppercase;">Voice Persona (TTS)</label>
          <select id="intel-voice-select" style="width:100%; padding:12px; border-radius:12px; background:var(--c-surface); border:1px solid var(--c-border); color:var(--c-text-1);">
            <option value="Fenrir" \\\>Fenrir (Stern / Грубый)</option>
            <option value="Aoede" \\\>Aoede (Soft / Мягкий)</option>
            <option value="Puck" \\\>Puck (Neutral / Нейтральный)</option>
          </select>
        </div>
        
        <button id="intel-save-settings" style="width:100%; padding:14px; border-radius:16px; background:var(--c-intel); border:none; color:black; font-weight:var(--fw-black); cursor:pointer;">SAVE & RELOAD</button>
      </div>
    \\\;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('#intel-save-settings').addEventListener('click', async () => {
      const newLang = overlay.querySelector('#intel-lang-select').value;
      const newVoice = overlay.querySelector('#intel-voice-select').value;
      const { DB } = await import('./db.js');
      await DB.Settings.put('intel-lang', newLang);
      await DB.Settings.put('intel-voice', newVoice);
      overlay.remove();
      load(); // Reload UI to apply language
    });
  }

  function _buildReadinessWidget(data) {\);

content = content.replace(/return \\{ load, handleCamera, onFileSelected, submit, generateWeekly, createWorkout, analyzeStats,\\s*checkBiometrics,\\s*_clearImage,\\s*playAudio\\s*\\};/m, \eturn { load, handleCamera, onFileSelected, submit, generateWeekly, createWorkout, analyzeStats,
    checkBiometrics,
    _clearImage,
    playAudio,
    handleCamera,
    abortRequest,
    openSettings,
    get currentPlan() { return currentPlan; }
  };\);

fs.writeFileSync('js/intel.view.js', content, 'utf-8');
console.log('Patched intel.view.js successfully');
