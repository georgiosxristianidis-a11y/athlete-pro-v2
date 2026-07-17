// @ts-check
import { State, BLOCK_LABEL } from '../workout.store.js';
import { renderIslandTracker } from './island-tracker.js';
import { Timer } from '../timer.js';
import { RestTimer } from '../rest-timer.js';
import { PiP } from '../features/pip.js';
import { haptic } from './utils.js';
import { isRu } from '../locale.store.js';
import { getPrivacyMode } from '../privacy.store.js';
import { deriveDotState } from './sync-dot.js';
import { on } from '../events.js';
import { flag } from '../flags.js';
import { getIslandProfile } from '../island-profile.store.js';

/** Active island layout profile. Flag off → always the proven Apple path. */
function activeProfile() {
  return flag('island-profiles') ? getIslandProfile() : 'apple';
}

// Event-delegation handlers (CSP: replaced inline onclick). stopPropagation so a
// tap on an island control doesn't also bubble to the island expand-toggle.
// Focus Mode is quarantined (f82bc25: ships no CSS, raw DOM spills outside the
// app column) — _focusNext() was its last live trigger, reproduced in the
// field 2026-07-08 via this button. Scroll-jump to the next open exercise
// instead: same intent, no overlay.
on('island:skipExercise', (el, e) => { e.stopPropagation(); window.Workout?.jumpToNextExercise?.(); });
on('island:addRest',      (el, e) => { e.stopPropagation(); RestTimer?.addTime(+el.dataset.amt); });
on('island:pip',          (el, e) => { e.stopPropagation(); window.DynamicIsland?.triggerPiP(); });
on('island:skipRest',     (el, e) => { e.stopPropagation(); RestTimer?.tapSkip(); });
on('island:finish',        (el, e) => { e.stopPropagation(); DynamicIsland?._tapFinish(); });

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

  // Finish double-confirm state
  let _finishArmed = false;
  let _finishTimer = null;

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
  let _minCompactEl = null;
  let _minTrackerEl = null;
  let _minLabelEl = null;
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

        <!-- Minimal-DHL compact strip (ISL-PROFILE): DHL 4-dots + CAMERA N/M.
             Replaces the name·sets readout when the 'minimal' profile is active
             and the pill is collapsed. Non-interactive: a tap expands the card. -->
        <div class="island-minimal-compact" id="di-min-compact">
          <div class="island-tracker" id="di-min-tracker"></div>
          <span class="island-min-label" id="di-min-label"></span>
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

        <!-- Finish HUD — appears when the LAST set closes the whole session.
             No rest is armed on the final set; instead this double-confirm
             Finish button replaces the meaningless rest controls. One tap arms
             (darkens + "Confirm?"); a second tap within 3s runs completeSession. -->
        <div class="island-finish" id="di-finish">
          <button class="island-finish-btn" id="di-finish-btn" data-action="island:finish" title="Finish workout" aria-label="Finish workout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>
            <span id="di-finish-label">Finish</span>
          </button>
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
    _minCompactEl = document.getElementById('di-min-compact');
    _minTrackerEl = document.getElementById('di-min-tracker');
    _minLabelEl = document.getElementById('di-min-label');
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
    _island?.addEventListener('pointerleave', () => {
      clearTimeout(_longPressTimer);
    });

    // Single tap toggles the full card (Apple 2-state). Idle pill is not an
    // expand target; long-press opens settings in every mode, so ignore it here.
    _island?.addEventListener('click', (e) => {
      // A control was tapped (skip/rest/PiP/finish) — run only its action, never
      // expand. This listener sits on _island and fires before the document
      // delegation, so its stopPropagation can't reach us; filter by target.
      if (e.target.closest('[data-action]')) return;
      if (_island?.classList.contains('mode-idle')) return;
      // Finish HUD owns the whole pill — its button handles the tap; never expand.
      if (_island?.classList.contains('finish-mode')) return;
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
    _disarmFinish();
    _island?.classList.remove('expanded');
    _island?.classList.remove('timer-mode');
    _island?.classList.remove('finish-mode');
    _island?.classList.add('mode-idle');
  }

  function update() {
    if (!_island) return;

    // ISL-PROFILE: tag the pill with the active layout profile so CSS can swap
    // the collapsed content (Minimal-DHL strip ↔ Apple name·sets readout).
    const prof = activeProfile();
    _island.classList.toggle('profile-minimal', prof === 'minimal');
    _island.classList.toggle('profile-apple', prof !== 'minimal');

    // IDLE MODE: If no workout, act as the ONLINE button
    if (!State.plan || !State.plan.length) {
      _expanded = false;
      _island?.classList.remove('timer-mode', 'expanded');
      _island?.classList.add('mode-idle');
      
      document.getElementById('status-bar')?.classList.remove('workout-active');

      // Idle dot reflects the real privacy/sync state (deriveDotState) — the old
      // hardcoded 'online' class had no CSS rule, so the idle circle rendered
      // empty (transparent). airgap → grey, synced → green, offline → red.
      _updateNetworkStatus();
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

    // Safety: if we're showing the Finish HUD but the session is no longer
    // complete (e.g. a live exercise was added after the last set), drop it.
    if (_island?.classList.contains('finish-mode') && (total === 0 || done !== total)) {
      _disarmFinish();
      _island.classList.remove('finish-mode');
    }

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

    // Sublabel — NEXT only. Week/type/chamber duplicated the workout screen
    // header underneath (field feedback 2026-07-08: info overload in the
    // expanded island); the screen owns context, the island owns "what's next".
    const nextEx = State.plan[activeIdx + 1];
    const status = nextEx ? `${ru ? 'далее' : 'next'}: ${nextEx.name}` : (ru ? 'готово!' : 'complete!');
    if (_sublabelEl) {
      _sublabelEl.textContent = status;
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
      // Dots only — chamber label + set count duplicated the on-screen block
      // header (field feedback 2026-07-08: expanded island too noisy).
      renderIslandTracker(_trackerEl, {
        current: Math.min(curChamber, 3),
        sessionType: State.type,
        // Cool-Steel law (реш. №4, governing over DHL реш. №3): the tracker is
        // navigation, so it is chrome in EVERY profile — PPL lives only on
        // data (progress bar) and celebration (set-pulse).
        chrome: true,
        expanded: _expanded,
      });

      // Minimal-DHL collapsed strip: same DHL dots + "CAMERA N/M" navigation
      // context. Rendered always (cheap); CSS shows it only for profile-minimal
      // while collapsed. Cap the chamber count at 4 to match the 4-marker track.
      if (prof === 'minimal' && _minTrackerEl && _minLabelEl) {
        renderIslandTracker(_minTrackerEl, {
          current: Math.min(curChamber, 3),
          sessionType: State.type,
          chrome: true,
          expanded: false,
        });
        // The dots give position; the label names the current phase (POWER /
        // SHAPE / ARMS / CORE) — the actionable "what am I training now", not a
        // count (the dots already carry the count).
        _minLabelEl.textContent = BLOCK_LABEL[curBlock] || '';
      }
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

  /**
   * Session-complete state: the final set closed every block, so there is no
   * rest to run. Swap the pill into a single Finish button (double-confirm)
   * instead of leaving the meaningless +time / skip-rest HUD floating.
   */
  function showFinishReady() {
    if (!_island) init();
    _timerActive = false;
    _expanded = false;
    _disarmFinish();
    _island?.classList.remove('timer-mode', 'expanded', 'mode-idle');
    _island?.classList.add('finish-mode');
  }

  /** Leave finish state (e.g. the user un-checked the last set) → normal readout. */
  function clearFinishReady() {
    _disarmFinish();
    if (!_island) return;
    _island.classList.remove('finish-mode');
    update();
  }

  /**
   * Double-confirm Finish. 1st tap arms (darken + "Confirm?" + haptic) and opens
   * a 3s window; 2nd tap inside it commits → completeSession() (summary modal).
   * No window.confirm — that gets blocked in the PWA/iframe shell.
   */
  function _tapFinish() {
    if (!_finishArmed) {
      _finishArmed = true;
      haptic(20);
      _island?.classList.add('finish-armed');
      const lbl = document.getElementById('di-finish-label');
      if (lbl) lbl.textContent = isRu() ? 'Ещё раз' : 'Confirm?';
      clearTimeout(_finishTimer);
      _finishTimer = setTimeout(_disarmFinish, 3000);
      return;
    }
    _disarmFinish();
    haptic([0, 40, 30, 40]);
    window.Workout?.completeSession();
  }

  function _disarmFinish() {
    clearTimeout(_finishTimer);
    _finishTimer = null;
    _finishArmed = false;
    _island?.classList.remove('finish-armed');
    const lbl = document.getElementById('di-finish-label');
    if (lbl) lbl.textContent = isRu() ? 'Финиш' : 'Finish';
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
    _isLongPress = false;

    clearTimeout(_longPressTimer);
    _longPressTimer = setTimeout(() => {
      _isLongPress = true;
      _onLongPress();
    }, 450);
  }

  function _onPointerUp(e) {
    clearTimeout(_longPressTimer);
  }

  function _onLongPress() {
    haptic([30, 50, 30]);
    window.Nav?.go('s-island-settings');
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

  return { init, show, hide, update, setRestProgress, stopTimer, pulseSetComplete, toggleExpand, triggerPiP, showFinishReady, clearFinishReady, _tapFinish };
})();

window.DynamicIsland = DynamicIsland;
