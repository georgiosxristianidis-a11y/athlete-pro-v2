// @ts-check
/* ════════════════════════════════════════════════════════
   timer.js — Athlete Pro  |  Isolated timer module
   Visibility API guard + localStorage persistence
   ════════════════════════════════════════════════════════ */

export const Timer = (() => {
  let _start = null;
  let _elapsed = 0;
  let _interval = null;
  let _running = false;
  let _onTick = null;

  const STORAGE_KEY = 'ap-timer-state';

  /**
   * Start the main workout timer.
   * @param {((s: number) => void)} [onTick] — optional callback invoked each second with elapsed seconds
   * @returns {void}
   */
  function start(onTick) {
    _onTick = onTick || _onTick;
    _start = Date.now();
    _running = true;
    _interval = setInterval(_tick, 1000);
    _persist();
  }

  /**
   * Pause the running timer and persist state.
   * @returns {void}
   */
  function pause() {
    if (!_running) return;
    _elapsed += Date.now() - _start;
    _running = false;
    clearInterval(_interval);
    _persist();
  }

  /**
   * Resume the paused timer.
   * @returns {void}
   */
  function resume() {
    if (_running) return;
    _start = Date.now();
    _running = true;
    _interval = setInterval(_tick, 1000);
    _persist();
  }

  /**
   * Reset the timer to zero and clear persisted state.
   * @returns {void}
   */
  function reset() {
    clearInterval(_interval);
    _start = null;
    _elapsed = 0;
    _running = false;
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Get the current elapsed time in whole seconds.
   * @returns {number}
   */
  function seconds() {
    if (!_running) return Math.floor(_elapsed / 1000);
    return Math.floor((_elapsed + Date.now() - _start) / 1000);
  }

  /**
   * Format a number of seconds as a MM:SS or H:MM:SS string.
   * @param {number} s — seconds to format
   * @returns {string}
   */
  function fmt(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function _tick() {
    if (_onTick) _onTick(seconds());
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.update();
  }

  function _persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        start: _start,
        elapsed: _elapsed,
        running: _running,
        savedAt: Date.now(),
      })
    );
  }

  /**
   * Restore timer state from localStorage (e.g. after page reload).
   * @returns {boolean} — true if state was restored, false if none found
   */
  function restore() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      _elapsed = s.elapsed || 0;
      _running = s.running || false;
      if (_running && s.start) {
        _elapsed += Date.now() - s.start;
        _start = Date.now();
        _interval = setInterval(_tick, 1000);
      }
      return true;
    } catch {
      return false;
    }
  }

  /* ── Visibility API: freeze/resume on tab hide/show ── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (_running) {
        _elapsed += Date.now() - _start;
        _running = false;
        clearInterval(_interval);
        _persist();
        localStorage.setItem('ap-hidden-at', Date.now());
      }
    } else {
      const hiddenAt = localStorage.getItem('ap-hidden-at');
      if (hiddenAt && _elapsed > 0) {
        _start = Date.now();
        _running = true;
        _interval = setInterval(_tick, 1000);
        _persist();
        localStorage.removeItem('ap-hidden-at');
        if (_onTick) _onTick(seconds());
      }
    }
  });

  return { start, pause, resume, reset, seconds, fmt, restore };
})();
