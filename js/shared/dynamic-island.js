// @ts-check
import { State, getWeekMode, BLOCK_LABEL } from '../workout.store.js';
import { renderIslandTracker } from './island-tracker.js';
import { Timer } from '../timer.js';
import { RestTimer } from '../rest-timer.js';
import { PiP } from '../features/pip.js';
import { haptic } from './utils.js';
import { isRu } from '../locale.store.js';
import { getPrivacyMode } from '../privacy.store.js';
import { deriveDotState } from './sync-dot.js';
import { on } from '../events.js';

// Event-delegation handlers (CSP: replaced inline onclick). stopPropagation so a
// tap on an island control doesn't also bubble to the island expand-toggle.
on('island:skipExercise', (el, e) => { e.stopPropagation(); window.Workout?._focusNext(); });
on('island:addRest',      (el, e) => { e.stopPropagation(); RestTimer?.addTime(+el.dataset.amt); });
on('island:pip',          (el, e) => { e.stopPropagation(); window.DynamicIsland?.triggerPiP(); });
on('island:skipRest',     (el, e) => { e.stopPropagation(); RestTimer?.tapSkip(); });

/**
 * dynamic-island.js — Interactive session overlay (PIP)
 * Shows: Timer (Total Session Time ONLY), Sets done/total, Current exercise
 * Interactions: Tap to expand, Long-press for Settings, Set complete pulse
 */

export const DynamicIsland = (() => {
  // Apple-style 2-state model: COMPACT (content driven by context) ↔ EXPANDED.
  // No manual size-cycle — the pill hugs whatever the current context needs
  // (idle dot / active readout / rest HUD); one tap toggles the full card.
  let _expanded = false;
  let _timerActive = false;
  let _timerSecs = 0;
  let _timerMax = 0;
  let _setCompleteTimeout = null;
  let _syncStatus = 'idle'; // mirrors SyncManager._status via 'ap-sync-status'

  // Long-press state
  let _longPressTimer = null;
  let _isLongPress = false;

  // DOM elements cache
  let _container = null;
  let _island = null;
  let _dot = null;
  let _timeEl = null;
  let _setsEl = null;
  let _setsCollapsedEl = null;
  let _nameEl = null;
  let _nameCollapsedEl = null;
  let _sublabelEl = null;
  let _trackerEl = null;
  let _progressFill = null;
  let _timerProg = null;

  function init() {
    if (document.getElementById('dynamic-island')) return;

    _container = document.getElementById('status-island-container');
    if (!_container) return;
    
    _container.innerHTML = `
      <div class="island" id="dynamic-island" role="status" aria-live="polite" style="pointer-events: auto;">
        <div class="island-dot" id="di-dot"></div>
        <div class="island-readout">
          <div class="island-time" id="di-time">00:00</div>
          <div class="island-name-collapsed" id="di-name-collapsed"></div>
          <div class="island-sets-collapsed" id="di-sets-collapsed"></div>
        </div>

        <div class="island-expanded-content">
          <div class="island-status-line">
            <span class="island-sets-badge" id="di-sets">0/0</span>
            <span class="island-ex-name" id="di-name">Exercise</span>
          </div>
          <!-- DHL 4-chamber journey tracker (Cool Steel) -->
          <div class="island-tracker" id="di-tracker"></div>

          <div class="island-sublabel" id="di-sublabel">Week 1 · PUSH · next: Bench</div>

          <div class="island-actions">
            <button class="island-action-btn skip" title="Skip Exercise" data-action="island:skipExercise">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
            <button class="island-action-btn plus" title="+30s Rest" data-action="island:addRest" data-amt="30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>30s</span>
            </button>
            <button class="island-action-btn" title="Picture in Picture" data-action="island:pip" style="margin-left:auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/></svg>
              <span>PiP</span>
            </button>
          </div>
        </div>

        <!-- Rest HUD (in-frame replacement for the old standalone rest modal).
             No numeric readout: the depleting bar + colour escalation (amber ≤10s,
             blue done) carry "how much is left". Two SVG icon buttons only. -->
        <div class="island-rest" id="di-rest">
          <div class="island-rest-actions">
            <button class="island-rest-btn" id="di-rest-plus" title="+15s Rest" aria-label="Add 15 seconds" data-action="island:addRest" data-amt="15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="island-rest-btn primary" id="di-rest-skip" title="Skip rest" aria-label="Skip rest" data-action="island:skipRest">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
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

    // Cache elements
    _island = document.getElementById('dynamic-island');
    _dot = document.getElementById('di-dot');
    _timeEl = document.getElementById('di-time');
    _setsEl = document.getElementById('di-sets');
    _setsCollapsedEl = document.getElementById('di-sets-collapsed');
    _nameEl = document.getElementById('di-name');
    _nameCollapsedEl = document.getElementById('di-name-collapsed');
    _sublabelEl = document.getElementById('di-sublabel');
    _trackerEl = document.getElementById('di-tracker');
    // Tap a chamber marker → scroll its block into view in the workout list.
    if (_trackerEl && !_trackerEl.__jumpWired) {
      _trackerEl.__jumpWired = true;
      _trackerEl.addEventListener('chamber-jump', (e) => {
        const idx = e.detail?.idx;
        if (idx == null) return;
        document.querySelectorAll('.workout-block-header')[idx]
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    _progressFill = document.getElementById('di-progress-fill');
    _timerProg = document.getElementById('di-timer-progress');

    // Long-press events (no drag)
    _island?.addEventListener('pointerdown', _onPointerDown);
    window.addEventListener('pointerup', _onPointerUp);
    window.addEventListener('pointercancel', _onPointerUp);
    _island?.addEventListener('pointerleave', (e) => {
      if (_island?.classList.contains('mode-idle')) window.PrivacyRapid?.cancelLongPress();
    });

    _island?.addEventListener('dblclick', (e) => {
      window.PrivacyRapid?.toggle();
    });

    // Single tap toggles the full card (Apple 2-state). Idle pill = privacy
    // button, not an expand target; long-press opens settings, so ignore it here.
    _island?.addEventListener('click', (e) => {
      if (_island?.classList.contains('mode-idle')) return;
      if (_isLongPress) return;
      toggleExpand();
    });

    _updateNetworkStatus();
    window.addEventListener('online', _updateNetworkStatus);
    window.addEventListener('offline', _updateNetworkStatus);
    // SyncManager broadcasts its state on 'ap-sync-status' (detail.status).
    // analytics.view fires the same name as a refresh ping with no status —
    // guard on the string so those are ignored.
    window.addEventListener('ap-sync-status', (e) => {
      const s = e && e.detail && e.detail.status;
      if (typeof s === 'string') { _syncStatus = s; _updateNetworkStatus(); }
    });
    window.addEventListener('ap-privacy-mode', _updateNetworkStatus);

    // Initialize PiP canvas
    PiP.init();
    
    // Initial render (will show idle state if no workout)
    update();
  }

  function show() {
    if (!_island) init();
    update();
  }

  function hide() {
    if (!_island) return;
    _expanded = false;
    _island?.classList.remove('expanded');
    _island?.classList.remove('timer-mode');
    _island?.classList.add('mode-idle');
  }

  function update() {
    if (!_island) return;

    // IDLE MODE: If no workout, act as the ONLINE button
    if (!State.plan || !State.plan.length) {
      _expanded = false;
      _island?.classList.remove('timer-mode', 'expanded');
      _island?.classList.add('mode-idle');
      
      document.getElementById('status-bar')?.classList.remove('workout-active');
      
      const dot = document.getElementById('di-dot');
      if (dot) dot.className = navigator.onLine ? 'island-dot online' : 'island-dot offline';
      return;
    }

    // During an active rest, RestTimer owns the island HUD + PiP. The session
    // readouts sit hidden behind the rest HUD and sets don't change mid-rest,
    // so skip the whole re-render — keeps the rest path conflict-free and cheap.
    if (_timerActive) { _updateNetworkStatus(); return; }

    // ACTIVE WORKOUT: leave idle. COMPACT-active hugs its content (dot · name ·
    // sets) via .island-readout; EXPANDED / rest HUD are class-driven. No size mode.
    _island?.classList.remove('mode-idle');
    document.getElementById('status-bar')?.classList.add('workout-active');

    const ru = isRu();

    // Sets Progress
    let done = 0, total = 0;
    State.plan.forEach(ex => {
      ex.sets.forEach(s => {
        total++;
        if (s.done) done++;
      });
    });

    // Time
    // Current Exercise
    let activeIdx = State.plan.findIndex(ex => ex.sets.some(s => !s.done));
    if (activeIdx === -1) activeIdx = State.plan.length - 1;
    const currentEx = State.plan[activeIdx];
    if (_nameEl) _nameEl.textContent = currentEx ? currentEx.name : '';

    // Per-exercise set progress — what the lifter tracks (e.g. 3/3), not the
    // whole-session count. The overall session % stays on the bottom progress bar.
    const exDone = currentEx ? currentEx.sets.filter(s => s.done).length : 0;
    const exTotal = currentEx ? currentEx.sets.length : 0;
    const setsLabel = exTotal ? `${exDone}/${exTotal}` : '';

    // COMPACT-active readout is a single row: dot · name · sets. The dot is a
    // left accent (absolute); the flex row carries name then the sets badge.
    // #di-time is unused in the collapsed row — the session clock lives in the
    // expanded card / PiP, not the pill.
    if (_timeEl) _timeEl.textContent = '';

    // Exercise name (clean — sets are NOT appended here; the badge owns them,
    // avoids the old "Bench - 2/3 … 2/3" double print).
    if (_nameCollapsedEl) {
      _nameCollapsedEl.textContent = currentEx ? currentEx.name : '';
    }
    if (_setsEl) {
      _setsEl.textContent = setsLabel;
      _setsEl.style.color = _getSetsColor(exDone, exTotal);
    }
    // Sets badge in the collapsed row (single source of "2/3").
    if (_setsCollapsedEl) {
      _setsCollapsedEl.textContent = setsLabel;
      _setsCollapsedEl.style.color = _getSetsColor(exDone, exTotal);
    }

    // Sublabel
    const nextEx = State.plan[activeIdx + 1];
    const status = nextEx ? `${ru ? 'далее' : 'next'}: ${nextEx.name}` : (ru ? 'готово!' : 'complete!');
    if (_sublabelEl) {
      _sublabelEl.textContent = `W${getWeekMode()} · ${String(State.type).toUpperCase()} · ${status}`;
    }

    // DHL 4-chamber journey tracker (Cool Steel). Chambers = ordered unique
    // blocks in the plan; current = the block the active exercise belongs to.
    if (_trackerEl) {
      const blocks = [];
      for (const ex of State.plan) {
        const b = ex.block || 'custom';
        if (!blocks.includes(b)) blocks.push(b);
      }
      const curBlock = currentEx?.block || 'custom';
      let curChamber = blocks.indexOf(curBlock);
      if (curChamber < 0) curChamber = 0;
      let chDone = 0, chTotal = 0;
      for (const ex of State.plan) {
        if ((ex.block || 'custom') === curBlock) {
          for (const s of ex.sets) { chTotal++; if (s.done) chDone++; }
        }
      }
      renderIslandTracker(_trackerEl, {
        current: Math.min(curChamber, 3),
        sessionType: State.type,
        progress: { done: chDone, total: chTotal },
        label: BLOCK_LABEL[curBlock] || '',
        expanded: _expanded,
      });
    }

    // Progress bar — PPL law via canonical aliases: push=green · pull=cyan · legs=purple
    if (_progressFill) {
      const pct = total ? (done / total) * 100 : 0;
      _progressFill.style.transform = `scaleX(${pct / 100})`;
      const colors = { push: 'var(--c-push)', pull: 'var(--c-pull)', legs: 'var(--c-legs)' };
      _progressFill.style.background = colors[State.type] || 'var(--c-accent)';
    }

    _updateNetworkStatus();

    // Push state to PiP Canvas — but NOT while a rest is running:
    // RestTimer owns the PiP frame during rest, so the 1 Hz session tick
    // must not overwrite the "RESTING…" frame (was flickering).
    if (!_timerActive) {
      PiP.drawFrame({
        time: Timer.fmt(Timer.seconds()),
        name: currentEx ? currentEx.name : 'Workout',
        sets: setsLabel,
        nextName: nextEx ? nextEx.name : ''
      });
    }
  }

  function setRestProgress(secs, max) {
    if (!_island) init();
    const starting = !_timerActive;
    // Re-arm the bar whenever the timeline isn't a clean 1s tick:
    // +time was pressed, or a background catch-up jump after the tab was hidden.
    const jump = _timerActive && (_timerSecs - secs) !== 1;
    _timerActive = true;
    _island?.classList.add('timer-mode');

    // No numeric readout by design — the depleting bar + colour escalation below
    // carry "how much rest is left". (Old #di-rest-time removed.)

    // Progress-bar colour escalation each second (class only — no layout)
    if (_timerProg) {
      _timerProg.classList.toggle('warning', secs <= 10 && secs > 0);
      _timerProg.classList.toggle('done', secs <= 0);
    }

    // Depletion is ONE GPU transition over the remaining seconds — buttery 60fps
    // on the compositor with zero JS per frame, re-armed only on start / jump.
    if (starting || jump) _armRestProgress(secs, max);

    _timerSecs = secs;
    _timerMax = max;
  }

  /** Drive the rest bar from its current fraction down to empty over `remaining`s (compositor). */
  function _armRestProgress(remaining, max) {
    if (!_timerProg) return;
    const startFrac = max > 0 ? Math.min(1, remaining / max) : 0;
    _timerProg.style.transition = 'none';
    _timerProg.style.transform = `scaleX(${startFrac})`;
    void _timerProg.offsetWidth;                          // commit the snap before animating
    _timerProg.style.transition = `transform ${Math.max(0.1, remaining)}s linear`;
    _timerProg.style.transform = 'scaleX(0)';
  }

  function stopTimer() {
    _timerActive = false;
    _island?.classList.remove('timer-mode');
    if (_timerProg) {
      _timerProg.style.transition = 'none';
      _timerProg.style.transform = 'scaleX(0)';
      _timerProg.classList.remove('warning', 'done');
    }
    update();   // refresh the session readouts now that the rest HUD is gone
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
    haptic(5);
    _expanded = !_expanded;
    _island?.classList.toggle('expanded', _expanded);
    // Expand/collapse morph is handled by the CSS width/height/border-radius
    // transition. Re-render so the tracker picks up its expanded/compact layout.
    update();
  }

  function _onPointerDown(e) {
    if (_island?.classList.contains('mode-idle')) {
      window.PrivacyRapid?.startLongPress(e);
      return;
    }
    _isLongPress = false;

    clearTimeout(_longPressTimer);
    _longPressTimer = setTimeout(() => {
      _isLongPress = true;
      _onLongPress();
    }, 450);
  }

  function _onPointerUp(e) {
    if (_island?.classList.contains('mode-idle')) {
      window.PrivacyRapid?.cancelLongPress();
    }

    clearTimeout(_longPressTimer);
  }

  function _onLongPress() {
    haptic([30, 50, 30]);
    window.location.hash = 'timer-settings';
  }

  function _updateNetworkStatus() {
    if (!_dot) return;
    const state = deriveDotState({
      mode: getPrivacyMode(),
      online: navigator.onLine,
      syncStatus: _syncStatus,
      cloudConfigured: typeof window !== 'undefined' && !!window.__cloudConfigured,
    });
    _dot.className = `island-dot ${state}`;
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

window.DynamicIsland = DynamicIsland;
