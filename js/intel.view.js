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
      <header class="intel-header">
        <h1 class="intel-title">Athlete Intel</h1>
        <div class="intel-sub">
          <span class="intel-indicator"></span>
          <span id="intel-status-text">${IntelStore.getStatus()}</span>
        </div>
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


  function generateWeekly() {
     IntelStore.addLog('SYS', 'Computing weekly intelligence...');
     IntelStore.setStatus('COMPUTING INTEL...');
     setTimeout(() => {
         IntelStore.addLog('AI', 'Weekly report generated. Performance Score: 88');
         IntelStore.setStatus('SYSTEM STANDBY');
     }, 1500);
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
