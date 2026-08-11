// @ts-check
import { IntelStore } from './intel.store.js';
import { esc, haptic } from './shared/utils.js';
import { toUserMessage } from './shared/errors-ui.js';
import { DB } from './db.js';
import { on, onChange, onKeydown } from './events.js';

on('intel:close',         () => { window.IntelView.abortRequest(); window.Nav.go('s-home'); });
on('intel:camera',        () => window.IntelView.handleCamera());
on('intel:submit',        () => window.IntelView.submit());
on('intel:weekly',        (el) => window.IntelView.generateWeekly(el));
on('intel:createWorkout', (el) => window.IntelView.createWorkout(el));
on('intel:analyzeStats',  (el) => window.IntelView.analyzeStats(el));
on('intel:biometrics',    (el) => window.IntelView.checkBiometrics(el));
on('intel:clearImage',    () => { const w = document.getElementById('intel-vision-preview-wrap'); if (w) w.innerHTML = ''; window.IntelView._clearImage(); });
on('intel:playAudio',     (el) => window.IntelView.playAudio(el));
on('intel:stopAudio',     () => window.IntelView.stopAudio());
on('intel:closeReport',   (el) => {
  const target = el.closest('.intel-report-overlay, .intel-overlay');
  if (target) {
    if (document.startViewTransition) document.startViewTransition(() => target.remove());
    else target.remove();
  }
});
on('intel:openSettings',  () => window.IntelView.openSettings());
on('intel:saveActionCard', async (el) => {
  const dataRaw = el.dataset.workout;
  if (!dataRaw) return;
  const { DB, newId } = await import('./db.js');
  try {
    const workout = JSON.parse(decodeURIComponent(dataRaw));
    await DB.PlannedWorkouts.put({
      id: newId(),
      type: workout.type || 'push',
      date: new Date().toISOString().split('T')[0],
      exercises: workout.exercises || []
    });
    el.innerHTML = '<span style="color:var(--c-accent)">SAVED ✓</span>';
    el.style.borderColor = 'var(--c-accent)';
  } catch(err) {
    console.error(err);
  }
});
on('intel:exportPlan',    async (el) => {
  const plan = window.IntelView.currentPlan;
  if (plan) {
    const { DB } = await import('./db.js');
    await DB.PlannedWorkouts.add({ date: new Date().toISOString(), plan, name: 'AI Generated Plan' });
    const btn = el;
    btn.textContent = 'Экспортировано!';
    btn.style.background = 'var(--c-accent)';
    setTimeout(() => {
      const target = el.closest('.intel-overlay');
      if (target) {
        if (document.startViewTransition) document.startViewTransition(() => target.remove());
        else target.remove();
      }
    }, 1000);
  }
});
onChange('intel:fileSelected', (el, e) => window.IntelView.onFileSelected(e));
onKeydown('intel:submitEnter', (el, e) => { if (e.key === 'Enter') window.IntelView.submit(); });

/**
 * IntelView — Athlete Pro
 * UI Renderer for the Neural Command Center.
 */
export const IntelView = (() => {
  let _initialized = false;
  let _hasValidKey = false;
  let _currentAbort = null;
  let currentPlan = null;

  let _globalAudio = new Audio();
  let _audioContext = null;
  let _analyser = null;
  let _audioSource = null;
  let _audioRaf = null;
  let _isSpeaking = false;
  let _isMuted = false;
  let _heat = 0;


  function _initAudioContext() {
    if (!_audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        _audioContext = new Ctx();
        _analyser = _audioContext.createAnalyser();
        _analyser.fftSize = 64; 
        _audioSource = _audioContext.createMediaElementSource(_globalAudio);
        _audioSource.connect(_analyser);
        _analyser.connect(_audioContext.destination);
      }
    }
    if (_audioContext && _audioContext.state === 'suspended') {
      _audioContext.resume();
    }
  }

  function stopAudio() {
    if (_isSpeaking) {
      _globalAudio.pause();
      _globalAudio.currentTime = 0;
      _isSpeaking = false;
      document.body.classList.remove('intel-is-speaking');
      IntelStore.setStatus('SYSTEM STANDBY');
      document.body.style.setProperty('--audio-pulse', '0');
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (_audioRaf) cancelAnimationFrame(_audioRaf);
    }
  }

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
    return (await DB.Settings.get('intel-voice')) || 'Puck';
  }

  async function _getTone() {
    const { DB } = await import('./db.js');
    const t = await DB.Settings.get('intel-tone');
    return t !== undefined ? t : 50;
  }

  async function _getLang() {
    const { DB } = await import('./db.js');
    return (await DB.Settings.get('intel-lang')) || 'en';
  }

  async function _checkApiKey() {
    const { DB } = await import('./db.js');
    const localKey = await DB.Settings.get('gemini-key');
    
    // 1. Check local browser storage first
    _hasValidKey = !!localKey && localKey.trim().length > 10;

    // 2. If no local key, ALWAYS check server status (for .env keys)
    if (!_hasValidKey) {
      try {
        const serverStatus = await fetch('/api/ai-status').then(r => r.json());
        _hasValidKey = serverStatus.gemini; // Specifically check for Gemini
      } catch (e) {
        console.warn('Failed to fetch /api/ai-status', e);
      }
    }
  }

  async function load() {
    const screen = document.getElementById('s-intel');
    if (!screen) return;

    if (!_initialized) {
      IntelStore.init();
      _initialized = true;
    }

    await _checkApiKey();
    const lang = await _getLang();
    const d = DICT[lang] || DICT['en'];

    screen.innerHTML = `
      <header class="intel-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h1 class="intel-title" style="view-transition-name: panda-core-title;">P.A.N.D.A. Core</h1>
          <div class="intel-sub">
            <span class="ai-indicator ${_hasValidKey ? 'active' : 'missing'}" style="margin-right:4px;"></span>
            <span style="color: ${_hasValidKey ? 'var(--c-accent)' : 'var(--c-text-3)'}; font-weight:var(--fw-bold); text-transform:lowercase; opacity:0.8;">${_hasValidKey ? 'system secure' : 'key missing'}</span>
            <span style="opacity:0.2; margin: 0 6px;">|</span>
            <span id="intel-status-text" style="color: var(--c-text-2); font-weight:var(--fw-black); text-transform:lowercase;">${IntelStore.getStatus()}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          <button id="intel-mute-btn" style="background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer; padding:4px 8px; margin-right:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="vertical-align:middle;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path id="intel-mute-waves" d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" style="display:${_isMuted ? 'none' : 'block'};"></path>
              <line id="intel-mute-cross" x1="23" y1="1" x2="1" y2="23" stroke="var(--c-red)" stroke-width="2" style="display:${_isMuted ? 'block' : 'none'};"></line>
            </svg>
          </button>
          <button data-action="intel:openSettings" style="background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer; padding:4px 8px;">⋮</button>
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
            <span class="intel-module-label">${d.summary}</span>
          </button>
          <button class="intel-module-card" data-action="intel:createWorkout">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-accent) 15%, transparent); color:var(--c-accent)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span class="intel-module-label">${d.generate}</span>
          </button>
          <button class="intel-module-card" data-action="intel:analyzeStats">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-blue) 15%, transparent); color:var(--c-blue)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </div>
            <span class="intel-module-label">${d.analyze}</span>
          </button>
          <button class="intel-module-card" data-action="intel:biometrics">
            <div class="intel-module-icon" style="background:color-mix(in srgb, var(--c-red) 12%, transparent); color:var(--c-red)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <span class="intel-module-label">${d.biometrics}</span>
          </button>
        </div>
      </div>

      <div class="intel-logs" onclick="this.classList.toggle('expanded')">
        <div class="intel-logs-header">
          <h3 class="intel-logs-title">STREAMING_LOGS</h3>
          <span class="intel-logs-status" id="intel-logs-status-pill" data-action="intel:stopAudio" style="cursor:pointer;" title="Click to Stop Audio">${d.sys}</span>
        </div>
        <div id="intel-logs-container"></div>
      </div>

      <div class="intel-cmd-wrap">
        <div class="intel-eq-board" id="intel-eq-board">
          <div class="intel-eq-bar-wrap"><div class="intel-eq-peak"></div><div class="intel-eq-bar"></div></div>
          <div class="intel-eq-bar-wrap"><div class="intel-eq-peak"></div><div class="intel-eq-bar"></div></div>
          <div class="intel-eq-bar-wrap"><div class="intel-eq-peak"></div><div class="intel-eq-bar"></div></div>
          <div class="intel-eq-bar-wrap"><div class="intel-eq-peak"></div><div class="intel-eq-bar"></div></div>
          <div class="intel-eq-bar-wrap"><div class="intel-eq-peak"></div><div class="intel-eq-bar"></div></div>
        </div>
        <div class="intel-cmd-bar composer" id="intel-composer">
          <div class="composer-halo"></div>
          <button class="intel-btn-icon" data-action="intel:voiceInput" id="intel-mic-btn" style="transition:all 0.2s; touch-action:none; z-index:2;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </button>
          <button class="intel-btn-icon" data-action="intel:camera" style="z-index:2;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </button>
          <input type="text" id="intel-input" class="intel-cmd-input composer-field" placeholder="${d.input}" data-keydown="intel:submitEnter" autocomplete="off" spellcheck="false" style="z-index:2;">
          <button class="intel-btn-icon intel-btn-send composer-send" data-action="intel:submit" style="z-index:2;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" class="icon-arrow"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            <div class="icon-stop" style="display:none; width:12px; height:12px; background:currentColor; border-radius:2px;"></div>
          </button>
        </div>
        <div class="intel-heat-bar-wrap">
          <div class="intel-heat-bar"></div>
        </div>
        <input type="file" id="intel-file-input" accept="image/*" style="display:none" data-change="intel:fileSelected">
      </div>
    `;

    renderLogs();
    _listen();
    _initTilt();

    const muteBtn = document.getElementById('intel-mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        _isMuted = !_isMuted;
        document.getElementById('intel-mute-waves').style.display = _isMuted ? 'none' : 'block';
        document.getElementById('intel-mute-cross').style.display = _isMuted ? 'block' : 'none';
        if (_isMuted) stopAudio();
      });
    }

    document.body.addEventListener('click', _initAudioContext, { once: true });
    document.body.addEventListener('keydown', _initAudioContext, { once: true });

    IntelStore.setStatus(d.sys);
    
    // Heat Decay Loop
    function decayHeat() {
      if (_heat > 0) {
        _heat = Math.max(0, _heat - 0.05);
        document.body.style.setProperty('--heat-val', _heat / 100);
      }
      requestAnimationFrame(decayHeat);
    }
    requestAnimationFrame(decayHeat);
  }

  function renderLogs() {
    const container = document.getElementById('intel-logs-container');
    if (!container) return;
    const logs = IntelStore.getLogs();
    container.innerHTML = logs.map(l => `
      <div class="intel-log-entry">
        <span class="intel-log-time">[${l.time}]</span>
        <span class="intel-log-type ${l.type.toLowerCase()}">${l.type}</span>
        <span class="intel-log-msg">${esc(l.text)}</span>
      </div>
    `).join('');
    container.scrollTop = 0;
  }

  function _listen() {
    // Avoid double listeners
    // @ts-ignore
    if (window._intelListenersActive) return;
    // @ts-ignore
    window._intelListenersActive = true;

    // Web Speech API Logic
    let recognition = null;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      const micBtn = document.getElementById('intel-mic-btn');
      const inputEl = document.getElementById('intel-input');
      
      if (micBtn && inputEl) {
        let isRecording = false;
        
        const startVoice = async (e) => {
          e.preventDefault();
          if (isRecording) return;
          isRecording = true;
          haptic(20);
          micBtn.classList.add('intel-mic-active');
          const lang = await _getLang();
          recognition.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
          inputEl.value = '';
          inputEl.placeholder = 'Listening...';
          try { recognition.start(); } catch(e){}
        };

        const stopVoice = (e) => {
          e.preventDefault();
          if (!isRecording) return;
          isRecording = false;
          haptic(10);
          micBtn.classList.remove('intel-mic-active');
          try { recognition.stop(); } catch(e){}
          setTimeout(() => {
            if (inputEl.value.trim().length > 0) submit();
          }, 300);
        };

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
          }
          inputEl.value = finalTranscript || interimTranscript;
        };

        micBtn.addEventListener('pointerdown', startVoice);
        micBtn.addEventListener('pointerup', stopVoice);
        micBtn.addEventListener('pointercancel', stopVoice);
        micBtn.addEventListener('pointerleave', stopVoice);
      }
    }

    // Composer UI Listeners
    const composer = document.getElementById('intel-composer');
    const inputEl = document.getElementById('intel-input');
    if (composer && inputEl) {
      inputEl.addEventListener('focus', () => composer.classList.add('focused'));
      inputEl.addEventListener('blur', () => composer.classList.remove('focused'));
      inputEl.addEventListener('input', () => {
        if (inputEl.value.trim().length > 0) composer.classList.add('ready');
        else composer.classList.remove('ready');
      });
    }

    window.addEventListener('ap-intel-log', renderLogs);
    window.addEventListener('ap-intel-status', () => {
      const statusText = IntelStore.getStatus();
      const el = document.getElementById('intel-status-text');
      if (el) el.textContent = statusText;
      
      const pill = document.getElementById('intel-logs-status-pill');
      if (pill) {
        pill.textContent = statusText;
        pill.className = 'intel-logs-status shimmer-active';
        setTimeout(() => pill.classList.remove('shimmer-active'), 850);
        if (statusText.includes('ERROR')) {
          pill.style.color = 'var(--c-red)';
          pill.style.borderColor = 'var(--c-red)';
          pill.style.background = 'color-mix(in srgb, var(--c-red) 12%, transparent)';
        } else if (statusText.includes('SCANNING') || statusText.includes('AI')) {
          pill.style.color = 'var(--c-intel)';
          pill.style.borderColor = 'color-mix(in srgb, var(--c-intel) 40%, transparent)';
          pill.style.background = 'color-mix(in srgb, var(--c-intel) 12%, transparent)';
        } else {
          pill.style.color = '';
          pill.style.borderColor = '';
          pill.style.background = '';
        }
      }
    });
  }

  /** 3D Tilt + Amicro Spotlight Border Glow effect on module cards & command bar */
  function _initTilt() {
    const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const cards = document.querySelectorAll('.intel-module-card, .intel-cmd-bar');
    cards.forEach(card => {
      card.addEventListener('pointermove', (e) => {
        if (!isFinePointer) return;
        const rect = card.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--spot-x', `${px}%`);
        card.style.setProperty('--spot-y', `${py}%`);

        if (card.classList.contains('intel-module-card')) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = (e.clientX - cx) / (rect.width / 2);  // -1 to 1
          const dy = (e.clientY - cy) / (rect.height / 2); // -1 to 1
          const rotX = -dy * 8;  // max 8deg tilt
          const rotY = dx * 8;
          card.style.transform = `perspective(400px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(4px)`;
          card.style.transition = 'transform 0.05s linear';
        }

        // Move glare
        const glare = card.querySelector('.intel-card-glare');
        if (glare) {
          glare.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.12), transparent 60%)`;
        }
      });
      card.addEventListener('pointerleave', () => {
        if (card.classList.contains('intel-module-card')) {
          card.style.transform = '';
          card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        }
        const glare = card.querySelector('.intel-card-glare');
        if (glare) glare.style.background = '';
      });
      // Inject glare layer if not present
      if (card.classList.contains('intel-module-card') && !card.querySelector('.intel-card-glare')) {
        const glare = document.createElement('div');
        glare.className = 'intel-card-glare';
        glare.setAttribute('aria-hidden', 'true');
        card.appendChild(glare);
      }
    });
  }

  function handleCamera() {
    document.getElementById('intel-file-input')?.click();
  }

  let _pendingImage = null;

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    IntelStore.addLog('SYS', `Packet formed: ${file.name} (${Math.round(file.size/1024)}KB)`);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      _pendingImage = base64;
      _showVisionPreview(base64);
    };
    reader.readAsDataURL(file);
  }

  function _showVisionPreview(base64) {
    const wrap = document.getElementById('intel-vision-preview-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="intel-vision-preview animate-in zoom-in">
        <img src="${base64}" class="intel-vision-img" alt="Vision Input">
        <div class="intel-scanner-bar"></div>
        <button data-action="intel:clearImage" style="position:absolute; top:8px; right:8px; width:24px; height:24px; border-radius:50%; background:rgba(0,0,0,0.5); border:none; color:white; display:flex; align-items:center; justify-content:center; font-size:var(--fs-3); cursor:pointer;">&times;</button>
      </div>
    `;
    IntelStore.setStatus('VISION READY');
  }

  async function submit() {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('intel-input'));
    if (!input || (!input.value.trim() && !_pendingImage)) return;
    
    const text = input.value.trim() || "Analyze this photo";
    const image = _pendingImage;
    
    IntelStore.addLog('USER', text);
    if (image) IntelStore.addLog('SYS', 'Attaching vision packet...');
    
    const composer = document.getElementById('intel-composer');
    if (composer) {
      composer.classList.add('sending');
      composer.classList.remove('ready');
    }

    input.value = '';
    _pendingImage = null;
    const previewWrap = document.getElementById('intel-vision-preview-wrap');
    if (previewWrap) previewWrap.innerHTML = '';

    IntelStore.setStatus('AI SCANNING...');
    
    const feedbackFeed = document.getElementById('intel-feedback-feed');
    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'intel-feedback';
    feedbackEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div class="intel-feedback-label" style="margin-bottom:0;">AI Feedback</div>
        <button class="intel-btn-icon" style="opacity:0.5; width:24px; height:24px; padding:0;" title="Озвучить" data-action="intel:playAudio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
        </button>
      </div>
      <div class="intel-feedback-text">
        <div class="intel-skeleton-wrap" aria-label="Loading AI Response...">
          <div class="intel-skeleton-head">
            <div class="intel-skeleton-avatar"></div>
            <div class="intel-skeleton-line w-1-2"></div>
          </div>
          <div class="intel-skeleton-line w-full"></div>
          <div class="intel-skeleton-line w-4-5"></div>
        </div>
      </div>
    `;
    feedbackFeed?.prepend(feedbackEl);
    const feedbackText = feedbackEl.querySelector('.intel-feedback-text');
    feedbackEl.classList.add('streaming');

    _heat = Math.min(100, _heat + 25);
    document.body.style.setProperty('--heat-val', _heat / 100);

    try {
      const { DB } = await import('./db.js');
      const workouts = await DB.Workouts.getLast(5);
      const profile = await DB.Settings.getAll();
      const topLifts = await DB.OneRM.getAll();

      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          images: image ? [image] : [],
          workouts,
          profile,
          topLifts,
          engine: await _getEngine(),
          customKey: (await DB.Settings.get(`${await _getEngine()}-key`)) || undefined,
          language: await _getLang(),
          tone: await _getTone()
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  haptic(2);
                  fullText += parsed.text;
                  if (feedbackText) {
                    let renderText = fullText;
                    
                    const cardRegex = /\[WORKOUT_CARD\]([\s\S]*?)\[\/WORKOUT_CARD\]/;
                    const match = renderText.match(cardRegex);
                    
                    if (match) {
                      renderText = renderText.replace(cardRegex, '');
                      try {
                        const cardData = JSON.parse(match[1].trim());
                        if (!feedbackEl.querySelector('.intel-workout-card')) {
                          const cardHtml = `
                            <div class="intel-workout-card" style="margin-top:16px; background:color-mix(in srgb, var(--c-surface) 40%, transparent); border:1px solid color-mix(in srgb, var(--c-accent) 40%, transparent); border-radius:16px; padding:16px; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <h4 style="color:var(--c-text-1); font-weight:var(--fw-black); font-size:var(--fs-2); text-transform:uppercase;">${cardData.title || 'Workout'}</h4>
                                <span style="background:var(--c-accent); color:#000; font-size:10px; font-weight:var(--fw-black); padding:2px 6px; border-radius:4px; text-transform:uppercase;">${cardData.type || 'Custom'}</span>
                              </div>
                              <ul style="list-style:none; padding:0; margin:0 0 16px 0;">
                                ${cardData.exercises.map(ex => `
                                  <li style="display:flex; justify-content:space-between; border-bottom:1px solid color-mix(in srgb, var(--c-border) 20%, transparent); padding:6px 0; font-size:var(--fs-1);">
                                    <span style="color:var(--c-text-2);">${ex.name}</span>
                                    <span style="color:var(--c-accent); font-weight:var(--fw-bold);">${ex.sets}x${ex.reps}</span>
                                  </li>
                                `).join('')}
                              </ul>
                              <button data-action="intel:saveActionCard" data-workout="${encodeURIComponent(JSON.stringify(cardData))}" style="width:100%; padding:12px; background:transparent; border:1px solid var(--c-accent); color:var(--c-accent); border-radius:8px; font-weight:var(--fw-bold); cursor:pointer; text-transform:uppercase; transition:all 0.2s;">
                                Save to Calendar
                              </button>
                            </div>
                          `;
                          const div = document.createElement('div');
                          div.innerHTML = cardHtml;
                          feedbackEl.appendChild(div.firstElementChild);
                        }
                      } catch (e) {
                        // Wait for full JSON
                      }
                    }

                    const formattedHtml = _formatAirMarkdown(renderText);
                    feedbackText.className = 'intel-feedback-text intel-feedback-content-fade';
                    feedbackText.innerHTML = formattedHtml;
                  }
                }
              } catch (e) {}
            }
          }
        }
      }

      IntelStore.addLog('AI', 'Insight received.');
      IntelStore.setStatus('SYSTEM STANDBY');
      _pendingImage = null;
      _clearModuleLoaders();

      const composer = document.getElementById('intel-composer');
      if (composer) composer.classList.remove('sending');

      // Clear Heat Decay smoothly
      if (window._heatInterval) clearInterval(window._heatInterval);

      // Auto-Speech
      const autoSpeech = await DB.Settings.get('ai-auto-speech', true);
      if (autoSpeech && feedbackText) {
        const textToSpeak = feedbackText.innerText.trim();
        if (textToSpeak) speakText(textToSpeak);
      }

    } catch (err) {
      console.error(err);
      feedbackEl.classList.remove('streaming');
      feedbackEl.classList.add('error-state');
      _clearModuleLoaders();

      // Расшифровка HTTP-ошибок для пользователя
      const errMsg = err?.message || '';
      let friendlyMsg, logMsg;
      if (errMsg.includes('401')) {
        friendlyMsg = 'Ключ API недействителен. Проверьте настройки Gemini.';
        logMsg = 'HTTP 401: Invalid API Key';
      } else if (errMsg.includes('429')) {
        friendlyMsg = 'Превышен лимит запросов. Подождите или проверьте квоту плана.';
        logMsg = 'HTTP 429: Rate Limit Exceeded';
      } else if (errMsg.includes('403')) {
        friendlyMsg = 'Доступ запрещен. API ключ может не иметь нужных прав.';
        logMsg = 'HTTP 403: Permission Denied';
      } else if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503')) {
        friendlyMsg = 'Сервер недоступен. Попробуйте позже.';
        logMsg = `Server Error: ${errMsg}`;
      } else if (!navigator.onLine) {
        friendlyMsg = 'Нет сети. Проверьте подключение.';
        logMsg = 'Network Offline';
      } else {
        friendlyMsg = `Ошибка: ${errMsg || 'Неизвестная'}`;
        logMsg = errMsg || 'Unknown error';
      }

      IntelStore.addLog('SYS', logMsg);
      IntelStore.setStatus('SYSTEM ERROR');
      if (feedbackText) feedbackText.textContent = friendlyMsg;
    }
  }

  function _clearModuleLoaders() {
    document.querySelectorAll('.intel-module-card.loading').forEach(card => card.classList.remove('loading'));
  }

  /** Rich Air Markdown & Typography Formatter */
  function _formatAirMarkdown(rawText) {
    let text = rawText || '';

    // 1. Hide <thinking> tags
    text = text.replace(/<thinking>[\s\S]*?(<\/thinking>|$)/g, '');

    // 2. Extract JSON widget before escaping
    let htmlWidget = '';
    const jsonMatch = text.match(/\{[\s\S]*"_widget"\s*:\s*"readiness"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const widgetData = JSON.parse(jsonMatch[0]);
        htmlWidget = _buildReadinessWidget(widgetData);
        text = text.replace(jsonMatch[0], '[[WIDGET_PLACEHOLDER]]');
      } catch (e) { }
    }

    // 3. Escape raw text
    let safe = esc(text);

    // 4. Headings (###, ##, #)
    safe = safe.replace(/^###\s+(.*$)/gim, '<h3 class="intel-md-h3">$1</h3>');
    safe = safe.replace(/^##\s+(.*$)/gim, '<h2 class="intel-md-h2">$1</h2>');
    safe = safe.replace(/^#\s+(.*$)/gim, '<h2 class="intel-md-h2">$1</h2>');

    // 5. Bold & Italic
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 6. Numbered items: 1. Item
    safe = safe.replace(/^(\d+)\.\s+(.*$)/gim, '<div class="intel-md-num"><span class="intel-num-badge">$1</span><span>$2</span></div>');

    // 7. Bullet items: * Item or - Item
    safe = safe.replace(/^[*\-]\s+(.*$)/gim, '<li class="intel-md-li">$1</li>');

    // 8. Paragraphs
    safe = safe.replace(/\n\n+/g, '</p><p class="intel-md-p">');
    safe = safe.replace(/\n/g, '<br>');

    // 9. Re-insert widget
    if (htmlWidget) {
      safe = safe.replace('[[WIDGET_PLACEHOLDER]]', htmlWidget);
    }

    return `<div class="intel-md-body"><p class="intel-md-p">${safe}</p></div>`;
  }

  function _clearImage() { _pendingImage = null; }

  let _currentPulse = 0;
  let _eqVals = [0, 0, 0, 0, 0];
  let _peakVals = [0, 0, 0, 0, 0];
  let _peakVels = [0, 0, 0, 0, 0];

  function _visualizeAudio() {
    if (!_analyser || !_isSpeaking) return;
    const dataArray = new Uint8Array(_analyser.frequencyBinCount);
    _analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    const voiceBins = 5; 
    
    const eqBoard = document.getElementById('intel-eq-board');
    const eqWraps = eqBoard ? eqBoard.children : [];
    
    const GRAVITY = 0.008;
    const IDLE_BASELINE = 0.08; // Smart Idle

    for (let i = 0; i < voiceBins; i++) {
      const raw = dataArray[i];
      sum += raw;
      
      // Volume Bar (with Smart Idle baseline)
      let target = Math.min(1, raw / 180);
      target = Math.max(IDLE_BASELINE, target); 
      _eqVals[i] += (target - _eqVals[i]) * 0.25;
      
      // Ghost Peak Physics
      if (target >= _peakVals[i]) {
        _peakVals[i] = target;
        _peakVels[i] = 0; // Reset velocity when pushed up
      } else {
        _peakVels[i] += GRAVITY;
        _peakVals[i] -= _peakVels[i];
        if (_peakVals[i] < _eqVals[i]) {
          _peakVals[i] = _eqVals[i];
          _peakVels[i] = 0;
        }
      }
      
      if (eqWraps[i]) {
        eqWraps[i].style.setProperty('--eq-val', _eqVals[i].toFixed(3));
        eqWraps[i].style.setProperty('--eq-peak', _peakVals[i].toFixed(3));
      }
    }
    
    const targetPulse = Math.max(IDLE_BASELINE, Math.min(1, (sum / voiceBins) / 160));
    _currentPulse += (targetPulse - _currentPulse) * 0.2;
    document.body.style.setProperty('--audio-pulse', _currentPulse.toFixed(3));
    
    if (_isSpeaking) _audioRaf = requestAnimationFrame(_visualizeAudio);
    else {
      _currentPulse = 0;
      document.body.style.setProperty('--audio-pulse', '0');
      for (let i = 0; i < 5; i++) {
        _eqVals[i] = 0;
        _peakVals[i] = 0;
        _peakVels[i] = 0;
        if (eqWraps[i]) {
          eqWraps[i].style.setProperty('--eq-val', '0');
          eqWraps[i].style.setProperty('--eq-peak', '0');
        }
      }
    }
  }

  async function speakText(rawText) {
    if (!rawText || _isSpeaking || _isMuted) return;
    
    // Strip markdown formatting (asterisks, hashes, backticks, slashes) for cleaner TTS
    const textToSpeak = rawText
      .replace(/[*_#`[\]()]/g, '')
      .replace(/\//g, ' ')
      .trim();
      
    if (!textToSpeak) return;

    _isSpeaking = true;
    IntelStore.addLog('SYS', 'Synthesizing coach voice...');

    try {
      const cacheKey = `https://p.a.n.d.a/tts?hash=${btoa(encodeURIComponent(textToSpeak + (await _getVoice()) + (await _getLang())))}`;
      const cache = await caches.open('panda-tts-v1');
      const cachedRes = await cache.match(cacheKey);
      
      let result;
      if (cachedRes) {
        result = await cachedRes.json();
      } else {
        const response = await fetch('/api/coach/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: textToSpeak,
            customKey: await (await import('./db.js')).DB.Settings.get('gemini-key'),
            language: await _getLang(),
            voice: await _getVoice()
          })
        });
        result = await response.json();
        if (response.ok && !result.fallback) {
          await cache.put(cacheKey, new Response(JSON.stringify(result)));
        } else if (!response.ok || result.fallback) {
          throw new Error(result.error || 'Voice sync failed, falling back to native');
        }
      }

      const pcmData = result.audioBase64;
      if (!pcmData) throw new Error("Audio data not found");

      const audioBlob = pcmToWav(pcmData, 24000); 
      const audioUrl = URL.createObjectURL(audioBlob);
      _globalAudio.src = audioUrl;
      
      document.body.classList.add('intel-is-speaking');
      const statusPill = document.getElementById('intel-logs-status-pill');
      if (statusPill) { statusPill.textContent = 'VOICE ACTIVE'; statusPill.style.color = 'var(--c-intel)'; }

      _globalAudio.onended = () => { 
        _isSpeaking = false; 
        URL.revokeObjectURL(audioUrl); 
        document.body.classList.remove('intel-is-speaking');
        IntelStore.setStatus('SYSTEM STANDBY');
        document.body.style.setProperty('--audio-pulse', '0');
      };
      
      await _globalAudio.play();
      if (_audioContext) _visualizeAudio();
      
    } catch (err) { 
      IntelStore.addLog('SYS', err.message); 
      
      // Native Speech Synthesis Fallback
      if (window.speechSynthesis) {
        IntelStore.addLog('SYS', 'Using native speech fallback');
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const lang = await _getLang();
        utterance.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
        
        // Try to find a male voice to avoid the robotic female default
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.includes(lang === 'ru' ? 'ru' : 'en') && (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Pavel') || v.name.includes('Yuri')));
        if (preferred) utterance.voice = preferred;
        
        document.body.classList.add('intel-is-speaking');
        const statusPill = document.getElementById('intel-logs-status-pill');
        if (statusPill) { statusPill.textContent = 'VOICE ACTIVE'; statusPill.style.color = 'var(--c-intel)'; }
        
        utterance.onend = () => {
          _isSpeaking = false;
          document.body.classList.remove('intel-is-speaking');
          IntelStore.setStatus('SYSTEM STANDBY');
        };
        utterance.onerror = () => {
          _isSpeaking = false;
          document.body.classList.remove('intel-is-speaking');
          IntelStore.setStatus('SYSTEM STANDBY');
        };
        window.speechSynthesis.speak(utterance);
      } else {
        _isSpeaking = false; 
        document.body.classList.remove('intel-is-speaking');
      }
    }
  }

  function pcmToWav(base64Pcm, sampleRate) {
    const pcmBuffer = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0)).buffer;
    const wavBuffer = new ArrayBuffer(44 + pcmBuffer.byteLength);
    const view = new DataView(wavBuffer);
    const writeString = (offset, string) => { for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i)); };
    writeString(0, 'RIFF'); 
    view.setUint32(4, 36 + pcmBuffer.byteLength, true); 
    writeString(8, 'WAVE'); 
    writeString(12, 'fmt '); 
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sampleRate, true); 
    view.setUint32(28, sampleRate * 2, true); 
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    writeString(36, 'data'); 
    view.setUint32(40, pcmBuffer.byteLength, true);
    new Uint8Array(wavBuffer).set(new Uint8Array(pcmBuffer), 44);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  async function generateWeekly(el) {
     const card = el?.closest('.intel-module-card') || document.querySelector('.intel-module-card[data-action="intel:weekly"]');
     if (card) card.classList.add('loading');
     IntelStore.addLog('SYS', 'Computing weekly intelligence...');
     IntelStore.setStatus('COMPUTING INTEL...');
     
     try {
       const { DB } = await import('./db.js');
       const workouts = await DB.Workouts.getAll();
       // Filter for last 7 days
       const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
       const recentWorkouts = workouts.filter(w => new Date(w.date).getTime() > sevenDaysAgo);
       const profile = await DB.Settings.getAll();

       const response = await fetch('/api/coach/weekly-report', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
           workouts: recentWorkouts, 
           profile, 
           engine: await _getEngine(),
           customKey: (await DB.Settings.get(`${await _getEngine()}-key`)) || undefined
         })
       });

       if (!response.ok) throw new Error('Report generation failed');

       const { report } = await response.json();
       
       IntelStore.addLog('AI', `Weekly report generated. Performance Score: ${report.score}`);
       IntelStore.setStatus('SYSTEM STANDBY');
       _clearModuleLoaders();

       _renderReportOverlay(report);
       speakText(`Твой прогресс за неделю: ${report.score} баллов. ${report.summary}`);

     } catch (err) {
       _clearModuleLoaders();
       IntelStore.addLog('ERROR', 'Failed to generate weekly intel');
       IntelStore.setStatus('ERROR');
     }
  }

  function _renderReportOverlay(report) {
    const overlay = document.createElement('div');
    overlay.className = 'intel-report-overlay animate-in fade-in duration-500';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(5,5,7,0.95); backdrop-filter:blur(20px); display:flex; align-items:center; justify-content:center; padding:20px;';
    
    overlay.innerHTML = `
      <div style="background:var(--c-bg-1); width:100%; max-width:500px; border-radius:32px; border:1px solid var(--c-border-h); padding:40px; position:relative; max-height:90vh; overflow-y:auto;">
        <button data-action="intel:closeReport" style="position:absolute; top:24px; right:24px; background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer;">&times;</button>
        <div style="text-align:center; margin-bottom:32px;">
           <h2 style="font-family:var(--font-intel); font-size:var(--fs-5); font-style:italic; color:var(--c-text-1); text-transform:uppercase; margin-bottom:16px;">Weekly Intel</h2>
           <div style="display:flex; flex-direction:column; align-items:center;">
             <span style="font-size:var(--fs-6); font-weight:var(--fw-black); color:var(--c-intel); text-shadow:0 0 20px rgba(0,209,255,0.4); line-height:1;">${report.score}</span>
             <span style="font-size:var(--fs-1); font-weight:var(--fw-black); color:var(--c-text-3); text-transform:uppercase; letter-spacing:0.5em; margin-top:8px;">Performance Score</span>
           </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:24px;">
          <section style="background:var(--c-surface-h); padding:24px; border-radius:24px; border:1px solid var(--c-border);">
            <p style="font-size:var(--fs-3); font-style:italic; color:var(--c-text-2); line-height:1.6; font-weight:var(--fw-md);">"${esc(report.summary)}"</p>
          </section>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div style="background:rgba(0,230,118,0.05); padding:20px; border-radius:24px; border:1px solid rgba(0,230,118,0.1);">
               <h4 style="font-size:var(--fs-1); font-weight:var(--fw-black); text-transform:uppercase; color:var(--c-accent); margin-bottom:12px; letter-spacing:0.2em;">Wins</h4>
               <ul style="font-size:var(--fs-2); color:var(--c-text-3); list-style:none; display:flex; flex-direction:column; gap:8px;">
                 ${report.pros.map(p => `<li style="display:flex; gap:8px;"><span style="color:var(--c-accent)">+</span>${esc(p)}</li>`).join('')}
               </ul>
            </div>
            <div style="background:rgba(255,77,136,0.05); padding:20px; border-radius:24px; border:1px solid rgba(255,77,136,0.1);">
               <h4 style="font-size:var(--fs-1); font-weight:var(--fw-black); text-transform:uppercase; color:var(--c-red); margin-bottom:12px; letter-spacing:0.2em;">Leaks</h4>
               <ul style="font-size:var(--fs-2); color:var(--c-text-3); list-style:none; display:flex; flex-direction:column; gap:8px;">
                 ${report.cons.map(c => `<li style="display:flex; gap:8px;"><span style="color:var(--c-red)">-</span>${esc(c)}</li>`).join('')}
               </ul>
            </div>
          </div>
        </div>
      </div>
    `;
    if (document.startViewTransition) document.startViewTransition(() => document.body.appendChild(overlay));
    else document.body.appendChild(overlay);
  }


  function createWorkout(el) {
     haptic(10);
     const card = el?.closest('.intel-module-card') || document.querySelector('.intel-module-card[data-action="intel:createWorkout"]');
     if (card) {
       card.classList.add('loading');
       setTimeout(() => card.classList.remove('loading'), 1200);
     }
     IntelStore.addLog('SYS', 'Ready to generate workout plan');
     IntelStore.setStatus('WAITING FOR PROMPT');
     const input = document.getElementById('intel-input');
     if (input) {
         input.value = "";
         input.focus();
         // @ts-ignore
         input.placeholder = "Какую группу мышц тренируем сегодня?";
     }
  }

  function analyzeStats(el) {
     haptic(10);
     const card = el?.closest('.intel-module-card') || document.querySelector('.intel-module-card[data-action="intel:analyzeStats"]');
     if (card) card.classList.add('loading');
     IntelStore.addLog('SYS', 'Ready to analyze stats');
     const input = document.getElementById('intel-input');
     if (input) {
         input.value = "Проведи глубокий разбор последней тренировки. Сгенерируй readiness-виджет (_widget: readiness) с оценкой 0-100. Напиши пару строк о главном успехе и слабом месте.";
         submit();
     }
  }

  async function checkBiometrics(el) {
     haptic(10);
     const card = el?.closest('.intel-module-card') || document.querySelector('.intel-module-card[data-action="intel:biometrics"]');
     if (card) card.classList.add('loading');
     IntelStore.addLog('SYS', 'Init Cypher Radar...');

     const overlay = document.createElement('div');
     overlay.style.cssText = `position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; flex-direction:column; font-family:monospace; color:var(--c-intel); overflow:hidden;`;
     
     overlay.innerHTML = `
       <div id="radar-container" style="position:relative; width:200px; height:200px; border-radius:50%; border:2px solid var(--c-intel); box-shadow: 0 0 40px color-mix(in srgb, var(--c-intel) 40%, transparent); display:flex; align-items:center; justify-content:center; margin-bottom:32px;">
         <div style="position:absolute; inset:0; border-radius:50%; border:1px dashed var(--c-intel); opacity:0.5; animation: spin 4s linear infinite;"></div>
         <div style="position:absolute; width:100%; height:2px; background:var(--c-intel); box-shadow: 0 0 10px var(--c-intel); top:50%; transform-origin:center; animation: spin 2s linear infinite;"></div>
         <div style="font-size:24px; font-weight:bold; z-index:10; background:rgba(0,0,0,0.5); padding:4px 8px; border-radius:4px;">SCANNING</div>
       </div>
       <div id="cypher-log" style="width:80%; max-width:400px; height:100px; overflow:hidden; font-size:12px; opacity:0.8; text-align:left;"></div>
     `;
     document.body.appendChild(overlay);

     let logs = ["INIT CNS SCAN...", "GATHERING VOLUMETRIC DATA...", "ANALYZING SLEEP METRICS...", "MEASURING RPE FATIGUE...", "CALCULATING ACWR..."];
     let logIndex = 0;
     const logEl = overlay.querySelector('#cypher-log');
     const logInterval = setInterval(() => {
       if (logIndex < logs.length) {
         logEl.innerHTML += `<div>> ${logs[logIndex]}</div>`;
         logIndex++;
       } else {
         logEl.innerHTML += `<div>> [${Math.random().toString(36).substring(2, 10).toUpperCase()}] PROCESSING...</div>`;
       }
       logEl.scrollTop = logEl.scrollHeight;
     }, 400);

     try {
       const { DB } = await import('./db.js');
       const workouts = await DB.Workouts.getLast(10);
       const profile = await DB.Settings.getAll();
       
       const response = await fetch('/api/coach/biometrics-scan', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           workouts,
           profile,
           engine: await _getEngine(),
           customKey: (await DB.Settings.get(`${await _getEngine()}-key`)) || undefined,
           language: await _getLang()
         })
       });

       clearInterval(logInterval);
       
       if (!response.ok) throw new Error('Biometrics failed');
       const { report } = await response.json();
       const readiness = Math.max(0, 100 - Math.round((report.cnsFatigue + report.muscleDamage) / 2));

       overlay.innerHTML = `
         <div style="background:var(--c-bg-1); width:90%; max-width:400px; border-radius:24px; border:1px solid var(--c-intel); padding:32px; position:relative; box-shadow: 0 0 60px color-mix(in srgb, var(--c-intel) 20%, transparent);">
           <button id="biometric-close-btn" style="position:absolute; top:20px; right:20px; background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer;">&times;</button>
           <h2 style="color:var(--c-intel); font-family:var(--font-heading); margin-bottom:24px; text-transform:uppercase; letter-spacing:2px; font-size:var(--fs-3); text-align:center;">BIOMETRIC HUD</h2>
           
           <div style="display:flex; flex-direction:column; gap:16px;">
             <div style="background:color-mix(in srgb, var(--c-surface) 50%, transparent); padding:16px; border-radius:12px;">
               <div style="font-size:10px; color:var(--c-text-3); text-transform:uppercase; margin-bottom:4px;">CNS FATIGUE</div>
               <div style="display:flex; align-items:center; gap:12px;">
                 <div style="font-size:var(--fs-4); font-weight:var(--fw-black); color:${report.cnsFatigue > 70 ? 'var(--c-red)' : 'var(--c-text-1)'};">${report.cnsFatigue}%</div>
                 <div style="flex:1; height:4px; background:var(--c-bg-2); border-radius:2px; overflow:hidden;">
                   <div style="height:100%; width:${report.cnsFatigue}%; background:${report.cnsFatigue > 70 ? 'var(--c-red)' : 'var(--c-intel)'};"></div>
                 </div>
               </div>
             </div>
             
             <div style="background:color-mix(in srgb, var(--c-surface) 50%, transparent); padding:16px; border-radius:12px;">
               <div style="font-size:10px; color:var(--c-text-3); text-transform:uppercase; margin-bottom:4px;">MUSCLE DAMAGE</div>
               <div style="display:flex; align-items:center; gap:12px;">
                 <div style="font-size:var(--fs-4); font-weight:var(--fw-black); color:${report.muscleDamage > 70 ? 'var(--c-red)' : 'var(--c-text-1)'};">${report.muscleDamage}%</div>
                 <div style="flex:1; height:4px; background:var(--c-bg-2); border-radius:2px; overflow:hidden;">
                   <div style="height:100%; width:${report.muscleDamage}%; background:${report.muscleDamage > 70 ? 'var(--c-red)' : 'var(--c-intel)'};"></div>
                 </div>
               </div>
             </div>
             
             <div style="background:color-mix(in srgb, var(--c-surface) 50%, transparent); padding:16px; border-radius:12px;">
               <div style="font-size:10px; color:var(--c-text-3); text-transform:uppercase; margin-bottom:4px;">READINESS</div>
               <div style="display:flex; align-items:center; gap:12px;">
                 <div style="font-size:var(--fs-4); font-weight:var(--fw-black); color:${readiness < 50 ? 'var(--c-red)' : 'var(--c-accent)'};">${readiness}%</div>
                 <div style="flex:1; height:4px; background:var(--c-bg-2); border-radius:2px; overflow:hidden;">
                   <div style="height:100%; width:${readiness}%; background:${readiness < 50 ? 'var(--c-red)' : 'var(--c-accent)'};"></div>
                 </div>
               </div>
             </div>
           </div>
           
           <div style="margin-top:24px; padding-top:16px; border-top:1px solid color-mix(in srgb, var(--c-border) 50%, transparent); font-size:var(--fs-1); color:var(--c-text-2); line-height:1.5;">
             ${report.summary}
           </div>
         </div>
       `;
       
       const closeBtn = overlay.querySelector('#biometric-close-btn');
       if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());

       haptic(50);
     } catch (err) {
       clearInterval(logInterval);
       overlay.innerHTML = `<div style="color:var(--c-red); font-weight:bold;">SCAN FAILED: ${err.message}</div><button id="error-close-btn" style="margin-top:16px; padding:8px 16px;">CLOSE</button>`;
       const errBtn = overlay.querySelector('#error-close-btn');
       if (errBtn) errBtn.addEventListener('click', () => overlay.remove());
     }
     
     if (card) card.classList.remove('loading');
  }

  function _buildReadinessWidget(data) {
    const getColor = (val) => {
      if (val >= 90) return 'var(--c-accent)'; // Green (Отлично)
      if (val >= 70) return 'var(--c-warning)'; // Yellow (Хорошо)
      if (val >= 50) return '#f97316'; // Orange (Удовлетворительно)
      return 'var(--c-red)'; // Red (Внимание)
    };

    const hbar = (val, label) => {
      const c = getColor(val);
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:var(--fs-2); font-weight:var(--fw-md); color:var(--c-text-2);">${label}</div>
          <div style="display:flex; align-items:center; gap:8px; width:55%;">
            <div style="flex:1; height:6px; background:var(--c-surface-h); border-radius:3px; overflow:hidden;">
              <div style="width:${val}%; height:100%; background:${c}; border-radius:3px; transition: width 1s ease-out;"></div>
            </div>
            <span style="font-size:var(--fs-2); font-weight:var(--fw-black); color:${c}; width:28px; text-align:right;">${val}</span>
          </div>
        </div>
      `;
    };

    const mainColor = getColor(data.index);
    const indexLabel = data.index >= 90 ? 'отлично' : data.index >= 70 ? 'хорошо' : data.index >= 50 ? 'удовл' : 'внимание';

    return `
      <div class="intel-readiness-widget animate-in" style="background:rgba(139,92,246,0.03); border:1px solid rgba(139,92,246,0.1); border-radius:24px; padding:20px; margin:16px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
          <div style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-1);">Индекс готовности</div>
          <div style="width:24px; height:24px; border-radius:50%; background:var(--c-border-h); display:flex; align-items:center; justify-content:center; font-size:var(--fs-2); color:var(--c-text-3);">?</div>
        </div>
        
        <div style="display:flex; align-items:flex-end; gap:16px; margin-bottom:32px;">
          <div style="font-size:var(--fs-6); font-weight:var(--fw-black); color:${mainColor}; line-height:1; font-family:'Instrument Sans', sans-serif;">${data.index}</div>
          <div style="flex:1; padding-bottom:8px;">
            <div style="height:6px; background:var(--c-border-h); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${data.index}%; background:${mainColor}; border-radius:3px; transition: width 1s ease-out;"></div>
            </div>
            <div style="font-size:var(--fs-2); color:var(--c-text-3); margin-top:8px; text-transform:uppercase; font-weight:var(--fw-bold);">${indexLabel}</div>
          </div>
        </div>

        <div style="margin-bottom:32px;">
          ${hbar(data.recovery, 'Восстановление')}
          ${hbar(data.acwr, 'Нагрузка ACWR')}
          ${hbar(data.sleep, 'Качество сна')}
          ${hbar(data.monotony, 'Монотонность')}
          ${hbar(data.density, 'Тренд нагрузки')}
          ${hbar(data.density, 'Плотность и ритм')}
        </div>

        <div style="border-top:1px solid var(--c-border); padding-top:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div style="font-size:var(--fs-1); font-weight:var(--fw-black); letter-spacing:0.1em; color:var(--c-text-3); text-transform:uppercase;">Цель на сегодня</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:var(--c-red); font-size:var(--fs-2);">ЦНС</span>
              <div style="width:40px; height:4px; background:var(--c-border-h); border-radius:2px;"><div style="width:${data.cns}%; height:100%; background:var(--c-red); border-radius:2px; transition: width 1s ease-out;"></div></div>
              <span style="font-size:var(--fs-2); font-weight:var(--fw-bold); color:var(--c-red);">${data.cns}%</span>
            </div>
          </div>
          <div style="border-left:2px solid ${mainColor}; padding-left:12px;">
            <div style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-1); margin-bottom:4px;">${data.goal}</div>
          </div>
        </div>
      </div>
    `;
  }
  function playAudio(btn) {
    const container = btn.closest('.intel-feedback');
    if (!container) return;
    const textEl = container.querySelector('.intel-feedback-text');
    if (!textEl) return;
    
    // We only want the text, ignoring HTML structure like the readiness widget
    const textToSpeak = textEl.innerText.trim();
    if (textToSpeak) {
      speakText(textToSpeak);
    }
  }

  async function openSettings() {
    const lang = await _getLang();
    const voice = await _getVoice();
    const tone = await _getTone();
    
    const overlay = document.createElement('div');
    overlay.className = 'intel-overlay animate-in fade-in duration-500';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(5,5,7,0.95); backdrop-filter:blur(20px); display:flex; align-items:center; justify-content:center; padding:20px;';
    
    let selectedLang = lang;
    let selectedVoice = voice;

    overlay.innerHTML = `
      <div style="background:var(--c-bg-1); width:100%; max-width:400px; border-radius:32px; padding:32px; position:relative; box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.1) inset;">
        <button data-action="intel:closeReport" style="position:absolute; top:24px; right:24px; background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer;">&times;</button>
        <h2 style="color:var(--c-text-1); margin-bottom:24px; font-family:var(--font-heading); font-size:var(--fs-4);">AI Settings</h2>
        
        <div style="margin-bottom:24px;">
          <label style="display:block; color:var(--c-text-3); font-size:var(--fs-1); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px; font-weight:var(--fw-bold);">Language</label>
          <div style="display:flex; gap:8px; background:color-mix(in srgb, var(--c-surface) 40%, transparent); padding:6px; border-radius:16px; border:1px solid color-mix(in srgb, var(--c-border) 40%, transparent);" id="intel-lang-group">
            <button class="intel-set-btn-lang" data-val="en" style="flex:1; padding:12px; border-radius:12px; border:none; background:${lang === 'en' ? 'var(--c-bg-2)' : 'transparent'}; color:${lang === 'en' ? 'var(--c-text-1)' : 'var(--c-text-2)'}; cursor:pointer; font-weight:var(--fw-bold); transition:all 0.2s;">English</button>
            <button class="intel-set-btn-lang" data-val="ru" style="flex:1; padding:12px; border-radius:12px; border:none; background:${lang === 'ru' ? 'var(--c-bg-2)' : 'transparent'}; color:${lang === 'ru' ? 'var(--c-text-1)' : 'var(--c-text-2)'}; cursor:pointer; font-weight:var(--fw-bold); transition:all 0.2s;">Русский</button>
          </div>
        </div>
        
        <div style="margin-bottom:32px;">
          <label style="display:block; color:var(--c-text-3); font-size:var(--fs-1); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px; font-weight:var(--fw-bold);">Voice Persona (TTS)</label>
          <div style="display:flex; flex-direction:column; gap:10px;" id="intel-voice-group">
            <button class="intel-set-btn-voice" data-val="Puck" style="padding:16px; border-radius:16px; border:1px solid ${voice === 'Puck' ? 'var(--c-intel)' : 'color-mix(in srgb, var(--c-border) 40%, transparent)'}; background:${voice === 'Puck' ? 'color-mix(in srgb, var(--c-intel) 12%, transparent)' : 'color-mix(in srgb, var(--c-surface) 40%, transparent)'}; color:var(--c-text-1); cursor:pointer; text-align:left; font-weight:var(--fw-md); transition:all 0.2s;">Puck <span style="opacity:0.5; font-size:var(--fs-1); float:right; line-height:1.5;">Normal / Обычный</span></button>
            <button class="intel-set-btn-voice" data-val="Fenrir" style="padding:16px; border-radius:16px; border:1px solid ${voice === 'Fenrir' ? 'var(--c-intel)' : 'color-mix(in srgb, var(--c-border) 40%, transparent)'}; background:${voice === 'Fenrir' ? 'color-mix(in srgb, var(--c-intel) 12%, transparent)' : 'color-mix(in srgb, var(--c-surface) 40%, transparent)'}; color:var(--c-text-1); cursor:pointer; text-align:left; font-weight:var(--fw-md); transition:all 0.2s;">Fenrir <span style="opacity:0.5; font-size:var(--fs-1); float:right; line-height:1.5;">Stern / Грубый</span></button>
            <button class="intel-set-btn-voice" data-val="Aoede" style="padding:16px; border-radius:16px; border:1px solid ${voice === 'Aoede' ? 'var(--c-intel)' : 'color-mix(in srgb, var(--c-border) 40%, transparent)'}; background:${voice === 'Aoede' ? 'color-mix(in srgb, var(--c-intel) 12%, transparent)' : 'color-mix(in srgb, var(--c-surface) 40%, transparent)'}; color:var(--c-text-1); cursor:pointer; text-align:left; font-weight:var(--fw-md); transition:all 0.2s;">Aoede <span style="opacity:0.5; font-size:var(--fs-1); float:right; line-height:1.5;">Soft / Мягкий</span></button>
          </div>
        </div>

        <div style="margin-bottom:32px;">
          <label style="display:flex; justify-content:space-between; color:var(--c-text-3); font-size:var(--fs-1); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px; font-weight:var(--fw-bold);">
            <span>Coach Persona (Tone)</span>
            <span id="intel-tone-val" style="color:var(--c-intel)">${tone}</span>
          </label>
          <input type="range" id="intel-tone-slider" min="0" max="100" value="${tone}" style="width:100%; cursor:pointer; accent-color:var(--c-intel);">
          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:var(--c-text-3); text-transform:uppercase; font-weight:var(--fw-bold);">
            <span>Therapist</span>
            <span>Neutral</span>
            <span>Goggins</span>
          </div>
        </div>
        
        <button id="intel-save-settings" style="width:100%; padding:16px; border-radius:16px; background:var(--c-intel); border:none; color:black; font-weight:var(--fw-black); font-size:var(--fs-3); cursor:pointer;">SAVE & RELOAD</button>
      </div>
    `;
    
    if (document.startViewTransition) document.startViewTransition(() => document.body.appendChild(overlay));
    else document.body.appendChild(overlay);

    // Language selection
    overlay.querySelectorAll('.intel-set-btn-lang').forEach(btn => {
      btn.addEventListener('click', (e) => {
        selectedLang = btn.dataset.val;
        overlay.querySelectorAll('.intel-set-btn-lang').forEach(b => {
          b.style.background = b.dataset.val === selectedLang ? 'var(--c-bg-2)' : 'transparent';
          b.style.color = b.dataset.val === selectedLang ? 'var(--c-text-1)' : 'var(--c-text-2)';
        });
      });
    });

    // Voice selection
    overlay.querySelectorAll('.intel-set-btn-voice').forEach(btn => {
      btn.addEventListener('click', (e) => {
        selectedVoice = btn.dataset.val;
        overlay.querySelectorAll('.intel-set-btn-voice').forEach(b => {
          b.style.border = b.dataset.val === selectedVoice ? '1px solid var(--c-intel)' : '1px solid color-mix(in srgb, var(--c-border) 40%, transparent)';
          b.style.background = b.dataset.val === selectedVoice ? 'color-mix(in srgb, var(--c-intel) 12%, transparent)' : 'color-mix(in srgb, var(--c-surface) 40%, transparent)';
        });
      });
    });
    
    let selectedTone = tone;
    
    overlay.querySelector('#intel-tone-slider').addEventListener('input', (e) => {
      selectedTone = parseInt(e.target.value, 10);
      overlay.querySelector('#intel-tone-val').textContent = selectedTone;
    });

    overlay.querySelector('#intel-save-settings').addEventListener('click', async () => {
      const { DB } = await import('./db.js');
      await DB.Settings.set('intel-lang', selectedLang);
      await DB.Settings.set('intel-voice', selectedVoice);
      await DB.Settings.set('intel-tone', selectedTone);
      if (document.startViewTransition) document.startViewTransition(() => overlay.remove());
      else overlay.remove();
      load(); // Reload UI to apply language
    });
  }

  return { load, handleCamera, onFileSelected, submit, generateWeekly, createWorkout, analyzeStats, checkBiometrics, playAudio, _clearImage, abortRequest, openSettings, stopAudio, get currentPlan() { return currentPlan; } };
})();

// Expose to window for onclick
// @ts-ignore
window.IntelView = IntelView;
