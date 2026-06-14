// @ts-check
/* ════════════════════════════════════════════════════════
   rest-timer.js — Per-set rest countdown.
   Surface lives in the Dynamic Island (in-frame HUD) + Document
   PiP when the browser is minimized. No standalone fixed modal.
   ════════════════════════════════════════════════════════ */

import { PiP } from './features/pip.js';
import { isRu } from './locale.store.js';
import { haptic } from './shared/utils.js';

export const RestTimer = (() => {
  let _end = 0;
  let _total = 0;
  let _raf = null;

  function start(_exName, _setLabel, duration) {
    _total = duration;
    _end = Date.now() + duration * 1000;
    _tick();

    // Proactively request notification permission on first rest
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function _tick() {
    const rem = Math.max(0, Math.ceil((_end - Date.now()) / 1000));

    // Primary surface: Dynamic Island rest HUD (constrained to the app frame)
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.setRestProgress(rem, _total);

    // Document/video PiP mirror — only visible when the browser is minimized
    const m = Math.floor(rem / 60).toString().padStart(2, '0');
    const s = (rem % 60).toString().padStart(2, '0');
    PiP.drawFrame({
      time: `${m}:${s}`,
      name: 'RESTING...',
      bpm: 85 + Math.floor(Math.random() * 15) // Slightly elevated HR during rest
    });

    if (rem <= 0) {
      _onDone();
      return;
    }
    _raf = requestAnimationFrame(_tick);
  }

  function stop() {
    cancelAnimationFrame(_raf);
    _raf = null;
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.stopTimer();
  }

  function addTime(secs) {
    _end += secs * 1000;
    _total += secs;
  }

  function tapSkip() {
    stop();
  }

  function _onDone() {
    stop();
    haptic([0, 80, 40, 80]);
    _triggerNotification();
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
