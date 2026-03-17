// @ts-check
/* ════════════════════════════════════════════════════════
   rest-timer.js — Per-set rest timer with bar + modal UI
   ════════════════════════════════════════════════════════ */

export const RestTimer = (() => {
  let _raf = null,
    _end = 0,
    _total = 90,
    _tapTimer = 0;

  /**
   * Start the rest timer with exercise context.
   * @param {string} exName — exercise name for display
   * @param {string} setLabel — set label for display (e.g., "Set 3")
   * @param {number} [seconds=90] — rest duration in seconds
   * @returns {void}
   */
  function start(exName, setLabel, seconds) {
    seconds = seconds || 90;
    _total = seconds;
    _end = Date.now() + seconds * 1000;
    cancelAnimationFrame(_raf);
    _show(exName, setLabel);
    _tick();
    navigator.vibrate?.([30]);
  }

  /**
   * Stop the rest timer and hide all UI.
   * @returns {void}
   */
  function stop() {
    cancelAnimationFrame(_raf);
    _raf = null;
    _hideBar();
    _hideModal();
  }

  /**
   * Add time to the running rest timer.
   * @param {number} sec — seconds to add
   * @returns {void}
   */
  function addTime(sec) {
    _end += sec * 1000;
    _total += sec;
    navigator.vibrate?.([15]);
  }

  /**
   * Tap to skip rest (double-tap to stop).
   * @returns {void}
   */
  function tapSkip() {
    const now = Date.now();
    if (now - _tapTimer < 380) {
      stop();
      return;
    }
    _tapTimer = now;
    stop();
  }

  function _tick() {
    const rem = Math.max(0, Math.ceil((_end - Date.now()) / 1000));
    _updateBar(rem);
    _updateModal(rem);
    if (rem <= 0) {
      _onDone();
      return;
    }
    _raf = requestAnimationFrame(_tick);
  }

  function _onDone() {
    navigator.vibrate?.([100, 50, 100, 50, 200]);
    _hideBar();
    _hideModal();
  }

  function _fmt(s) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function _show(exName, setLabel) {
    let bar = document.getElementById('rest-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rest-bar';
      bar.innerHTML = `
        <div class="rest-bar-inner">
          <span class="rest-bar-label" id="rb-label"></span>
          <div class="rest-bar-mid">
            <span class="rest-bar-time" id="rb-time">0:00</span>
            <button class="rest-bar-plus" onclick="RestTimer.addTime(30)">+30s</button>
          </div>
          <button class="rest-bar-skip"
            ontouchstart="RestTimer.tapSkip();event.preventDefault()"
            onclick="RestTimer.tapSkip()">Skip</button>
        </div>
        <div class="rest-bar-track">
          <div class="rest-bar-fill" id="rb-fill"></div>
        </div>`;
      bar.addEventListener('click', (e) => {
        if (!e.target.closest('button')) _openModal(exName, setLabel);
      });
      const hdr =
        document.getElementById('workout-header') || document.querySelector('.workout-top');
      if (hdr) hdr.after(bar);
      else document.getElementById('screen-workout')?.prepend(bar);
    }
    document.getElementById('rb-label').textContent = exName + ' · ' + setLabel;
    bar.classList.add('visible');
  }

  function _updateBar(rem) {
    const t = document.getElementById('rb-time');
    const f = document.getElementById('rb-fill');
    if (t) t.textContent = _fmt(rem);
    if (f) f.style.width = (rem / _total) * 100 + '%';
  }

  function _hideBar() {
    document.getElementById('rest-bar')?.classList.remove('visible');
  }

  function _openModal(exName, setLabel) {
    if (document.getElementById('rest-modal')) return;
    const m = document.createElement('div');
    m.id = 'rest-modal';
    m.className = 'rest-modal-overlay';
    m.innerHTML = `
      <div class="rest-modal-sheet">
        <div class="modal-handle"></div>
        <p class="rest-modal-sub" id="rm-sub">${exName} · ${setLabel}</p>
        <div class="rest-ring-wrap">
          <svg viewBox="0 0 120 120" class="rest-ring-svg">
            <circle cx="60" cy="60" r="52" class="ring-track"/>
            <circle cx="60" cy="60" r="52" class="ring-prog" id="rm-ring"
              stroke-dasharray="326.7" stroke-dashoffset="0"/>
          </svg>
          <div class="rest-ring-inner">
            <span class="rest-modal-time" id="rm-time">0:00</span>
            <span class="rest-modal-lbl">REST</span>
          </div>
        </div>
        <div class="rest-modal-btns">
          <button class="rest-btn-sec" onclick="RestTimer.addTime(30)">+30s</button>
          <button class="rest-btn-primary"
            ontouchstart="RestTimer.tapSkip();event.preventDefault()"
            onclick="RestTimer.tapSkip()">
            Skip<br><small>×2 = Stop</small>
          </button>
        </div>
      </div>`;
    m.onclick = (e) => {
      if (e.target === m) m.remove();
    };
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('visible'));
  }

  function _updateModal(rem) {
    const t = document.getElementById('rm-time');
    const r = document.getElementById('rm-ring');
    if (t) t.textContent = _fmt(rem);
    if (r) r.style.strokeDashoffset = 326.7 * (1 - rem / _total);
  }

  function _hideModal() {
    const m = document.getElementById('rest-modal');
    if (m) {
      m.classList.remove('visible');
      setTimeout(() => m.remove(), 300);
    }
  }

  return { start, stop, addTime, tapSkip };
})();
