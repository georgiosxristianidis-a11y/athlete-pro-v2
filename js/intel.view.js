// @ts-check
import { IntelStore } from './intel.store.js';
import { esc } from './shared/utils.js';

/**
 * IntelView — Athlete Pro
 * UI Renderer for the Neural Command Center.
 */
export const IntelView = (() => {
  let _initialized = false;

  async function load() {
    const screen = document.getElementById('s-intel');
    if (!screen) return;

    if (!_initialized) {
      IntelStore.init();
      _initialized = true;
    }

    screen.innerHTML = `
      <header class="intel-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h1 class="intel-title">Athlete Intel</h1>
          <div class="intel-sub">
            <span class="intel-indicator"></span>
            <span id="intel-status-text">${IntelStore.getStatus()}</span>
          </div>
        </div>
        <button onclick="Nav.go('s-home')" style="background:none; border:none; color:var(--c-text-3); font-size:24px; cursor:pointer;">&times;</button>
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

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:var(--sp-4)">
        <button class="card-action" onclick="IntelView.generateWeekly()" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:16px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-intel)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
          <div style="font-size:9px; font-weight:900; text-transform:uppercase; color:var(--c-text-3)">Weekly</div>
        </button>
        <button class="card-action" onclick="IntelView.createWorkout()" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:16px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-intel)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
          <div style="font-size:9px; font-weight:900; text-transform:uppercase; color:var(--c-text-3)">Create</div>
        </button>
        <button class="card-action" style="opacity:0.25; cursor:not-allowed; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:20px; padding:16px; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="color:var(--c-red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></div>
          <div style="font-size:9px; font-weight:900; text-transform:uppercase; color:var(--c-text-3)">Metrics</div>
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
      const el = document.getElementById('intel-status-text');
      if (el) el.textContent = IntelStore.getStatus();
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
      <div class="intel-feedback-label">AI Feedback</div>
      <div class="intel-feedback-text">...</div>
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
          engine: 'gemini'
        })
      });

      if (!response.ok) throw new Error('API Error');

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
                  fullText += parsed.text;
                  if (feedbackText) feedbackText.innerHTML = fullText.replace(/\\n/g, '<br>');
                }
              } catch (e) {}
            }
          }
        }
      }

      IntelStore.addLog('AI', 'Insight received.');
      IntelStore.setStatus('SYSTEM STANDBY');

    } catch (err) {
      console.error(err);
      IntelStore.addLog('SYS', 'Connection failed');
      IntelStore.setStatus('ERROR');
      if (feedbackText) feedbackText.textContent = 'Failed to connect to Neural Command Center.';
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
        body: JSON.stringify({ text: textToSpeak })
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
         body: JSON.stringify({ workouts: recentWorkouts, profile, engine: 'gemini' })
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
     IntelStore.addLog('SYS', 'Ready to generate workout plan');
     IntelStore.setStatus('WAITING FOR PROMPT');
     const input = document.getElementById('intel-input');
     if (input) {
         input.focus();
         // @ts-ignore
         input.placeholder = "e.g. 'Push workout for hypertrophy'";
     }
  }

  return { load, handleCamera, onFileSelected, submit, generateWeekly, createWorkout, _clearImage };
})();

// Expose to window for onclick
// @ts-ignore
window.IntelView = IntelView;
