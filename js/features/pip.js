// @ts-check
/* ════════════════════════════════════════════════════════
   pip.js — Elite Picture-in-Picture
   Supports both Video-based PiP (Canvas hack) and modern
   Document Picture-in-Picture for full interactivity.
   ════════════════════════════════════════════════════════ */

export const PiP = (() => {
  /** @type {HTMLCanvasElement|null} */
  let _canvas = null;
  /** @type {CanvasRenderingContext2D|null} */
  let _ctx = null;
  /** @type {HTMLVideoElement|null} */
  let _video = null;
  /** @type {any} */
  let _pipWindow = null;

  let _lastState = { time: '00:00', name: 'Workout', sets: '', nextName: '', bpm: 0 };
  
  // HR Wave animation state
  let _hrPoints = Array(20).fill(0);
  let _hrPhase = 0;

  function init() {
    if (_canvas) return;

    _canvas = document.createElement('canvas');
    _canvas.width = 512;
    _canvas.height = 256;
    _ctx = _canvas.getContext('2d');

    _video = document.createElement('video');
    _video.muted = true;
    _video.playsInline = true;
    _video.style.display = 'none';

    // @ts-ignore
    const stream = _canvas.captureStream(5); // 5 FPS for smoother HR wave
    _video.srcObject = stream;

    document.body.appendChild(_canvas);
    _canvas.style.position = 'fixed';
    _canvas.style.left = '-1000px'; 
    document.body.appendChild(_video);

    _video.play().catch(() => {});
    _draw(_lastState);
  }

  function _draw(state) {
    if (!_ctx || !_canvas) return;

    // Vantablack deep background
    _ctx.fillStyle = '#050507';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

    // Grid pattern (Vantablack style)
    _ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    _ctx.lineWidth = 1;
    for (let x = 0; x < _canvas.width; x += 32) {
      _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, _canvas.height); _ctx.stroke();
    }
    for (let y = 0; y < _canvas.height; y += 32) {
      _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(_canvas.width, y); _ctx.stroke();
    }

    // Accent line at bottom
    _ctx.fillStyle = '#00e676';
    _ctx.fillRect(0, _canvas.height - 4, _canvas.width, 4);

    // Timer (Elite Bold)
    _ctx.fillStyle = '#00e676';
    _ctx.font = '900 110px "Syne", sans-serif';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.shadowBlur = 15;
    _ctx.shadowColor = 'rgba(0, 230, 118, 0.4)';
    _ctx.fillText(state.sets || state.time, _canvas.width / 2, _canvas.height / 2 - 25);
    _ctx.shadowBlur = 0;

    // Current Exercise
    _ctx.fillStyle = '#ffffff';
    _ctx.font = '800 24px "Syne", sans-serif';
    _ctx.letterSpacing = '1px';
    _ctx.fillText(state.name.toUpperCase() + " • " + state.time, _canvas.width / 2, _canvas.height / 2 + 50);

    // Next Exercise Preview (Elite Feature)
    if (state.nextName) {
      _ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      _ctx.font = '700 14px "Syne", sans-serif';
      const ru = navigator.language.startsWith('ru');
      _ctx.fillText(`${ru ? 'ДАЛЕЕ' : 'NEXT'}: ${state.nextName.toUpperCase()}`, _canvas.width / 2, _canvas.height / 2 + 80);
    }

    // HR Graph (Elite Feature)
    _drawHRGraph(state.bpm);
  }

  function _drawHRGraph(bpm) {
    if (!_ctx || !_canvas) return;
    const xBase = 420;
    const yBase = 200;
    const width = 80;
    const height = 40;

    // Pulse points
    _hrPhase += 0.2;
    _hrPoints.shift();
    // Simulate pulse wave
    const val = Math.sin(_hrPhase) * 10 + (Math.random() * 5);
    _hrPoints.push(val);

    _ctx.strokeStyle = '#ff4d88';
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    _hrPoints.forEach((p, i) => {
      const x = xBase + (i * (width / _hrPoints.length));
      const y = yBase - p;
      if (i === 0) _ctx.moveTo(x, y);
      else _ctx.lineTo(x, y);
    });
    _ctx.stroke();

    // BPM text
    _ctx.fillStyle = '#ff4d88';
    _ctx.font = 'bold 16px monospace';
    _ctx.fillText(`${bpm || '--'} BPM`, xBase + width/2, yBase + 20);
  }

  function drawFrame(state) {
    _lastState = { ..._lastState, ...state };
    if (_canvas) _draw(_lastState);
    if (_video && _video.paused) _video.play().catch(()=>{});
    
    if (_pipWindow) {
      const timeEl = _pipWindow.document.getElementById('pip-time');
      const nameEl = _pipWindow.document.getElementById('pip-name');
      const nextEl = _pipWindow.document.getElementById('pip-next-ex');
      const bpmEl = _pipWindow.document.getElementById('pip-bpm');
      if (timeEl) timeEl.textContent = _lastState.sets || _lastState.time;
      if (nameEl) nameEl.textContent = _lastState.name + " • " + _lastState.time;
      if (nextEl) nextEl.textContent = _lastState.nextName ? `NEXT: ${_lastState.nextName}` : '';
      if (bpmEl) bpmEl.textContent = _lastState.bpm ? `${_lastState.bpm} BPM` : '-- BPM';
    }
  }

  async function requestPiP() {
    if (window.documentPictureInPicture) {
      try {
        _pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 340,
          height: 240,
        });
        _setupPiPWindow(_pipWindow);
        return;
      } catch (err) {
        console.warn('DPiP failed, fallback to Video');
      }
    }

    if (!_video) init();
    if (document.pictureInPictureElement) return document.exitPictureInPicture();
    if (document.pictureInPictureEnabled && _video) {
      try {
        await _video.play();
        await _video.requestPictureInPicture();
      } catch (err) {
        window.Toast?.show('PiP failed', 'error');
      }
    }
  }

  function _setupPiPWindow(pipWin) {
    const d = pipWin.document;
    const style = d.createElement('style');
    style.textContent = `
      body {
        margin: 0; padding: 20px;
        background: #050507; color: #fff;
        font-family: system-ui, sans-serif;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        overflow: hidden;
      }
      #pip-time { font-size: 64px; font-weight: 900; color: #00e676; margin-bottom: 2px; letter-spacing: -2px; }
      #pip-name { font-size: 15px; font-weight: 800; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; }
      #pip-next-ex { font-size: 11px; font-weight: 700; opacity: 0.4; margin-top: 4px; color: #a78bfa; text-transform: uppercase; }
      .pip-header { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      #pip-bpm { font-size: 12px; font-weight: 800; color: #ff4d88; }
      .pip-actions { display: flex; gap: 10px; margin-top: 20px; width: 100%; }
      .pip-btn {
        flex: 1; padding: 12px; border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: #fff; font-weight: 700; font-size: 13px;
        cursor: pointer; transition: all 0.2s;
      }
      .pip-btn-primary { background: #00e676; color: #000; border: none; }
    `;
    d.head.appendChild(style);

    d.body.innerHTML = `
      <div class="pip-header">
        <span id="pip-bpm">${_lastState.bpm || '--'} BPM</span>
        <span style="font-size:10px; opacity:0.3; font-weight:900">ATH-PRO</span>
      </div>
      <div id="pip-time">${_lastState.sets || _lastState.time}</div>
      <div id="pip-name">${_lastState.name} • ${_lastState.time}</div>
      <div id="pip-next-ex">${_lastState.nextName ? `NEXT: ${_lastState.nextName}` : ''}</div>
      <div class="pip-actions">
        <button class="pip-btn" id="pip-plus">+15s</button>
        <button class="pip-btn pip-btn-primary" id="pip-next">NEXT</button>
      </div>
    `;

    d.getElementById('pip-plus').onclick = () => window.RestTimer.addTime(15);
    d.getElementById('pip-next').onclick = () => window.RestTimer.tapSkip();
    pipWin.onpagehide = () => { _pipWindow = null; };
  }

  return { init, drawFrame, requestPiP };
})();
