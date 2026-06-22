// @ts-check
/* ════════════════════════════════════════════════════════
   rest-timer.js — Per-set rest countdown.
   Surface lives in the Dynamic Island (in-frame HUD) + Document
   PiP when the browser is minimized. No standalone fixed modal.

   Timing model (P0 fix): 1 Hz setInterval driven by an absolute
   _end timestamp — NOT requestAnimationFrame.
     · rAF pauses entirely when the tab is hidden → the old loop
       froze the countdown and never fired the rest-done alarm while
       the phone was put down between sets. setInterval keeps ticking
       (throttled, but alive) and the timestamp makes every render
       self-correcting after any throttling.
     · A belt-and-suspenders setTimeout fires the alarm near on-time
       if the page stays alive in the background; returning to the app
       (visibilitychange) re-evaluates immediately so the alarm never
       gets lost. Display repaints once per second, not 60×.
   ════════════════════════════════════════════════════════ */

import { PiP } from './features/pip.js';
import { isRu } from './locale.store.js';
import { haptic } from './shared/utils.js';

export const RestTimer = (() => {
  let _end = 0;          // absolute epoch-ms the rest ends
  let _total = 0;        // total seconds (for the progress ratio)
  let _interval = null;  // 1 Hz display ticker
  let _alarm = null;     // single fallback timeout aimed at _end
  let _done = false;     // guard: interval / alarm / visibility can race the finish

  function start(_exName, _setLabel, duration) {
    stop();                       // clear any prior rest cleanly
    _total = duration;
    _end = Date.now() + duration * 1000;
    _done = false;

    // Proactively request notification permission on first rest
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    _render();                                   // immediate paint
    _interval = setInterval(_render, 1000);      // 1 Hz — no rAF freeze, no 60fps churn
    _alarm = setTimeout(_finish, duration * 1000 + 250); // fires near on-time if page stays alive
    document.addEventListener('visibilitychange', _onVisible); // instant catch-up on return
  }

  function _render() {
    // Timestamp-based → correct even after setInterval was throttled while hidden
    const rem = Math.max(0, Math.ceil((_end - Date.now()) / 1000));

    // Primary surface: Dynamic Island rest HUD (green readout, warning/done escalation untouched)
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.setRestProgress(rem, _total);

    // Document/video PiP mirror — only visible when the browser is minimized
    const m = Math.floor(rem / 60).toString().padStart(2, '0');
    const s = (rem % 60).toString().padStart(2, '0');
    PiP.drawFrame({ time: `${m}:${s}`, name: isRu() ? 'ОТДЫХ...' : 'RESTING...' });

    if (rem <= 0) _finish();
  }

  function _onVisible() {
    // Returning to the app: recompute now so a countdown that froze
    // (or completed) while backgrounded corrects / fires immediately.
    if (document.visibilityState === 'visible') _render();
  }

  function stop() {
    clearInterval(_interval); _interval = null;
    clearTimeout(_alarm); _alarm = null;
    document.removeEventListener('visibilitychange', _onVisible);
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.stopTimer();
  }

  function addTime(secs) {
    _end += secs * 1000;
    _total += secs;
    if (_alarm) {
      clearTimeout(_alarm);
      _alarm = setTimeout(_finish, Math.max(0, _end - Date.now()) + 250);
    }
    _render();
  }

  function tapSkip() {
    stop();
  }

  function _finish() {
    if (_done) return;
    _done = true;
    stop();
    haptic([0, 80, 40, 80]);
    _triggerNotification().catch(() => {}); // floating promise: never let it reject globally
  }

  async function _triggerNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const ru = isRu();
    const title = ru ? 'Отдых завершен!' : 'Rest Complete';
    const body = ru ? 'Пора начинать следующий подход.' : 'Time to start your next set.';

    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'rest-alarm',
        renotify: true
      });
    }
  }

  return { start, stop, addTime, tapSkip };
})();
