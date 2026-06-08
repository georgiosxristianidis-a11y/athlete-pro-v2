// @ts-check
/* ════════════════════════════════════════════════════════
   rest-timer.js — Per-set rest timer with bar + modal UI
   ════════════════════════════════════════════════════════ */

import { PiP } from './features/pip.js';

export const RestTimer = (() => {
  let _end = 0;
  let _total = 0;
  let _raf = null;

  function start(exName, setLabel, duration) {
    _total = duration;
    _end = Date.now() + duration * 1000;
    _showBar(duration);
    _showModal(exName, setLabel);
    _tick();
    
    // Proactively request notification permission on first rest
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function _tick() {
    const rem = Math.max(0, Math.ceil((_end - Date.now()) / 1000));
    _updateBar(rem);
    _updateModal(rem);
    // @ts-ignore
    if (window.DynamicIsland) window.DynamicIsland.setRestProgress(rem, _total);

    if (rem <= 0) {
      _onDone();
      return;
    }
    _raf = requestAnimationFrame(_tick);
  }

  function stop() {
    cancelAnimationFrame(_raf);
    _raf = null;
    _hideBar();
    _hideModal();
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
    _haptic(100);
    _triggerNotification();
  }

  async function _triggerNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const ru = (localStorage.getItem('ap-settings-lang') === 'ru');
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

  function _showBar(max) {
    if (document.getElementById('rest-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'rest-bar';
    bar.innerHTML = `
      <div class="rest-bar-fill" id="rest-bar-fill"></div>
      <div class="rest-bar-info">
        <span id="rest-bar-time"></span>
        <button class="rest-bar-plus" onclick="RestTimer.addTime(15)">+15s</button>
        <button class="rest-bar-skip" onclick="RestTimer.tapSkip()">Skip</button>
      </div>`;
    document.body.appendChild(bar);
  }

  function _updateBar(rem) {
    const bar = document.getElementById('rest-bar');
    const fill = document.getElementById('rest-bar-fill');
    const time = document.getElementById('rest-bar-time');
    if (!bar || !fill || !time) return;
    const pct = (rem / _total) * 100;
    fill.style.width = `${pct}%`;
    time.textContent = `Rest: ${rem}s`;
  }

  function _hideBar() {
    document.getElementById('rest-bar')?.remove();
  }

  function _showModal(ex, set) {
    if (document.getElementById('rest-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'rest-modal';
    modal.className = 'rest-overlay';
    modal.innerHTML = `
      <div class="rest-card">
        <div class="rest-card-ex">${ex}</div>
        <div class="rest-card-set">${set} complete</div>
        <div class="rest-card-timer" id="rest-modal-time"></div>
        <div class="rest-card-actions">
          <button class="rest-btn-sec" onclick="RestTimer.addTime(15)">+15s</button>
          <button class="rest-btn-primary" onclick="RestTimer.tapSkip()">Next Set</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));
  }

  function _updateModal(rem) {
    const el = document.getElementById('rest-modal-time');
    if (el) el.textContent = rem + 's';
  }

  function _hideModal() {
    const m = document.getElementById('rest-modal');
    if (m) {
      m.classList.remove('visible');
      setTimeout(() => m.remove(), 300);
    }
  }

  function _haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }

  return { start, stop, addTime, tapSkip };
})();
