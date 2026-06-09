// @ts-check
import { State, getWeekMode } from '../workout.store.js';
import { Timer } from '../timer.js';
import { RestTimer } from '../rest-timer.js';
import { Spring } from './spring.js';
import { PiP } from '../features/pip.js';

/**
 * dynamic-island.js — Interactive session overlay (PIP)
 * Shows: Timer (Total Session Time ONLY), Sets done/total, Current exercise
 * Interactions: Draggable, Tap to expand, Long-press for Settings, Set complete pulse
 */

export const DynamicIsland = (() => {
  let _expanded = false;
  let _timerActive = false;
  let _timerSecs = 0;
  let _timerMax = 0;
  let _setCompleteTimeout = null;

  // Dragging & Long-press state
  let _isDragging = false;
  let _movedPastThreshold = false;
  let _startX = 0;
  let _startY = 0;
  let _currentX = 0;
  let _currentY = 0;
  let _longPressTimer = null;
  let _isLongPress = false;

  // DOM elements cache
  let _wrap = null;
  let _island = null;
  let _dot = null;
  let _timeEl = null;
  let _setsEl = null;
  let _nameEl = null;
  let _sublabelEl = null;
  let _progressFill = null;
  let _timerProg = null;

  // Animation tracking
  const _anims = {
    y: null,
    scale: null,
    dot: null,
    drag: null
  };
  let _animY = -100;
  let _animScale = 1;

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
          
          <div class="island-actions">
            <button class="island-action-btn skip" title="Skip Exercise" onclick="window.Workout?._focusNext()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
            <button class="island-action-btn plus" title="+30s Rest" onclick="window.RestTimer?.addTime(30)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>30s</span>
            </button>
          </div>
        </div>

        <!-- Timer progress line (for Rest intervals) -->
        <div class="island-timer-progress" id="di-timer-progress"></div>
        
        <!-- Global Workout Progress (Bottom strip) -->
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
    _timerProg = document.getElementById('di-timer-progress');

    // Set initial transform
    _applyTransform();

    // Drag & Long-press events
    _island?.addEventListener('pointerdown', _onPointerDown);
    window.addEventListener('pointermove', _onPointerMove);
    window.addEventListener('pointerup', _onPointerUp);
    window.addEventListener('pointercancel', _onPointerUp);

    // Expand toggle (only if not long-pressed or dragged)
    _island?.addEventListener('click', (e) => {
      if (_isLongPress || _movedPastThreshold) return;
      toggleExpand();
    });

    _updateNetworkStatus();
    window.addEventListener('online', _updateNetworkStatus);
    window.addEventListener('offline', _updateNetworkStatus);

    // Initialize PiP canvas
    PiP.init();
  }

  function _applyTransform() {
    if (!_island) return;
    // We use translateX(-50%) because the element is left:50% in CSS
    // animY is the entry/exit offset, currentX/Y are dragging offsets
    _island.style.transform = `translate(calc(-50% + ${_currentX}px), ${_animY + _currentY}px) scale(${_animScale})`;
  }

  function show() {
    if (!_wrap) init();
    _wrap.style.display = 'block';
    _wrap.classList.add('visible');

    // Logic Fix: Focus on Island by blurring the Status Bar
    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
      statusBar.classList.add('status-bar-focused');
      // Clicking the blurred header clears the focus effect
      statusBar.onclick = () => statusBar.classList.remove('status-bar-focused');
    }
    
    // Animate entry
    if (_island) {
      _anims.y?.stop();
      _anims.y = Spring.animate({
        from: _animY,
        to: 0,
        stiffness: 150,
        damping: 15,
        onUpdate: (v) => { 
          _animY = v;
          _applyTransform();
        }
      });
    }
    update();
  }

  function hide() {
    if (!_wrap) return;
    _wrap.classList.remove('visible');
    _expanded = false;
    _island?.classList.remove('expanded');
    _island?.classList.remove('timer-mode');
    
    const statusBar = document.getElementById('status-bar');
    statusBar?.classList.remove('status-bar-focused');

    // Animate exit
    if (_island) {
       _anims.y?.stop();
       _anims.y = Spring.animate({
        from: _animY,
        to: -100,
        stiffness: 200,
        damping: 20,
        onUpdate: (v) => { 
          _animY = v;
          _applyTransform();
        },
        onComplete: () => { 
          _wrap.style.display = 'none'; 
          _currentX = 0;
          _currentY = 0;
          _animY = -100;
        }
      });
    } else {
      _wrap.style.display = 'none';
    }
  }

  function update() {
    if (!State.plan || !State.plan.length || !_wrap || !_wrap.classList.contains('visible')) return;

    const ru = (localStorage.getItem('ap-settings-lang') === 'ru');

    // Time (Total Session Time ONLY)
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

    // Sublabel
    const nextEx = State.plan[activeIdx + 1];
    const status = nextEx ? `${ru ? 'далее' : 'next'}: ${nextEx.name}` : (ru ? 'готово!' : 'complete!');
    if (_sublabelEl) {
      _sublabelEl.textContent = `W${getWeekMode()} · ${String(State.type).toUpperCase()} · ${status}`;
    }

    // Progress bar (Total workout progress)
    if (_progressFill) {
      const pct = total ? (done / total) * 100 : 0;
      _progressFill.style.width = `${pct}%`;
      const colors = { push: 'var(--c-accent)', pull: 'var(--c-purple)', legs: 'var(--c-blue)' };
      _progressFill.style.background = colors[State.type] || 'var(--c-accent)';
    }

    _updateNetworkStatus();

    // Push state to PiP Canvas (Elite Standard: include next exercise)
    PiP.drawFrame({
      time: _timeEl?.textContent || '00:00',
      name: currentEx ? currentEx.name : 'Workout',
      sets: total ? `${done}/${total}` : '',
      nextName: nextEx ? nextEx.name : '',
      bpm: 72 + Math.floor(Math.random() * 10) // Mock BPM for Elite visualization
    });
  }

  // Rest Timer progress line
  function setRestProgress(secs, max) {
    if (!_wrap) init();
    _timerActive = true;
    _timerSecs = secs;
    _timerMax = max;
    _island?.classList.add('timer-mode');
    _renderRestProgress();
  }

  function stopTimer() {
    _timerActive = false;
    _island?.classList.remove('timer-mode');
    _renderRestProgress();
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
    
    // Subtle spring scale pop on expand
    _anims.scale?.stop();
    _anims.scale = Spring.animate({
      from: _expanded ? 0.95 : 1.05,
      to: 1,
      stiffness: 300,
      damping: 15,
      onUpdate: (v) => { 
        _animScale = v;
        _applyTransform();
      }
    });
  }

  /* ── Internal Helpers ── */

  function _onPointerDown(e) {
    _isDragging = true;
    _isLongPress = false;
    _startX = e.clientX - _currentX;
    _startY = e.clientY - _currentY;
    _island?.style.setProperty('transition', 'none');
    _island?.setPointerCapture(e.pointerId);

    // Start long-press timer
    clearTimeout(_longPressTimer);
    _longPressTimer = setTimeout(() => {
      if (!_movedPastThreshold) {
        _isLongPress = true;
        _onLongPress();
      }
    }, 450);
  }

  function _onPointerMove(e) {
    if (!_isDragging) return;
    
    if (!_movedPastThreshold) {
      const dx = e.clientX - (_startX + _currentX);
      const dy = e.clientY - (_startY + _currentY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 6) {
        _movedPastThreshold = true;
        clearTimeout(_longPressTimer);
      } else {
        return;
      }
    }

    _currentX = e.clientX - _startX;
    _currentY = e.clientY - _startY;
    
    // Boundary checks to keep island within viewport
    const appEl = document.getElementById('app') || document.body;
    const appRect = appEl.getBoundingClientRect();
    const halfW = (_island?.offsetWidth || 220) / 2;
    
    const minX = -appRect.width / 2 + halfW + 10;
    const maxX = appRect.width / 2 - halfW - 10;
    const minY = -10; // Allow slight pull above
    const maxY = appRect.height - 100;

    _currentX = Math.max(minX, Math.min(maxX, _currentX));
    _currentY = Math.max(minY, Math.min(maxY, _currentY));
    
    _applyTransform();
  }

  function _onPointerUp(e) {
    if (!_isDragging) return;
    _isDragging = false;
    clearTimeout(_longPressTimer);
    
    // Snappy return to bounds if we let go
    _anims.drag?.stop();
    _anims.drag = Spring.animate({
      from: 0,
      to: 0, 
      stiffness: 200,
      damping: 20,
      onUpdate: (v) => { /* snap logic could go here */ }
    });

    _island?.style.setProperty('transition', 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)');
    setTimeout(() => { _movedPastThreshold = false; }, 50);
  }

  function _onLongPress() {
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    // Navigate to timer settings
    window.location.hash = 'timer-settings';
    window.Toast?.show('Timer Settings', 'info');
  }

  function _renderRestProgress() {
    if (!_timerProg) return;
    if (!_timerActive) {
      _timerProg.style.width = '0%';
      return;
    }
    const pct = _timerMax ? (_timerSecs / _timerMax) * 100 : 0;
    _timerProg.style.width = `${pct}%`;
  }

  function _updateNetworkStatus() {
    if (!_dot) return;
    const online = navigator.onLine;
    const wasOffline = _dot.classList.contains('offline');
    
    _dot.className = `island-dot ${online ? 'online' : 'offline'}`;
    
    // Pulse animation on reconnect
    if (online && wasOffline) {
       _anims.dot?.stop();
       _anims.dot = Spring.animate({
        from: 0.5,
        to: 1,
        stiffness: 400,
        damping: 10,
        onUpdate: (v) => { _dot.style.scale = String(v); }
      });
    }
  }

  function _getSetsColor(done, total) {
    if (!total) return 'var(--c-text-3)';
    const pct = done / total;
    if (pct >= 1) return 'var(--c-accent)';
    if (pct > 0.5) return 'var(--c-text-1)';
    return 'var(--c-text-3)';
  }

  function triggerPiP() {
    PiP.requestPiP();
  }

  return { init, show, hide, update, setRestProgress, stopTimer, pulseSetComplete, toggleExpand, triggerPiP };
})();

// @ts-ignore
window.DynamicIsland = DynamicIsland;
