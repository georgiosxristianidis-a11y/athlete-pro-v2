// @ts-check
/* ════════════════════════════════════════════════════════
   pip.js — Picture-in-Picture Video Hack
   Uses a hidden canvas to generate a MediaStream for a <video>
   element, allowing true OS-level PiP for the workout timer.
   ════════════════════════════════════════════════════════ */

export const PiP = (() => {
  /** @type {HTMLCanvasElement|null} */
  let _canvas = null;
  /** @type {CanvasRenderingContext2D|null} */
  let _ctx = null;
  /** @type {HTMLVideoElement|null} */
  let _video = null;

  let _lastState = { time: '00:00', name: 'Workout', sets: '' };

  function init() {
    if (_canvas) return; // Already initialized

    _canvas = document.createElement('canvas');
    _canvas.width = 400;
    _canvas.height = 200;
    _ctx = _canvas.getContext('2d');

    _video = document.createElement('video');
    _video.muted = true;
    _video.playsInline = true;
    _video.style.display = 'none';

    // Capture stream at 1 FPS to save battery
    // @ts-ignore - captureStream is valid on canvas
    const stream = _canvas.captureStream(1);
    _video.srcObject = stream;

    document.body.appendChild(_canvas); // Must be in DOM for some browsers to capture stream, but we hide it via CSS
    _canvas.style.display = 'none';
    document.body.appendChild(_video);

    // Ensure video is playing so PiP works
    _video.play().catch(() => {
      // Audio context might require user interaction first, muted usually bypasses this
    });

    _draw(_lastState);
  }

  function _draw(state) {
    if (!_ctx || !_canvas) return;

    // Background (Vantablack)
    _ctx.fillStyle = '#0a0a0f';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

    // Timer (Green accent)
    _ctx.fillStyle = '#00e676';
    _ctx.font = 'bold 72px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(state.time, _canvas.width / 2, _canvas.height / 2 - 20);

    // Exercise Name (White)
    _ctx.fillStyle = '#ffffff';
    _ctx.font = 'bold 24px Arial, sans-serif';
    _ctx.fillText(state.name, _canvas.width / 2, _canvas.height / 2 + 40);

    // Sets (Gray)
    if (state.sets) {
      _ctx.fillStyle = '#a1a1aa';
      _ctx.font = '18px Arial, sans-serif';
      _ctx.fillText(`Sets: ${state.sets}`, _canvas.width / 2, _canvas.height / 2 + 75);
    }
  }

  /**
   * Update the canvas with new text. Call this every second.
   * @param {{time: string, name: string, sets: string}} state 
   */
  function drawFrame(state) {
    _lastState = state;
    if (_canvas) {
        _draw(state);
        // Sometimes play needs to be nudged if it paused
        if (_video && _video.paused) _video.play().catch(()=>{});
    }
  }

  async function requestPiP() {
    if (!_video) init();
    if (document.pictureInPictureElement) {
      return document.exitPictureInPicture();
    }
    if (document.pictureInPictureEnabled && _video) {
      try {
        await _video.play(); // Must be playing
        await _video.requestPictureInPicture();
      } catch (err) {
        console.warn('PiP failed', err);
        window.Toast?.show('PiP not supported or blocked', 'error');
      }
    } else {
        window.Toast?.show('PiP not supported by browser', 'error');
    }
  }

  return { init, drawFrame, requestPiP };
})();
