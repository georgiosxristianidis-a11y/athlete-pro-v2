// @ts-check
import { IntelStore } from './intel.store.js';
import { esc, haptic } from './shared/utils.js';
import { toUserMessage } from './shared/errors-ui.js';
import { DB } from './db.js';

/**
 * IntelView — Athlete Pro
 * UI Renderer for the Neural Command Center.
 */
export const IntelView = (() => {
  let _initialized = false;
  let _hasValidKey = false;

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

    screen.innerHTML = `
      <header class="intel-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h1 class="intel-title">P.A.N.D.A. Core</h1>
          <div class="intel-sub">
            <span class="ai-indicator ${_hasValidKey ? 'active' : 'missing'}" style="margin-right:4px;"></span>
            <span style="color: ${_hasValidKey ? 'var(--c-accent)' : 'var(--c-text-3)'}; font-weight:700; text-transform:lowercase; opacity:0.8;">${_hasValidKey ? 'system secure' : 'key missing'}</span>
            <span style="opacity:0.2; margin: 0 6px;">|</span>
            <span id="intel-status-text" style="color: var(--c-text-2); font-weight:800; text-transform:lowercase;">${IntelStore.getStatus()}</span>
          </div>
        </div>
        <button onclick="Nav.go('s-home')" style="background:none; border:none; color:var(--c-text-3); font-size:28px; font-weight:200; cursor:pointer; padding:0 8px;">&times;</button>
      </header>

      <div id="intel-feedback-feed"></div>

      <div id="intel-vision-preview-wrap"></div>

      <div class="intel-cmd-wrap">
        <div class="intel-cmd-bar">
          <button class="intel-btn-icon" id="intel-btn-camera" onclick="IntelView.handleCamera()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          <input type="text" id="intel-input" class="intel-cmd-input" placeholder="Command or vision query..." onkeydown="if(event.key==='Enter') IntelView.submit()">
          <button class="intel-btn-icon intel-btn-send" id="intel-btn-send" onclick="IntelView.submit()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <input type="file" id="intel-file-input" accept="image/*" style="display:none" onchange="IntelView.onFileSelected(event)">
      </div>

      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:var(--sp-4)">
        <button class="card-action" onclick="IntelView.generateWeekly()" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:12px 8px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-intel)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
          <div style="font-size:8px; font-weight:900; text-transform:uppercase; color:var(--c-text-3); letter-spacing:0.05em;">СВОДКА</div>
        </button>
        <button class="card-action" onclick="IntelView.createWorkout()" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:12px 8px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-accent)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
          <div style="font-size:8px; font-weight:900; text-transform:uppercase; color:var(--c-text-3); letter-spacing:0.05em;">ГЕНЕРАЦИЯ</div>
        </button>
        <button class="card-action" onclick="IntelView.analyzeStats()" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:12px 8px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-blue)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></div>
          <div style="font-size:8px; font-weight:900; text-transform:uppercase; color:var(--c-text-3); letter-spacing:0.05em;">АНАЛИЗ</div>
        </button>
        <button class="card-action" onclick="IntelView.checkBiometrics()" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:12px 8px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
          <div style="font-size:8px; font-weight:900; text-transform:uppercase; color:var(--c-text-3); letter-spacing:0.05em;">БИОМЕТРИЯ</div>
        </button>
      </div>

      <div class="intel-logs">
        <div class="intel-logs-header">
          <h3 class="intel-logs-title">STREAMING_LOGS</h3>
          <span class="intel-logs-status" id="intel-logs-status-pill">ONLINE</span>
        </div>
        <div id="intel-logs-container" style="max-height: 200px; overflow-y: auto;"></div>
      </div>
    `;

    renderLogs();
    _listen();
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

    window.addEventListener('ap-intel-log', renderLogs);
    window.addEventListener('ap-intel-status', () => {
      const statusText = IntelStore.getStatus();
      const el = document.getElementById('intel-status-text');
      if (el) el.textContent = statusText;
      
      const pill = document.getElementById('intel-logs-status-pill');
      if (pill) {
        pill.textContent = statusText;
        let color = 'var(--c-intel)';
        if (statusText.includes('ERROR')) color = 'var(--c-red)';
        else if (statusText.includes('SCANNING')) color = 'var(--c-accent)';
        else if (statusText.includes('COMPUTING')) color = 'var(--c-amber)';
        else if (statusText.includes('STANDBY')) color = 'var(--c-text-3)';
        pill.style.color = color;
        pill.style.borderColor = color;
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
        <button onclick="document.getElementById('intel-vision-preview-wrap').innerHTML=''; window.IntelView._clearImage();" style="position:absolute; top:8px; right:8px; width:24px; height:24px; border-radius:50%; background:rgba(0,0,0,0.5); border:none; color:white; display:flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer;">&times;</button>
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
        <button class="intel-btn-icon" style="opacity:0.5; width:24px; height:24px; padding:0;" title="Озвучить" onclick="IntelView.playAudio(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
        </button>
      </div>
      <div class="intel-feedback-text">
        <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
          <div style="width:12px; height:12px; border-radius:50%; background:var(--c-intel); box-shadow:0 0 10px var(--c-intel); animation: it-breathe 1.5s infinite ease-in-out;"></div>
          <div style="font-size:10px; font-weight:800; text-transform:uppercase; color:var(--c-intel); letter-spacing:0.15em; animation: it-breathe 1.5s infinite ease-in-out 0.2s;">Analysing Intel...</div>
        </div>
      </div>
    `;
    feedbackFeed?.prepend(feedbackEl);
    const feedbackText = feedbackEl.querySelector('.intel-feedback-text');

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
          engine: 'gemini',
          customKey: await DB.Settings.get('gemini-key')
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
                    let rawText = fullText;
                    
                    // 1. Hide <thinking> tags and anything inside them
                    rawText = rawText.replace(/<thinking>[\s\S]*?(<\/thinking>|$)/g, '');
                    
                    // 2. Extract JSON widget before escaping
                    let htmlWidget = '';
                    const jsonMatch = rawText.match(/\{[\s\S]*"_widget"\s*:\s*"readiness"[\s\S]*\}/);
                    if (jsonMatch) {
                      try {
                        const widgetData = JSON.parse(jsonMatch[0]);
                        htmlWidget = _buildReadinessWidget(widgetData);
                        rawText = rawText.replace(jsonMatch[0], '[[WIDGET_PLACEHOLDER]]');
                      } catch (e) { }
                    }
                    
                    // 3. Escape the raw text
                    let safeText = esc(rawText);
                    
                    // 4. Basic markdown (bold)
                    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    
                    // 5. Convert newlines to breaks
                    safeText = safeText.replace(/\n/g, '<br>');
                    
                    // 6. Re-insert widget
                    if (htmlWidget) {
                      safeText = safeText.replace('[[WIDGET_PLACEHOLDER]]', htmlWidget);
                    }
                    
                    feedbackText.innerHTML = safeText;
                  }
                }
              } catch (e) {}
            }
          }
        }
      }

      IntelStore.addLog('AI', 'Insight received.');
      IntelStore.setStatus('SYSTEM STANDBY');

      // Auto-Speech
      const autoSpeech = await DB.Settings.get('ai-auto-speech', true);
      if (autoSpeech && feedbackText) {
        const textToSpeak = feedbackText.innerText.trim();
        if (textToSpeak) speakText(textToSpeak);
      }

    } catch (err) {
      console.error(err);
      IntelStore.addLog('SYS', 'Connection failed');
      IntelStore.setStatus('ERROR');
      if (feedbackText) feedbackText.textContent = toUserMessage(err);
    }
  }

  function _clearImage() { _pendingImage = null; }

  let _isSpeaking = false;

  async function speakText(textToSpeak) {
    if (!textToSpeak || _isSpeaking) return;
    _isSpeaking = true;
    IntelStore.addLog('SYS', 'Synthesizing coach voice...');

    try {
      const response = await fetch('/api/coach/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: textToSpeak,
          customKey: await (await import('./db.js')).DB.Settings.get('gemini-key')
        })
      });

      if (!response.ok) throw new Error('Voice sync failed');

      const result = await response.json();
      const pcmData = result.audioBase64;
      if (!pcmData) throw new Error("Audio data not found");

      const audioBlob = pcmToWav(pcmData, 24000); 
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => { _isSpeaking = false; URL.revokeObjectURL(audioUrl); };
      await audio.play();
    } catch (err) { 
      IntelStore.addLog('ERROR', 'Voice synthesis failed'); 
      _isSpeaking = false; 
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

  async function generateWeekly() {
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
           engine: 'gemini',
           customKey: await DB.Settings.get('gemini-key')
         })
       });

       if (!response.ok) throw new Error('Report generation failed');

       const { report } = await response.json();
       
       IntelStore.addLog('AI', `Weekly report generated. Performance Score: ${report.score}`);
       IntelStore.setStatus('SYSTEM STANDBY');

       _renderReportOverlay(report);
       speakText(`Твой прогресс за неделю: ${report.score} баллов. ${report.summary}`);

     } catch (err) {
       IntelStore.addLog('ERROR', 'Failed to generate weekly intel');
       IntelStore.setStatus('ERROR');
     }
  }

  function _renderReportOverlay(report) {
    const overlay = document.createElement('div');
    overlay.className = 'intel-report-overlay animate-in fade-in duration-500';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(5,5,7,0.95); backdrop-filter:blur(20px); display:flex; align-items:center; justify-content:center; padding:20px;';
    
    overlay.innerHTML = `
      <div style="background:#0a0a0a; width:100%; max-width:500px; border-radius:32px; border:1px solid rgba(255,255,255,0.1); padding:40px; position:relative; max-height:90vh; overflow-y:auto;">
        <button onclick="this.closest('.intel-report-overlay').remove()" style="position:absolute; top:24px; right:24px; background:none; border:none; color:var(--c-text-3); font-size:24px; cursor:pointer;">&times;</button>
        <div style="text-align:center; margin-bottom:32px;">
           <h2 style="font-family:var(--font-intel); font-size:24px; font-style:italic; color:var(--c-text-1); text-transform:uppercase; margin-bottom:16px;">Weekly Intel</h2>
           <div style="display:flex; flex-direction:column; align-items:center;">
             <span style="font-size:72px; font-weight:900; color:var(--c-intel); text-shadow:0 0 20px rgba(0,209,255,0.4); line-height:1;">${report.score}</span>
             <span style="font-size:10px; font-weight:900; color:var(--c-text-3); text-transform:uppercase; letter-spacing:0.5em; margin-top:8px;">Performance Score</span>
           </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:24px;">
          <section style="background:rgba(255,255,255,0.05); padding:24px; border-radius:24px; border:1px solid rgba(255,255,255,0.05);">
            <p style="font-size:14px; font-style:italic; color:var(--c-text-2); line-height:1.6; font-weight:600;">"${esc(report.summary)}"</p>
          </section>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div style="background:rgba(0,230,118,0.05); padding:20px; border-radius:24px; border:1px solid rgba(0,230,118,0.1);">
               <h4 style="font-size:10px; font-weight:900; text-transform:uppercase; color:var(--c-accent); margin-bottom:12px; letter-spacing:0.2em;">Wins</h4>
               <ul style="font-size:12px; color:var(--c-text-3); list-style:none; display:flex; flex-direction:column; gap:8px;">
                 ${report.pros.map(p => `<li style="display:flex; gap:8px;"><span style="color:var(--c-accent)">+</span>${esc(p)}</li>`).join('')}
               </ul>
            </div>
            <div style="background:rgba(255,77,136,0.05); padding:20px; border-radius:24px; border:1px solid rgba(255,77,136,0.1);">
               <h4 style="font-size:10px; font-weight:900; text-transform:uppercase; color:var(--c-red); margin-bottom:12px; letter-spacing:0.2em;">Leaks</h4>
               <ul style="font-size:12px; color:var(--c-text-3); list-style:none; display:flex; flex-direction:column; gap:8px;">
                 ${report.cons.map(c => `<li style="display:flex; gap:8px;"><span style="color:var(--c-red)">-</span>${esc(c)}</li>`).join('')}
               </ul>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }


  function createWorkout() {
     haptic(10);
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

  function analyzeStats() {
     haptic(10);
     IntelStore.addLog('SYS', 'Ready to analyze stats');
     const input = document.getElementById('intel-input');
     if (input) {
         input.value = "Проведи глубокий разбор последней тренировки. Сгенерируй readiness-виджет (_widget: readiness) с оценкой 0-100. Напиши пару строк о главном успехе и слабом месте.";
         submit();
     }
  }

  function checkBiometrics() {
     haptic(10);
     IntelStore.addLog('SYS', 'Requesting Biometrics scan');
     const input = document.getElementById('intel-input');
     if (input) {
         input.value = "Проанализируй мою тепловую карту мышц (Heatmap) и историю нагрузок. Выведи отчет о биометрии: какие мышцы устали, какие готовы к взрывной работе. Дай оценку ЦНС.";
         submit();
     }
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
          <div style="font-size:12px; font-weight:600; color:var(--c-text-2);">${label}</div>
          <div style="display:flex; align-items:center; gap:8px; width:55%;">
            <div style="flex:1; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
              <div style="width:${val}%; height:100%; background:${c}; border-radius:3px; transition: width 1s ease-out;"></div>
            </div>
            <span style="font-size:12px; font-weight:800; color:${c}; width:28px; text-align:right;">${val}</span>
          </div>
        </div>
      `;
    };

    const mainColor = getColor(data.index);
    const indexLabel = data.index >= 90 ? 'отлично' : data.index >= 70 ? 'хорошо' : data.index >= 50 ? 'удовл' : 'внимание';

    return `
      <div class="intel-readiness-widget animate-in" style="background:rgba(139,92,246,0.03); border:1px solid rgba(139,92,246,0.1); border-radius:24px; padding:20px; margin:16px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
          <div style="font-size:16px; font-weight:600; color:var(--c-text-1);">Индекс готовности</div>
          <div style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:12px; color:var(--c-text-3);">?</div>
        </div>
        
        <div style="display:flex; align-items:flex-end; gap:16px; margin-bottom:32px;">
          <div style="font-size:42px; font-weight:800; color:${mainColor}; line-height:1; font-family:'Instrument Sans', sans-serif;">${data.index}</div>
          <div style="flex:1; padding-bottom:8px;">
            <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${data.index}%; background:${mainColor}; border-radius:3px; transition: width 1s ease-out;"></div>
            </div>
            <div style="font-size:12px; color:var(--c-text-3); margin-top:8px; text-transform:uppercase; font-weight:700;">${indexLabel}</div>
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

        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div style="font-size:11px; font-weight:800; letter-spacing:0.1em; color:var(--c-text-3); text-transform:uppercase;">Цель на сегодня</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:var(--c-red); font-size:12px;">ЦНС</span>
              <div style="width:40px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px;"><div style="width:${data.cns}%; height:100%; background:var(--c-red); border-radius:2px; transition: width 1s ease-out;"></div></div>
              <span style="font-size:12px; font-weight:700; color:var(--c-red);">${data.cns}%</span>
            </div>
          </div>
          <div style="border-left:2px solid ${mainColor}; padding-left:12px;">
            <div style="font-size:16px; font-weight:600; color:var(--c-text-1); margin-bottom:4px;">${data.goal}</div>
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

  return { load, handleCamera, onFileSelected, submit, generateWeekly, createWorkout, analyzeStats, checkBiometrics, playAudio, _clearImage };
})();

// Expose to window for onclick
// @ts-ignore
window.IntelView = IntelView;
