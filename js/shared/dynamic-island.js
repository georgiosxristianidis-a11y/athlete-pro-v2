// @ts-check
import { State, getWeekMode } from '../workout.store.js';
import { Timer } from '../timer.js';

/**
 * dynamic-island.js — Interactive session overlay (PIP)
 * Shows: Timer, Sets done/total, Current exercise, Next exercise
 * Interactions: Draggable, Tap to expand, Set complete pulse
 */

export const DynamicIsland = (() => {
  let _expanded = false;
  let _timerActive = false;
  let _timerSecs = 0;
  let _timerMax = 0;
  let _setCompleteTimeout = null;

  // Dragging state
  let _isDragging = false;
  let _startX = 0;
  let _startY = 0;
  let _currentX = 0;
  let _currentY = 0;

  // DOM elements cache
  let _wrap = null;
  let _island = null;
  let _dot = null;
  let _timeEl = null;
  let _setsEl = null;
  let _nameEl = null;
  let _sublabelEl = null;
  let _progressFill = null;
  let _timerDisp = null;
  let _timerProg = null;

  function init() {
    if (document.getElementById('dynamic-island-wrap')) return;

    _wrap = document.createElement('div');
    _wrap.id = 'dynamic-island-wrap';
    _wrap.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none; z-index: 9999; overflow: hidden;
    `;
    
    _wrap.innerHTML = `
      <div class="island" id="dynamic-island" role="status" aria-live="polite" style="pointer-events: auto;">
        <div class="island-dot online" id="di-dot"></div>
        <div class="island-time" id="di-time">00:00</div>
        
        <div class="island-expanded-content">
          <div class="island-status-line">
            <span class="island-sets-badge" id="di-sets">0/0</span>
            <span class="island-ex-name" id="di-name">Exercise</span>
          </div>
          <div class="island-sublabel" id="di-sublabel">Week 1 · PUSH · next: Bench</div>
        </div>

        <div class="island-timer-display" id="di-timer-display"></div>
        <div class="island-timer-progress" id="di-timer-progress"></div>
        <div class="island-progress-track">
          <div class="island-progress-fill" id="di-progress-fill"></div>
        </div>
      </div>
    `;

    const appEl = document.getElementById('app') || document.body;
    appEl.appendChild(_wrap);

    // Cache elements
    _island = document.getElementById('dynamic-island');
    _dot = document.getElementById('di-dot');
    _timeEl = document.getElementById('di-time');
    _setsEl = document.getElementById('di-sets');
    _nameEl = document.getElementById('di-name');
    _sublabelEl = document.getElementById('di-sublabel');
    _progressFill = document.getElementById('di-progress-fill');
    _timerDisp = document.getElementById('di-timer-display');
    _timerProg = document.getElementById('di-timer-progress');

    // Drag events
    _island?.addEventListener('pointerdown', _onDragStart);
    window.addEventListener('pointermove', _onDragMove);
    window.addEventListener('pointerup', _onDragEnd);
    window.addEventListener('pointercancel', _onDragEnd);

    // Expand toggle (only if not dragged significantly)
    _island?.addEventListener('click', (e) => {
      if (Math.abs(_currentX) > 5 || Math.abs(_currentY) > 5) return;
      toggleExpand();
    });

    _updateNetworkStatus();
    window.addEventListener('online', _updateNetworkStatus);
    window.addEventListener('offline', _updateNetworkStatus);
  }

  function show() {
    if (!_wrap) init();
    _wrap.style.display = 'block';
    _wrap.classList.add('visible');
    update();
  }

  function hide() {
    if (!_wrap) return;
    _wrap.classList.remove('visible');
    _expanded = false;
    _island?.classList.remove('expanded');
    _island?.classList.remove('timer-mode');
    _currentX = 0;
    _currentY = 0;
    if (_island) _island.style.transform = '';
    _wrap.style.display = 'none';
  }

  function update() {
    if (!State.plan || !State.plan.length || !_wrap || !_wrap.classList.contains('visible')) return;

    const ru = (localStorage.getItem('ap-settings-lang') === 'ru'); // Safe check

    // Time (emphasized in compact)
    if (_timeEl) _timeEl.textContent = Timer.fmt(Timer.seconds());

    // Current Exercise
    let activeIdx = State.plan.findIndex(ex => ex.sets.some(s => !s.done));
    if (activeIdx === -1) activeIdx = State.plan.length - 1;
    const currentEx = State.plan[activeIdx];
    if (_nameEl) _nameEl.textContent = currentEx ? currentEx.name : '';

    // Sets Progress
    let done = 0, total = 0;
    State.plan.forEach(ex => {
      ex.sets.forEach(s => {
        total++;
        if (s.done) done++;
      });
    });
    if (_setsEl) {
      _setsEl.textContent = total ? `${done}/${total}` : '';
      _setsEl.style.color = _getSetsColor(done, total);
    }

    // Sublabel (Week + Day + Next)
    const nextEx = State.plan[activeIdx + 1];
    const status = nextEx ? `${ru ? 'далее' : 'next'}: ${nextEx.name}` : (ru ? 'готово!' : 'complete!');
    if (_sublabelEl) {
      _sublabelEl.textContent = `W${getWeekMode()} · ${String(State.type).toUpperCase()} · ${status}`;
    }

    // Progress bar
    if (_progressFill) {
      const pct = total ? (done / total) * 100 : 0;
      _progressFill.style.width = `${pct}%`;
      const colors = { push: 'var(--c-accent)', pull: 'var(--c-purple)', legs: 'var(--c-blue)' };
      _progressFill.style.background = colors[State.type] || 'var(--c-accent)';
    }

    _updateNetworkStatus();
  }

  // Timer mode (Rest Timer)
  function setTimer(secs, max) {
    if (!_wrap) init();
    _timerActive = true;
    _timerSecs = secs;
    _timerMax = max;
    _island?.classList.add('timer-mode');
    _renderTimer();
  }

  function stopTimer() {
    _timerActive = false;
    _island?.classList.remove('timer-mode');
    _renderTimer();
  }

  function pulseSetComplete() {
    if (!_island) return;
    clearTimeout(_setCompleteTimeout);
    _island.classList.add('set-complete');
    _setCompleteTimeout = setTimeout(() => {
      _island?.classList.remove('set-complete');
    }, 2000);
  }

  function toggleExpand() {
    _expanded = !_expanded;
    _island?.classList.toggle('expanded', _expanded);
  }

  /* ── Internal Helpers ── */

  function _onDragStart(e) {
    _isDragging = true;
    _startX = e.clientX - _currentX;
    _startY = e.clientY - _currentY;
    _island?.style.setProperty('transition', 'none');
    _island?.setPointerCapture(e.pointerId);
  }

  function _onDragMove(e) {
    if (!_isDragging) return;
    _currentX = e.clientX - _startX;
    _currentY = e.clientY - _startY;
    
    // Boundary check (keep on screen)
    const bounds = _island.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    if (bounds.left + _currentX < 0) _currentX = -bounds.left;
    if (bounds.right + _currentX > winW) _currentX = winW - bounds.right;
    
    if (_island) {
      _island.style.transform = `translate(${_currentX}px, ${_currentY}px)`;
    }
  }

  function _onDragEnd(e) {
    if (!_isDragging) return;
    _isDragging = false;
    _island?.style.setProperty('transition', 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)');
  }

  function _renderTimer() {
    if (!_timerDisp || !_timerProg) return;
    if (!_timerActive) {
      _timerDisp.textContent = '';
      _timerProg.style.width = '0%';
      return;
    }
    _timerDisp.textContent = Timer.fmt(_timerSecs);
    const pct = _timerMax ? (_timerSecs / _timerMax) * 100 : 0;
    _timerProg.style.width = `${pct}%`;
  }

  function _updateNetworkStatus() {
    if (!_dot) return;
    const online = navigator.onLine;
    _dot.className = `island-dot ${online ? 'online' : 'offline'}`;
  }

  function _getSetsColor(done, total) {
    if (!total) return 'var(--c-text-3)';
    const pct = done / total;
    if (pct >= 1) return 'var(--c-accent)';
    if (pct > 0.5) return 'var(--c-text-1)';
    return 'var(--c-text-3)';
  }

  return { init, show, hide, update, setTimer, stopTimer, pulseSetComplete, toggleExpand };
})();

// @ts-ignore
window.DynamicIsland = DynamicIsland;
