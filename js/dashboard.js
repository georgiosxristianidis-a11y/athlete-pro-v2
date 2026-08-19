// @ts-check
/* ════════════════════════════════════════════════
   dashboard.js — Athlete Pro  |  Dashboard home screen
   ════════════════════════════════════════════════ */

import { DB, weeklyVolumeFrom, monthlyVolumeFrom, weeklyCountFrom, pplTonnageFrom } from './db.js';
import { generateSparkline, generateSparklineMulti } from './shared/sparkline.js';
import { getRecommendations } from './claude.store.js';
import { Spring } from './shared/spring.js';
import { esc, listenerGroup } from './shared/utils.js';
import { Toast } from './shell.js';
import { fmtVol, fmtDuration, fmtDate } from './shared/format.js';
import { renderPplGauge } from './shared/ppl-gauge.js';
import { on } from './events.js';
import { flag } from './flags.js';
import { t } from './locale.store.js';
import { initPandaVideo, togglePandaSound, PANDA_VIDEO_SRC, PANDA_POSTER_SRC } from './shared/panda-video.js';
import { attachMood, emitMood, entryGreeting } from './shared/panda-mood.js';

on('dash:directLaunch',  (el) => window.Dashboard.directLaunch(el.dataset.type));
on('dash:weeklySummary', () => showWeeklySummary());
on('dash:navStats',      () => window.Nav.go('s-stats'));
on('dash:closeMascot',   () => window.Dashboard.closeMascot());
on('dash:mascotSound',   (el, e) => {
  e.stopPropagation();
  const v = el.querySelector('video');
  if (!(v instanceof HTMLVideoElement)) return;
  window.haptic?.(10);
  const muted = togglePandaSound(v);
  el.querySelector('.empty-dash-mascot')?.classList.toggle('sound-on', !muted);
});

// Экраны прячутся через opacity, не display — IntersectionObserver в
// panda-video это не ловит, поэтому маскот-видео паузим по навигации сами.
window.addEventListener('ap-nav-change', (e) => {
  const v = document.querySelector('.empty-dash-mascot video');
  if (!(v instanceof HTMLVideoElement)) return;
  // @ts-ignore
  if (e.detail && e.detail.id === 's-home') { if (!document.hidden) v.play().catch(() => {}); }
  else v.pause();
});
on('dash:askAI',         () => askAIAboutSummary());
on('dash:closeModal',    (el) => el.closest('.modal-overlay')?.remove());
on('dash:openJournal',   () => window.Nav.go('s-journal'));
on('dash:toggleList',    (el) => {
  const target = document.getElementById(el.dataset.target);
  if (!target) return;
  const expanded = target.classList.toggle('expanded');
  el.classList.toggle('expanded', expanded);
  const label = el.querySelector('.list-toggle-label');
  if (label) label.textContent = expanded ? t('dash.show_less') : el.dataset.moreLabel;
  window.haptic?.(8);
});

export const Dashboard = (() => {
  const TYPE_COLOR = {
    push: 'var(--c-push)',
    pull: 'var(--c-pull)',
    legs: 'var(--c-legs)',
  };

  // Всегда на виду — «большая тройка», остальные 1RM свёрнуты по умолчанию.
  const PINNED_LIFTS = ['Bench Press', 'Leg Press', 'Lat Pulldown'];

  /**
   * Build a "Show N more" collapse toggle wired to dash:toggleList.
   * @param {string} targetId — id of the .list-collapse element it controls
   * @param {number} restCount
   * @returns {string}
   */
  function _toggleButtonHtml(targetId, restCount) {
    const moreLabel = t('dash.show_more', { n: restCount });
    return `
      <button class="list-toggle" data-action="dash:toggleList" data-target="${targetId}" data-more-label="${esc(moreLabel)}">
        <span class="list-toggle-label">${esc(moreLabel)}</span>
        <svg class="list-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>`;
  }

  /**
   * Return a time-of-day greeting string.
   * @returns {string}
   */
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /**
   * Compute estimated 1RM deltas for top lifts between current 30d and prior 30d.
   * Returns a map of exerciseName → delta (kg). Only populated when both periods have data.
   * @param {Array<{timestamp: number, exercises: Array}>} allWorkouts
   * @param {Set<string>} liftNames
   * @returns {Object<string, number>}
   */
  function computeLiftDeltas(allWorkouts, liftNames) {
    const now  = Date.now();
    const d30  = now - 30 * 86400000;
    const d60  = now - 60 * 86400000;
    const epley = (w, r) => r === 1 ? w : Math.round(w * (1 + r / 30));

    function bestInPeriod(workouts) {
      const map = {};
      for (const workout of workouts) {
        for (const ex of (workout.exercises || [])) {
          if (!liftNames.has(ex.name)) continue;
          for (const set of (ex.sets || [])) {
            if (!set.done || !set.weight || !set.reps) continue;
            const orm = epley(set.weight, set.reps);
            if (map[ex.name] === undefined || orm > map[ex.name]) map[ex.name] = orm;
          }
        }
      }
      return map;
    }

    const recent     = allWorkouts.filter(w => w.timestamp >= d30 && w.timestamp <= now); // 2-4: no future dates
    const prior      = allWorkouts.filter(w => w.timestamp >= d60 && w.timestamp < d30);
    const recentBest = bestInPeriod(recent);
    const priorBest  = bestInPeriod(prior);

    const deltas = {};
    for (const name of liftNames) {
      if (recentBest[name] !== undefined && priorBest[name] !== undefined) {
        deltas[name] = recentBest[name] - priorBest[name];
      }
    }
    return deltas;
  }

  /**
   * Build the full HTML template for the dashboard screen.
   * @param {string} nextType — 'push'|'pull'|'legs'
   * @returns {string} — HTML string
   */
  function _buildTemplate(nextType = 'push') {
    const nextLabel = nextType.charAt(0).toUpperCase() + nextType.slice(1);
    return `
      <!-- Hero -->
      <div class="dash-hero stagger-item">
        <div>
          <div class="dash-hero-label">Today · ${nextLabel} Day</div>
          <div class="dash-hero-title" id="dash-greeting-label">${greeting()}</div>
          <div class="dash-hero-date" id="dash-date"></div>
        </div>
        <button class="dash-cta" data-action="dash:directLaunch" data-type="${nextType}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 12 12 5 19 12"/>
            <path d="M12 5v14"/>
          </svg>
          Go
        </button>
      </div>

      <!-- Stat chips -->
      <div class="stat-row stagger-item">
        <div class="stat-chip">
          <div class="stat-chip-label">Week</div>
          <div class="stat-chip-val sk" id="dash-vol-week">&nbsp;&nbsp;&nbsp;&nbsp;</div>
        </div>
        <div class="stat-chip stat-chip-purple">
          <div class="stat-chip-label">Month</div>
          <div class="stat-chip-val sk" id="dash-vol-month">&nbsp;&nbsp;&nbsp;&nbsp;</div>
        </div>
        <div class="stat-chip stat-chip-blue">
          <div class="stat-chip-label">Sess / wk</div>
          <div class="stat-chip-val sk" id="dash-sessions">&nbsp;&nbsp;</div>
        </div>
      </div>

        <!-- Sparkline Chart (Phase 6) -->
        <div class="dash-card stagger-item" style="padding-bottom: 0; overflow: hidden; background: var(--c-spark-bg); border: 1px solid var(--c-border); margin-top: var(--sp-2); border-radius: var(--r-xl);">
          <div style="display:flex; justify-content:space-between; align-items:center; padding: 0 var(--sp-2); padding-top: var(--sp-2);">
            <div>
              <div style="color:var(--c-text-2); font-size:var(--fs-1); font-weight:var(--fw-bold); letter-spacing:0.05em; text-transform:uppercase;">Volume Trend</div>
              <div id="spark-total" style="color:var(--c-text-1); font-size:var(--fs-5); font-family:var(--font-heading); font-weight:var(--fw-black);">--</div>
            </div>
            <div class="badge" style="background:var(--c-bg-3); color:var(--c-text-2); font-size:var(--fs-1); font-weight:var(--fw-bold); border:1px solid var(--c-border);">30 Days</div>
          </div>
          <div id="spark-container" style="height: 60px; width: calc(100% - 32px); margin: 16px auto 16px auto;"></div>
        </div>

        <!-- Weekly Summary Chip -->
      <div class="stat-chip weekly-summary-chip stagger-item" data-action="dash:weeklySummary" style="cursor:pointer;margin-top:var(--sp-2)">
        <div class="stat-chip-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div class="stat-chip-content">
          <div class="stat-chip-label">This Week</div>
          <div class="stat-chip-val" id="weekly-summary-value">--</div>
        </div>
      </div>

      <!-- Streak card -->
      <div class="streak-card stagger-item" data-action="dash:navStats" style="cursor:pointer">
        <div class="streak-header">
          <span class="section-label">This Week</span>
          <span class="streak-count" id="streak-count"></span>
        </div>
        <div class="streak-strip" id="streak-strip"></div>
      </div>

      <!-- PPL split -->
      <div class="section-header stagger-item">
        <span class="section-label">PPL Split</span>
        <span class="badge badge-accent" id="dash-total"></span>
      </div>
      <div class="chart-card ppl-gauge-card stagger-item" id="ppl-gauge-home"></div>

      <!-- Top Lifts -->
      <div class="section-header">
        <span class="section-label">Top Lifts</span>
        <span class="badge badge-purple">Estimated 1RM</span>
      </div>
      <div id="dash-orm-list"></div>

      <!-- Recommendations -->
      <div id="recommendations-section" style="display:none;margin-top:var(--sp-2)"></div>

      <!-- Recent sessions -->
      <div class="section-header dash-recent-header">
        <span class="section-label">Recent</span>
        <button class="btn-text" data-action="dash:openJournal">${t('journal.see_all')}</button>
      </div>
      <div id="recent-list"></div>
    `;
  }

  function _buildEmptyState(showMascot = true) {
    const videoMode = flag('fab-video');
    const mascotInner = videoMode
      ? `<video autoplay loop muted playsinline preload="auto" src="${PANDA_VIDEO_SRC}" poster="${PANDA_POSTER_SRC}" aria-hidden="true"></video>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--c-accent, #00e676)" stroke-width="1.5" stroke-linejoin="round" width="64" height="64" style="filter: drop-shadow(0 0 12px rgba(0, 230, 118, 0.4))">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>`;
    return `
      <div class="empty-dashboard">
        ${showMascot ? `
        <div class="empty-dash-mascot-wrap" id="mascot-draggable" ${videoMode ? 'data-action="dash:mascotSound" title="Sound"' : ''}>
          <button class="mascot-close-btn" data-action="dash:closeMascot" title="Close mascot">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div class="empty-dash-mascot" style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;">
            ${mascotInner}
          </div>
        </div>` : ''}
        <div class="empty-dash-title">Ready to crush it?</div>
        <div class="empty-dash-sub">Your training log is empty. Time to fix that.</div>
        <button class="btn-start-workout" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Start First Workout
        </button>
      </div>`;
  }

  /**
   * Слушатели драга маскота на `window` (LEAK-1).
   * @type {ReturnType<typeof listenerGroup>|null}
   */
  let _mascotDragOn = null;

  /**
   * Initialize dragging for the mascot.
   */
  function _initMascotDrag() {
    // load() зовётся на каждый заход на s-home, а pointermove/pointerup ниже
    // сидят на window и с перерисовкой маскота не уходят. Снимать прошлые надо
    // ДО проверки на элемент: когда маскота на экране больше нет, старая пара
    // как раз и остаётся держать отсоединённый узел (LEAK-1).
    _mascotDragOn?.release();
    _mascotDragOn = null;

    const el = document.getElementById('mascot-draggable');
    if (!el) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    let gestureX = 0, gestureY = 0;
    let moved = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mascot-close-btn')) return;
      isDragging = true;
      moved = false;
      gestureX = e.clientX;
      gestureY = e.clientY;
      startX = e.clientX - currentX;
      startY = e.clientY - currentY;
      el.style.transition = 'none';
      el.setPointerCapture(e.pointerId);
    });

    _mascotDragOn = listenerGroup();

    _mascotDragOn.add('pointermove', (e) => {
      if (!isDragging) return;
      // 5px threshold: реальный драг не должен превращаться в тап по звуку
      if (!moved && (Math.abs(e.clientX - gestureX) > 5 || Math.abs(e.clientY - gestureY) > 5)) moved = true;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      el.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    _mascotDragOn.add('pointerup', () => {
      if (!isDragging) return;
      isDragging = false;
      el.style.transition = 'transform 0.4s var(--ease-std)';
    });

    el.addEventListener('click', (e) => {
      if (moved) {
        e.stopImmediatePropagation();
        e.preventDefault();
        moved = false;
      }
    }, true);
  }

  /* ── PANDA-3: сценарии 5 «Пока тебя не было» и 6 «Ночная смена» ──────
     Реакция на вход в приложение, а не на тренировку. load() зовётся на
     каждый переход на s-home, поэтому реплика жёстко ограничена одним разом
     в календарные сутки — иначе персонаж превращается в назойливый попап.
     Решение о том, ЧТО сказать, живёт в чистой entryGreeting() и покрыто
     тестом; здесь только доставка. */
  async function _pandaGreet(workouts) {
    if (!flag('panda-moods')) return;

    const last = workouts && workouts[0];
    const daysSinceLast = last && last.timestamp
      ? Math.floor((Date.now() - last.timestamp) / 86400000)
      : null;
    const greeting = entryGreeting({ daysSinceLast, hour: new Date().getHours() });
    if (!greeting) return;

    // Один раз в календарные сутки, по локальной дате устройства.
    const today = new Date().toLocaleDateString('sv');   // YYYY-MM-DD
    const seen = await DB.Settings.get('panda-greeted-on', '').catch(() => '');
    if (seen === today) return;
    await DB.Settings.set('panda-greeted-on', today).catch(() => {});

    // say = ровно та строка, что уходит в Toast: волна идёт под реальную
    // реплику, а не «пока не надоест». Осуждение молчит — talkDurationMs().
    const line = t(greeting.key);
    emitMood(greeting.mood, { hold: 6000, say: line });
    Toast.show(line, 'info');
  }

  /**
   * Close the mascot and persist the setting.
   */
  async function closeMascot() {
    const el = document.getElementById('mascot-draggable');
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.8)';
      setTimeout(() => {
        el.remove();
        window.dispatchEvent(new CustomEvent('ap-mascot-video'));
      }, 400);
    }
    await DB.Settings.set('show-mascot', 'off');
    window.Toast?.show('Mascot hidden', 'info');
  }

  /**
   * Render the 30-day sparkline volume chart
   */
  function renderSparkline(workouts) {
    const container = document.getElementById('spark-container');
    const totalEl = document.getElementById('spark-total');
    if (!container || !totalEl) return;
    
    if (!workouts || workouts.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--c-text-3); font-size: var(--fs-2);">No data</div>';
      return;
    }

    // Group tonnage by day + PPL type for the last 30 days
    const days = 30;
    const today = new Date();
    today.setHours(0,0,0,0);
    const dayMs = 24 * 60 * 60 * 1000;

    const dayKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dayKeys.push(d.getTime());
    }

    const pplMaps = {
      push: new Map(dayKeys.map(k => [k, 0])),
      pull: new Map(dayKeys.map(k => [k, 0])),
      legs: new Map(dayKeys.map(k => [k, 0])),
    };

    let total30d = 0;
    let last7d = 0;
    let prev7d = 0;

    workouts.forEach(w => {
      const wDate = new Date(w.timestamp);
      wDate.setHours(0,0,0,0);
      const ts = wDate.getTime();
      const diffDays = Math.floor((today.getTime() - ts) / dayMs);

      if (diffDays < 7) last7d += w.tonnage;
      else if (diffDays < 14) prev7d += w.tonnage;

      const type = (w.type || '').toLowerCase();
      const map = pplMaps[type];
      if (map && map.has(ts)) {
        map.set(ts, map.get(ts) + w.tonnage);
        total30d += w.tonnage;
      } else if (!map) {
        // non-PPL type — add to total only
        const anyMap = pplMaps.push;
        if (anyMap.has(ts)) total30d += w.tonnage;
      }
    });

    let trendHtml = '';
    if (prev7d > 0 || last7d > 0) {
      const percent = prev7d === 0 ? 100 : Math.round(((last7d - prev7d) / prev7d) * 100);
      const isUp = percent >= 0;
      const color = isUp ? 'var(--c-accent)' : 'var(--c-red)';
      const bg = isUp ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 77, 136, 0.15)';
      const arrow = isUp ? '+' : '-';
      trendHtml = `<span style="background:${bg}; color:${color}; font-size:var(--fs-1); font-weight:var(--fw-black); padding:2px 6px; border-radius:12px; margin-left:8px;">${arrow}${Math.abs(percent)}%</span>`;
    }

    const pushArr = Array.from(pplMaps.push.values());
    const pullArr = Array.from(pplMaps.pull.values());
    const legsArr = Array.from(pplMaps.legs.values());
    const globalMax = Math.max(...pushArr, ...pullArr, ...legsArr);

    if (globalMax === 0) {
      container.innerHTML = generateSparkline([0,0,0,0], 300, 80);
      return;
    }

    totalEl.innerHTML = `${fmtVol(total30d)} kg ${trendHtml}`;
    container.innerHTML = generateSparklineMulti([
      { data: pushArr, color: 'var(--c-push)' },
      { data: pullArr, color: 'var(--c-pull)' },
      { data: legsArr, color: 'var(--c-legs)' },
    ], 300, 80);
  }

  /**
   * Render the 7-day workout streak strip and streak count label.
   * @param {Array<{timestamp: number, type: string}>} workouts — all recorded workouts
   * @returns {void}
   */
  function renderStreak(workouts) {
    const strip = document.getElementById('streak-strip');
    if (!strip) return;

    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cells = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      cells.push(d);
    }

    const workedDays = {};
    workouts.forEach((w) => {
      const d = new Date(w.timestamp);
      d.setHours(0, 0, 0, 0);
      workedDays[d.getTime()] = w.type;
    });

    let streak = 0;
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);
      if (workedDays[d.getTime()]) streak++;
      else if (i > 0) break;
    }

    const el = document.getElementById('streak-count');
    if (el) el.textContent = streak === 1 ? '1 day streak' : `${streak} day streak`;

    strip.innerHTML = cells
      .map((d) => {
        const isToday = d.getTime() === today.getTime();
        const type = workedDays[d.getTime()];
        const hasWork = !!type;
        const color = TYPE_COLOR[type] || '';
        const dayName = days[(d.getDay() + 6) % 7];
        const dotStyle = hasWork ? `background:${color};opacity:0.9` : '';
        const dotClass = ['streak-dot', hasWork ? 'has-workout' : '', isToday ? 'today' : ''].join(
          ' '
        );

        const check = hasWork
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="#000"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="20 6 9 17 4 12"/>
           </svg>`
          : isToday
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)"
               stroke-width="1.5" stroke-linecap="round">
             <circle cx="12" cy="12" r="3"/>
           </svg>`
            : '';

        return `
        <div class="streak-day">
          <span class="streak-day-label">${dayName}</span>
          <div class="${dotClass}" style="${dotStyle}">${check}</div>
        </div>`;
      })
      .join('');
  }

  /**
   * Render the Push/Pull/Legs volume bars with animation.
   * @param {{push: number, pull: number, legs: number}} ppl — tonnage per type
   * @returns {void}
   */
  function renderPPL(ppl) {
    renderPplGauge(document.getElementById('ppl-gauge-home'), ppl);

    const total = document.getElementById('dash-total');
    if (total) {
      const sum = ppl.push + ppl.pull + ppl.legs;
      total.textContent = fmtVol(sum) + ' kg';
    }
  }

  /**
   * Render the estimated 1RM list. Bench Press / Leg Press / Lat Pulldown
   * (PINNED_LIFTS) stay visible by default; everything else collapses behind
   * a "Show more" toggle. Falls back to the top 3 by value when none of the
   * pinned lifts have data yet.
   * @param {Array<{id: string, value: number}>} orms — 1RM estimates
   * @param {Array} allWorkouts — full workout history for delta computation
   * @returns {void}
   */
  function renderTopLifts(orms, allWorkouts = []) {
    const el = document.getElementById('dash-orm-list');
    if (!el) return;
    if (!orms.length) {
      el.innerHTML = `<div style="text-align:center;padding:var(--sp-2);
        color:var(--c-text-3);font-size:var(--fs-2)">Complete sets to see 1RM estimates</div>`;
      return;
    }
    const sorted = [...orms].sort((a, b) => b.value - a.value);
    const max = sorted[0].value;
    const rank = new Map(sorted.map((o, i) => [o.id, i + 1]));

    let pinned = PINNED_LIFTS.map((name) => sorted.find((o) => o.id === name)).filter(Boolean);
    if (!pinned.length) pinned = sorted.slice(0, 3);
    const pinnedIds = new Set(pinned.map((o) => o.id));
    const rest = sorted.filter((o) => !pinnedIds.has(o.id)).slice(0, 5);
    const shown = [...pinned, ...rest];

    const liftNames = new Set(shown.map((o) => o.id));
    const deltas = computeLiftDeltas(allWorkouts, liftNames);

    const row = (o, i) => {
      const delta = deltas[o.id];
      const deltaHtml = delta != null
        ? `<span class="orm-delta ${delta >= 0 ? 'orm-delta-up' : 'orm-delta-down'}">${delta >= 0 ? '+' : ''}${delta}kg</span>`
        : '';
      return `
      <div class="orm-row">
        <div class="orm-name">
          <span style="font-size:var(--fs-1);font-weight:var(--fw-bold);color:var(--c-text-3);
            margin-right:6px;font-variant-numeric:tabular-nums">#${rank.get(o.id)}</span>${esc(o.id)}
        </div>
        <div class="orm-val">${o.value}<span class="orm-unit">kg</span>${deltaHtml}</div>
        <div class="orm-bar-wrap">
          <div class="orm-bar-fill" id="dash-orm-bar-${i}" style="background:var(--c-legs)"></div>
        </div>
      </div>`;
    };

    const pinnedHtml = pinned.map((o, i) => row(o, i)).join('');
    const restHtml = rest.map((o, i) => row(o, pinned.length + i)).join('');
    const collapseHtml = rest.length
      ? `<div class="list-collapse" id="dash-orm-more"><div class="list-collapse-inner">${restHtml}</div></div>${_toggleButtonHtml('dash-orm-more', rest.length)}`
      : '';
    el.innerHTML = pinnedHtml + collapseHtml;

    // Animate bars
    requestAnimationFrame(() => {
      shown.forEach((o, i) => {
        const bar = document.getElementById(`dash-orm-bar-${i}`);
        if (bar) {
          Spring.animate({
            from: 0,
            to: Math.round((o.value / max) * 100),
            stiffness: 100 + i * 10,
            damping: 15,
            onUpdate: (v) => { bar.style.transform = `scaleX(${v / 100})`; }
          });
        }
      });
    });
  }

  /**
   * Render the most recent workout sessions list (up to 5).
   * Reads session.blocks for block-indicator strips (W-2-D-3).
   * Falls back to flat card for legacy sessions without blocks.
   * @param {Array} workouts
   * @returns {void}
   */
  function renderRecent(workouts) {
    const el = document.getElementById('recent-list');
    if (!el) return;

    const now = Date.now();
    const list = (workouts || [])
      .filter((w) => w.timestamp <= now)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    if (!list.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round">
              <circle cx="7" cy="12" r="2.4"/>
              <circle cx="17" cy="12" r="2.4"/>
              <rect x="4.6" y="10.6" width="4.8" height="2.8" rx="1.2"/>
              <rect x="14.6" y="10.6" width="4.8" height="2.8" rx="1.2"/>
              <line x1="9.4" y1="12" x2="14.6" y2="12"/>
              <rect x="11" y="9" width="2" height="6" rx="0.8"/>
            </svg>
          </div>
          <div class="empty-title">No sessions yet</div>
          <div class="empty-desc">Complete your first workout<br>to see it here</div>
        </div>`;
      return;
    }

    const sessionHtml = (w) => {
      const dot   = TYPE_COLOR[w.type] || 'var(--c-text-3)';
      const date  = fmtDate(w.timestamp);
      const dur   = w.duration ? fmtDuration(w.duration) : null;
      const type  = w.type ? (w.type.charAt(0).toUpperCase() + w.type.slice(1)) : 'Training';

      // ── Block indicator strip (W-2-D-3) ──────────────────────────
      // session.blocks = [{ id, label, tonnage }] — written by Lead W-2-B
      // Falls back to empty string for legacy sessions.
      const blockStrip = (() => {
        const blocks = Array.isArray(w.blocks) ? w.blocks.filter(b => b.id !== 'core' && b.id !== 'align') : [];
        if (!blocks.length) return '';
        const total = blocks.reduce((s, b) => s + (b.tonnage || 0), 0) || 1;
        const pills = blocks.map(b => {
          const pct = Math.max(6, Math.round((b.tonnage || 0) / total * 100));
          const color = dot; // all same PPL color — subtle differentiation via opacity
          return `<span class="rec-block-pill" style="flex:${pct};background:${color};opacity:${b.id === 'power' ? '1' : '0.45'}" title="${esc(b.label || b.id)}"></span>`;
        }).join('');
        return `<div class="rec-block-strip">${pills}</div>`;
      })();

      // ── PR badge ──────────────────────────────────────────────────
      const prBadge = (w.prs && w.prs.length)
        ? `<span class="rec-pr-badge">${w.prs.length} PR</span>`
        : '';

      // ── Duration chip ─────────────────────────────────────────────
      const durChip = dur ? `<span class="rec-dur">${esc(dur)}</span>` : '';

      return `
        <div class="session-item">
          <div class="session-dot" style="background:${dot}"></div>
          <div class="session-info">
            <div class="session-title-row">
              <span class="session-title">${esc(type)} Day</span>
              ${prBadge}
            </div>
            <div class="session-meta">${esc(date)}${durChip ? ' · ' + durChip : ''}</div>
            ${blockStrip}
          </div>
          <div class="session-vol">${fmtVol(w.tonnage)} kg</div>
        </div>`;
    };

    const VISIBLE = 3;
    const visible = list.slice(0, VISIBLE);
    const rest    = list.slice(VISIBLE);
    const collapseHtml = rest.length
      ? `<div class="list-collapse" id="recent-more"><div class="list-collapse-inner">${rest.map(sessionHtml).join('')}</div></div>${_toggleButtonHtml('recent-more', rest.length)}`
      : '';
    el.innerHTML = visible.map(sessionHtml).join('') + collapseHtml;
  }

  /**
   * Directly launch a workout session of a given type.
   * @param {string} type — 'push'|'pull'|'legs'
   */
  async function directLaunch(type) {
    if (window.haptic) window.haptic(15);
    window.Toast?.show(`Launching ${type.charAt(0).toUpperCase() + type.slice(1)} Session`, 'success');
    
    // We need to ensure Workout logic is loaded
    const { Workout } = await import('./workout.view.js');
    await Workout.selectType(type);
    window.Nav.go('s-train', { force: true });
  }

  /**
   * Load and render the dashboard home screen.
   * Fetches recent workouts, volume stats, streak data, and renders all sections.
   * @returns {Promise<void>}
   */
  async function load() {
    const screen = document.getElementById('s-home');
    if (!screen) return;

    // Fetch data in parallel — optimized native queries
    const [allWorkouts, orms, showMascotSetting] = await Promise.all([
      DB.Workouts.getAll(),
      DB.OneRM.getAll(),
      DB.Settings.get('show-mascot').catch(() => 'on'),
    ]);
    const showMascot = showMascotSetting !== 'off';

    // Empty state — first-time user
    if (!allWorkouts.length) {
      screen.innerHTML = _buildEmptyState(showMascot);
      _initMascotDrag();
      const mascotWrap = document.getElementById('mascot-draggable');
      // PANDA-3: большой маскот должен слышать ту же шину, что и FAB — иначе
      // половина персонажа реактивная, половина крутит старый зум.
      if (mascotWrap) {
        if (flag('panda-moods')) attachMood(mascotWrap, mascotWrap.querySelector('video'));
        else initPandaVideo(mascotWrap, mascotWrap.querySelector('video'));
      }
      window.dispatchEvent(new CustomEvent('ap-mascot-video'));
      _pandaGreet(allWorkouts);   // после монтирования маскота, иначе мимика уйдёт в пустоту
      screen.querySelector('.btn-start-workout')?.addEventListener('click', () => {
        if (window.haptic) window.haptic([15, 50, 15]);
        window.Toast.show("Let's go!", 'success');
        window.Nav.go('s-train', { force: true });
      });
      return;
    }

    // Маскот пустого дашборда ушёл (первая тренировка записана) — FAB может вернуться
    window.dispatchEvent(new CustomEvent('ap-mascot-video'));
    _pandaGreet(allWorkouts);

    // Determine nextType based on last workout (DB already sorted)
    const lastWorkout = allWorkouts[0];
    const lastType = lastWorkout?.type || 'legs';
    const nextType = { push: 'pull', pull: 'legs', legs: 'push' }[lastType] || 'push';

    // Build full dashboard frame if needed
    if (!document.getElementById('dash-greeting-label')) {
      screen.innerHTML = _buildTemplate(nextType);
    }

    // Phase 1: Static / Fast data
    const greet = document.getElementById('dash-greeting-label');
    if (greet) greet.textContent = greeting();
    const dateEl = document.getElementById('dash-date');
    if (dateEl)
      dateEl.textContent = new Date().toLocaleDateString('en', {
        weekday: 'long', month: 'long', day: 'numeric',
      });

    const weekVol    = weeklyVolumeFrom(allWorkouts);
    const monthVol   = monthlyVolumeFrom(allWorkouts);
    const weekCount  = weeklyCountFrom(allWorkouts);
    const ppl        = pplTonnageFrom(allWorkouts);

    // Stats — remove skeleton class before populating
    const wv = document.getElementById('dash-vol-week');
    const mv = document.getElementById('dash-vol-month');
    const sc = document.getElementById('dash-sessions');
    if (wv) { wv.classList.remove('sk'); wv.innerHTML = fmtVol(weekVol) + '<span class="stat-chip-unit">kg</span>'; }
    if (mv) { mv.classList.remove('sk'); mv.innerHTML = fmtVol(monthVol) + '<span class="stat-chip-unit">kg</span>'; }
    if (sc) { sc.classList.remove('sk'); sc.textContent = weekCount; }

    // Phase 2: Deferred rendering to keep UI responsive
    requestAnimationFrame(() => {
      renderSparkline(allWorkouts);
      renderStreak(allWorkouts);
      renderPPL(ppl);
      
      requestAnimationFrame(() => {
        renderTopLifts(orms, allWorkouts);
        renderRecent(allWorkouts);
        renderRecommendations();
        loadWeeklySummary();
      });
    });
  }

  /**
   * Render recommendations card for next session.
   * @returns {void}
   */
  function renderRecommendations() {
    const container = document.getElementById('recommendations-section');
    if (!container) return;

    // Determine next session type based on last workout
    const lastType = localStorage.getItem('ap-last-workout-type');
    if (!lastType) {
      container.style.display = 'none';
      return;
    }

    const nextType = { push: 'pull', pull: 'legs', legs: 'push' }[lastType];
    const recs = getRecommendations(nextType);

    if (!recs || !recs.exercises?.length) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    const progressingExercises = recs.exercises.filter(
      (ex) => ex.recommendedWeight > ex.currentWeight
    );

    if (!progressingExercises.length) {
      container.style.display = 'none';
      return;
    }

    const nextTypeLabel = nextType.charAt(0).toUpperCase() + nextType.slice(1);

    container.innerHTML = `
      <div class="section-header">
        <span class="section-label">Next ${nextTypeLabel} Session</span>
        <span class="badge badge-green">AI Powered</span>
      </div>
      <div class="recommendations-card">
        ${progressingExercises.slice(0, 4).map((ex) => `
          <div class="rec-item">
            <div class="rec-dot" style="background: var(--c-accent)"></div>
            <div class="rec-info">
              <span class="rec-name">${esc(ex.name)}</span>
              <span class="rec-reason">${esc(ex.reason)}</span>
            </div>
            <div class="rec-weights">
              <span class="rec-old">${ex.currentWeight}kg</span>
              <span class="rec-arrow">→</span>
              <span class="rec-new">${ex.recommendedWeight}kg</span>
            </div>
          </div>
        `).join('')}
        ${progressingExercises.length > 4 ? `<div class="rec-more">+${progressingExercises.length - 4} more</div>` : ''}
      </div>
    `;
  }

  return { load, renderRecommendations, showWeeklySummary, loadWeeklySummary, closeMascot, _initMascotDrag, directLaunch };
})();

/* ══════════════════════════════════════════════
   WEEKLY SUMMARY
   ══════════════════════════════════════════════ */

/**
 * Load and display weekly summary.
 */
async function loadWeeklySummary() {
  const { generateWeeklySummary } = await import('./progressive-overload.js');
  const workouts = await DB.Workouts.getAll();
  const { summary, plateauAlerts, prs } = await generateWeeklySummary(workouts);

  // Update chip
  const chipValue = document.getElementById('weekly-summary-value');
  if (chipValue) {
    if (prs.length > 0) {
      chipValue.textContent = `${prs.length} PR${prs.length > 1 ? 's' : ''}`;
      chipValue.style.color = 'var(--c-gold)';
    } else if (plateauAlerts.length > 0) {
      chipValue.textContent = `${plateauAlerts.length} plateau${plateauAlerts.length > 1 ? 's' : ''}`;
      chipValue.style.color = 'var(--c-red)';
    } else {
      const since = Date.now() - 7 * 24 * 3600000;
      const count = workouts.filter(w => w.timestamp >= since).length;
      chipValue.textContent = `${count} workout${count !== 1 ? 's' : ''}`;
      chipValue.style.color = 'var(--c-text-1)';
    }
  }

  // Store for modal
  window._weeklySummary = { summary, plateauAlerts, prs };
}

/**
 * Show weekly summary modal.
 */
async function showWeeklySummary() {
  const { summary, plateauAlerts, prs } = window._weeklySummary || {};
  if (!summary) {
    await loadWeeklySummary();
  }

  const data = window._weeklySummary;
  if (!data) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '5000';

  overlay.innerHTML = `
    <div class="modal-sheet" style="max-width:520px;margin:auto;border-radius:var(--r-xl)">
      <div class="modal-handle"></div>

      <div class="section-header">
        <span class="section-label">Weekly Summary</span>
      </div>

      <div class="weekly-summary-content" style="padding:var(--sp-3)">
        <div class="summary-section">
          <h3 style="font-size:var(--fs-3);color:var(--c-text-2);margin-bottom:var(--sp-2)">Overview</h3>
          <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:var(--sp-3)">
            ${data.workoutCount > 0 ? `
              <div style="display:flex; align-items:center; gap:12px; color:var(--c-text-1); font-size:var(--fs-3);">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--c-text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
                <span><strong>${data.workoutCount} workouts</strong> this week</span>
              </div>
            ` : `<div style="color:var(--c-text-3); font-size:var(--fs-3);">No workouts this week — rest is important too!</div>`}
            
            ${data.prs.length > 0 ? `
              <div style="display:flex; align-items:flex-start; gap:12px; color:var(--c-text-1); font-size:var(--fs-3);">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--c-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top:2px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                <span><strong>${data.prs.length} PRs</strong>: ${data.prs.map(p => `${esc(p.exercise)} ${p.weight}kg`).join(', ')}</span>
              </div>
            ` : ''}

            ${data.plateauAlerts.length > 0 ? `
              <div style="display:flex; align-items:center; gap:12px; color:var(--c-text-1); font-size:var(--fs-3);">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--c-amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span><strong>${data.plateauAlerts.length} plateaus</strong> detected</span>
              </div>
            ` : ''}
          </div>
        </div>

        ${data.prs.length > 0 ? `
          <div class="summary-section pr-section" style="margin-top:var(--sp-3)">
            <h3 style="font-size:var(--fs-3);color:var(--c-accent);margin-bottom:var(--sp-2)">Personal Records</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${data.prs.map(pr => `
                <div style="display:flex; justify-content:space-between; padding:var(--sp-2); background:var(--c-surface-h); border-radius:var(--r-s); border-left:2px solid var(--c-accent);">
                  <span style="color:var(--c-text-1); font-weight:var(--fw-bold);">${esc(pr.exercise)}</span>
                  <span style="color:var(--c-accent); font-weight:var(--fw-black); font-variant-numeric:tabular-nums;">${pr.weight}kg</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${data.plateauAlerts.length > 0 ? `
          <div class="summary-section plateau-section" style="margin-top:var(--sp-4)">
            <h3 style="font-size:var(--fs-3);color:var(--c-amber);margin-bottom:var(--sp-2)">Plateau Alerts</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${data.plateauAlerts.map(alert => `
                <div class="plateau-alert" style="padding:var(--sp-2); background:var(--c-surface-h); border-radius:var(--r-s); border-left:2px solid var(--c-amber);">
                  <strong style="color:var(--c-text-1);display:block;margin-bottom:4px;font-size:var(--fs-3);">${esc(alert.exercise)}</strong>
                  <p style="color:var(--c-text-2);font-size:var(--fs-2);margin-bottom:4px">${esc(alert.suggestion)}</p>
                  <small style="color:var(--c-text-3);font-size:var(--fs-1)">${alert.weeks} weeks since last progress</small>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="modal-footer" style="padding:var(--sp-2) var(--sp-3);display:flex;gap:var(--sp-2);justify-content:flex-end">
        <button class="btn-icon-nav" data-action="dash:askAI" style="align-self:center">Ask Coach</button>
        <button class="btn-primary" data-action="dash:closeModal">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

/**
 * Ask AI about weekly summary.
 */
async function askAIAboutSummary() {
  const { summary, plateauAlerts, prs } = window._weeklySummary || {};

  // Open Claude panel with context
  const message = `Analyze my week: ${summary}. ${plateauAlerts.length > 0 ? 'Plateaus: ' + plateauAlerts.map(a => a.exercise).join(', ') : ''} ${prs.length > 0 ? 'PRs: ' + prs.map(p => `${p.exercise} ${p.weight}kg`).join(', ') : ''}`;

  // Send to AI via fetchCoach
  const { fetchCoach } = await import('./claude.store.js');
  const { Claude } = await import('./claude.view.js');

  Claude.open();

  // Wait for panel to open then send message
  setTimeout(async () => {
    await fetchCoach(message, {
      onText: () => {},
      onDone: () => {},
      onError: (err) => Toast.show(`Error: ${err}`, 'error')
    });
  }, 500);
}
