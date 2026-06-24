// @ts-check
import { DB } from '../db.js';
import { athleteProScore, dotsScore } from '../strength-engine.js';
import { loadProfile, updateProfile, updateWeightAndHeight } from '../profile.store.js';
import { esc, haptic } from './utils.js';
import { isRu } from '../locale.store.js';
import { on, onChange } from '../events.js';

const AR = () => window.AthleteRoom;
on('ar:open',           () => AR().open());
on('ar:close',          () => AR().close());
on('ar:switchTab',      (el) => AR().switchTab(el.dataset.tab));
on('ar:photoUpload',    () => AR().triggerPhotoUpload());
on('ar:removePhoto',    (el, e) => AR().removePhoto(e));
on('ar:editName',       () => AR().editName());
on('ar:editStat',       (el) => AR().editStat(el.dataset.stat, +el.dataset.val));
on('ar:saveStat',       () => AR().saveStat());
on('ar:cancelStatEdit', () => AR().cancelStatEdit());
on('ar:selectColor',    (el) => AR().selectColor(+el.dataset.i));
on('ar:selectFrame',    (el) => AR().selectFrame(+el.dataset.i));
on('ar:saveName',       () => AR().saveName());
on('ar:cancelEdit',     () => AR().cancelEdit());
onChange('ar:photoSelected', (el, e) => AR().handlePhotoSelected(e));

/* ════════════════════════════════════════════════════════
   athlete-room.js — Athlete Room: личный кабинет атлета
   ════════════════════════════════════════════════════════ */

const AVATAR_COLORS = [
  ['#4f46e5', '#06b6d4'], // Indigo -> Cyan
  ['#10b981', '#059669'], // Emerald -> Green
  ['#f59e0b', '#d97706'], // Amber -> Yellow
  ['#ec4899', '#be185d'], // Pink -> Rose
  ['#8b5cf6', '#6d28d9']  // Violet -> Purple
];

// Neon frame (ring) colors. Index 0 = original green→blue neon (default look).
// Applied to the thin ring only (--c1/--c2), never as a fill over the photo.
const FRAME_COLORS = [
  ['var(--c-accent)', 'var(--c-blue)'], // 0 Green→Blue (default neon)
  ['#00e676', '#00c853'],               // 1 Green
  ['#00b8d4', '#0091ea'],               // 2 Cyan
  ['#8b5cf6', '#6d28d9'],               // 3 Purple
  ['#ffb300', '#ff8f00'],               // 4 Amber
  ['#ff4d88', '#c2185b'],               // 5 Pink
];

const TIER_COLOR = {
  Untrained:    '#78909c',
  Novice:       '#26a69a',
  Intermediate: '#f59e0b',
  Advanced:     '#7c3aed',
  Elite:        '#ff6d00'
};

const TIER_RU = {
  Untrained:    'Новичок',
  Novice:       'Начинающий',
  Intermediate: 'Средний',
  Advanced:     'Продвинутый',
  Elite:        'Элита'
};

const ACHIEVEMENTS = [
  { id: 'first_workout',  icon: '1st', ru: 'Первая тренировка',   en: 'First Workout',      check: (w) => w.length >= 1 },
  { id: 'five_workouts',  icon: '5x',  ru: '5 тренировок',         en: '5 Workouts',         check: (w) => w.length >= 5 },
  { id: 'ten_workouts',   icon: '10x', ru: '10 тренировок',        en: '10 Workouts',        check: (w) => w.length >= 10 },
  { id: 'fifty_workouts', icon: '50x', ru: '50 тренировок',        en: '50 Workouts',        check: (w) => w.length >= 50 },
  { id: 'streak_7',       icon: '7D',  ru: '7 дней подряд',        en: '7-Day Streak',       check: (w) => _calcStreak(w) >= 7 },
  { id: 'tonne_club',     icon: '1T',  ru: '1 тонна за сессию',    en: '1 Tonne Session',    check: (w) => w.some(s => s.tonnage >= 1000) },
  { id: 'push_master',    icon: 'PM',  ru: 'Мастер жима',          en: 'Push Master',        check: (w) => w.filter(s => s.type === 'push').length >= 10 },
  { id: 'consistency',    icon: '3W',  ru: '3 недели без пропусков', en: '3 Weeks Consistent', check: (w) => _calcConsistency(w) },
];

function _calcStreak(workouts) {
  if (!workouts.length) return 0;
  const dates = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dates.has(key)) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

function _calcConsistency(workouts) {
  if (workouts.length < 9) return false;
  const now = new Date();
  const weeks = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    return Math.floor(d.getTime() / (7 * 86400000));
  }));
  let activeWeeks = 0;
  const currentWeek = Math.floor(now.getTime() / (7 * 86400000));
  for (let i = 0; i < 5; i++) {
    if (weeks.has(currentWeek - i)) activeWeeks++;
  }
  return activeWeeks >= 3;
}

function _tierFromScore(score) {
  if (!score || score < 200) return 'Untrained';
  if (score < 300) return 'Novice';
  if (score < 380) return 'Intermediate';
  if (score < 470) return 'Advanced';
  return 'Elite';
}

export const AthleteRoom = (() => {
  let _overlay = null;

  async function open() {
    haptic(15);
    _overlay = document.getElementById('athlete-room');
    if (!_overlay) return;

    _overlay.innerHTML = `<div class="ar-loader"></div>`;
    _overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    await render();
  }

  function close() {
    haptic(10);
    if (!_overlay) return;
    _overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { _overlay.innerHTML = ''; }, 350);
  }

  async function render() {
    const [workouts, orms, customName, colorIdx, frameIdx, lang, profile, metrics, photo] = await Promise.all([
      DB.Workouts.getAll().catch(() => []),
      DB.OneRM.getAll().catch(() => []),
      DB.Settings.get('athlete-name', ''),
      DB.Settings.get('avatar-color', '0'),
      DB.Settings.get('avatar-frame', '0'),
      DB.Settings.get('lang', 'en'),
      loadProfile().catch(() => null),
      DB.Metrics.latest().catch(() => null),
      DB.Settings.get('athlete-photo', null)
    ]);

    const ru = lang === 'ru';
    const name = customName || profile?.name || (ru ? 'Атлет' : 'Athlete');
    const [c1, c2] = AVATAR_COLORS[(parseInt(colorIdx) || 0) % AVATAR_COLORS.length];
    const [f1, f2] = FRAME_COLORS[(parseInt(frameIdx) || 0) % FRAME_COLORS.length];
    const initials = name.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';
    
    // Compute level/tier
    const bestORM = orms.reduce((acc, curr) => {
      if (curr.id.match(/bench/i)) acc.bench = Math.max(acc.bench || 0, curr.value);
      if (curr.id.match(/squat/i)) acc.squat = Math.max(acc.squat || 0, curr.value);
      if (curr.id.match(/deadlift/i)) acc.deadlift = Math.max(acc.deadlift || 0, curr.value);
      return acc;
    }, { bench: 0, squat: 0, deadlift: 0 });

    const total = (bestORM.bench || 0) + (bestORM.squat || 0) + (bestORM.deadlift || 0);
    const weight = metrics?.weight || 80;
    const sex = profile?.sex || 'm';
    const score = total ? athleteProScore({ total, bodyweight: weight, sex, age: profile?.dob ? (new Date().getFullYear() - new Date(profile.dob).getFullYear()) : 30, experience: profile?.experienceYears, height: window.DB ? window.DB.Metrics.latest()?.height : 180 }) : 0;
    const dots = total ? dotsScore({ total, bodyweight: weight, sex }) : 0;
    const tier = _tierFromScore(score);
    const tierColor = TIER_COLOR[tier];
    const tierLabel = ru ? TIER_RU[tier] : tier;
    const streak = _calcStreak(workouts);

    const unlockedAch = new Set(ACHIEVEMENTS.filter(a => a.check(workouts)).map(a => a.id));

    const activeTab = window._arActiveTab || 'profile';

    _overlay.innerHTML = `
      <div class="ar-sheet">
        <div class="ar-header" style="flex-direction: column; align-items: flex-start; padding-bottom: 0;">
          <div style="display: flex; align-items: center; width: 100%; justify-content: space-between; margin-bottom: 16px;">
            <button class="ar-back-btn" data-action="ar:close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div style="font-weight: 700; font-size: 16px;">${ru ? 'Мой профиль' : 'Athlete Room'}</div>
            <div style="width: 44px;"></div> <!-- spacer -->
          </div>
          
          <div class="bs-tab-bar" style="margin-bottom: 0; width: 100%; border-bottom-left-radius: 0; border-bottom-right-radius: 0;">
            <button class="bs-tab ${activeTab === 'profile' ? 'active' : ''}" data-action="ar:switchTab" data-tab="profile">${ru ? 'Профиль' : 'Profile'}</button>
            <button class="bs-tab ${activeTab === 'metrics' ? 'active' : ''}" data-action="ar:switchTab" data-tab="metrics">${ru ? 'Замеры' : 'Body Metrics'}</button>
          </div>
        </div>

        <div class="ar-content" id="ar-tab-content" style="padding: 16px; overflow-y: auto; flex: 1;">
          <!-- Content injected by switchTab -->
        </div>
      </div>
    `;

    _initSheetDrag();
    await switchTab(activeTab, { workouts, name, initials, c1, c2, f1, f2, colorIdx, frameIdx, tierLabel, tierColor, streak, total, score, dots, unlockedAch, metrics, photo, profile, ru });
  }

  async function switchTab(tabId, dataContext = null) {
    haptic(10);
    window._arActiveTab = tabId === 'settings' ? 'profile' : tabId; // Fallback if settings was active
    
    // Update active state in UI if overlay is open
    if (_overlay) {
      _overlay.querySelectorAll('.bs-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === window._arActiveTab);
      });
    }

    const container = document.getElementById('ar-tab-content');
    if (!container) return;

    // Use passed context or fetch fresh if undefined
    let ctx = dataContext;
    if (!ctx) {
      const [workouts, orms, customName, colorIdx, frameIdx, lang, profile, metrics, photo] = await Promise.all([
        DB.Workouts.getAll().catch(() => []),
        DB.OneRM.getAll().catch(() => []),
        DB.Settings.get('athlete-name', ''),
        DB.Settings.get('avatar-color', '0'),
        DB.Settings.get('avatar-frame', '0'),
        DB.Settings.get('lang', 'en'),
        loadProfile().catch(() => null),
        DB.Metrics.latest().catch(() => null),
        DB.Settings.get('athlete-photo', null)
      ]);
      const ru = lang === 'ru';
      const name = customName || profile?.name || (ru ? 'Атлет' : 'Athlete');
      const [c1, c2] = AVATAR_COLORS[(parseInt(colorIdx) || 0) % AVATAR_COLORS.length];
      const [f1, f2] = FRAME_COLORS[(parseInt(frameIdx) || 0) % FRAME_COLORS.length];
      const initials = name.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';
      
      const bestORM = orms.reduce((acc, curr) => {
        if (curr.id.match(/bench/i)) acc.bench = Math.max(acc.bench || 0, curr.value);
        if (curr.id.match(/squat/i)) acc.squat = Math.max(acc.squat || 0, curr.value);
        if (curr.id.match(/deadlift/i)) acc.deadlift = Math.max(acc.deadlift || 0, curr.value);
        return acc;
      }, { bench: 0, squat: 0, deadlift: 0 });

      const total = (bestORM.bench || 0) + (bestORM.squat || 0) + (bestORM.deadlift || 0);
      const weight = metrics?.weight || 80;
      const sex = profile?.sex || 'm';
      const score = total ? athleteProScore({ total, bodyweight: weight, sex, age: profile?.dob ? (new Date().getFullYear() - new Date(profile.dob).getFullYear()) : 30, experience: profile?.experienceYears, height: window.DB ? window.DB.Metrics.latest()?.height : 180 }) : 0;
      const dots = total ? dotsScore({ total, bodyweight: weight, sex }) : 0;
      const tier = _tierFromScore(score);
      const tierColor = TIER_COLOR[tier];
      const tierLabel = ru ? TIER_RU[tier] : tier;
      const streak = _calcStreak(workouts);
      const unlockedAch = new Set(ACHIEVEMENTS.filter(a => a.check(workouts)).map(a => a.id));

      ctx = { workouts, name, initials, c1, c2, f1, f2, colorIdx, frameIdx, tierLabel, tierColor, streak, total, score, dots, unlockedAch, metrics, photo, profile, ru };
    }

    if (window._arActiveTab === 'profile') {
      _renderProfileTab(container, ctx);
    } else if (window._arActiveTab === 'metrics') {
      _renderMetricsTab(container, ctx);
    }
  }

  function _renderProfileTab(container, ctx) {
    const { name, initials, c1, c2, f1, f2, tierLabel, tierColor, streak, total, score, dots, unlockedAch, photo, ru, metrics } = ctx;
    
    // Use the existing avatar init logic but wrap the HTML
    const avatarHtml = photo
      ? `<div class="ar-avatar has-photo" style="background-image: url('${photo}')" data-action="ar:photoUpload">
           <div class="ar-avatar-ring" style="--c1:${f1}; --c2:${f2}"></div><div style="position:absolute; bottom:-4px; right:-4px; background:var(--c-surface); border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.5); pointer-events:none;"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-2)" stroke-width="2" width="12" height="12"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>
         </div>`
      : `<div class="ar-avatar" id="ar-avatar-circle" style="background: linear-gradient(135deg, ${c1}, ${c2})" data-action="ar:photoUpload">
           <div class="ar-avatar-ring" style="--c1:${f1}; --c2:${f2}"></div><div style="position:absolute; bottom:-4px; right:-4px; background:var(--c-surface); border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.5); pointer-events:none;"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-2)" stroke-width="2" width="12" height="12"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>
           <div class="ar-avatar-initials">${initials}</div><div style="position:absolute; bottom:-4px; right:-4px; background:var(--c-surface); border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.5); pointer-events:none;"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-2)" stroke-width="2" width="12" height="12"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>
         </div>`;

    container.innerHTML = `
          <div class="ar-passport">
            <div style="position:relative">
              ${avatarHtml}
              ${photo ? `<button class="ar-remove-photo" data-action="ar:removePhoto" title="Remove photo">&times;</button>` : ''}
              <input type="file" id="ar-photo-input" accept="image/jpeg, image/png, image/webp" style="display:none" data-change="ar:photoSelected">
            </div>
            
            <div class="ar-name" data-action="ar:editName">
              <span>${esc(name)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="opacity:0.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            
            <div class="ar-tier" style="color: ${tierColor}">
              <div class="ar-tier-dot" style="background: ${tierColor}; box-shadow: 0 0 8px ${tierColor};"></div>
              ${tierLabel}
            </div>
          </div>

          <div class="ar-stats" style="margin-bottom:12px">
            <div class="ar-stat" data-action="ar:editStat" data-stat="weight" data-val="${metrics?.weight||80}" style="cursor:pointer">
              <div class="ar-stat-val">${metrics?.weight||'—'} <span style="font-size:12px;opacity:0.6">kg</span></div>
              <div class="ar-stat-lbl">${ru?'Вес':'Weight'} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" style="margin-left:4px; opacity:0.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
            </div>
            <div class="ar-stat" data-action="ar:editStat" data-stat="height" data-val="${metrics?.height||180}" style="cursor:pointer">
              <div class="ar-stat-val">${metrics?.height||'—'} <span style="font-size:12px;opacity:0.6">cm</span></div>
              <div class="ar-stat-lbl">${ru?'Рост':'Height'} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" style="margin-left:4px; opacity:0.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
            </div>
            <div class="ar-stat" style="box-shadow: 0 4px 16px ${tierColor}20; border-color: ${tierColor}40">
              <div class="ar-stat-val" style="color: ${tierColor}; text-shadow: 0 0 12px ${tierColor}80">${Math.round(score)}</div>
              <div class="ar-stat-lbl">${ru ? 'Очки' : 'Score'}</div>
            </div>
          </div>
          <div class="ar-stats">
            <div class="ar-stat">
              <div class="ar-stat-val">${streak} <span style="font-size:12px;opacity:0.6">d</span></div>
              <div class="ar-stat-lbl">${ru ? 'Стрик' : 'Streak'}</div>
            </div>
            <div class="ar-stat">
              <div class="ar-stat-val">${total} <span style="font-size:12px;opacity:0.6">kg</span></div>
              <div class="ar-stat-lbl">${ru ? 'Сумма 1RM' : '1RM Total'}</div>
            </div>
            <div class="ar-stat" style="box-shadow: 0 4px 16px ${tierColor}20; border-color: ${tierColor}40">
              <div class="ar-stat-val" style="color: ${tierColor}; text-shadow: 0 0 12px ${tierColor}80">${Math.round(dots)}</div>
              <div class="ar-stat-lbl">DOTS</div>
            </div>
          </div>

          <div class="ar-section-label">${ru ? 'Достижения' : 'Achievements'}</div>
          <div class="ar-achievements">
            ${ACHIEVEMENTS.map(a => {
              const unlocked = unlockedAch.has(a.id);
              return `
                <div class="ar-ach-card ${unlocked ? 'unlocked' : 'locked'}">
                  <div class="ar-ach-icon">${a.icon}</div>
                  <div class="ar-ach-title">${ru ? a.ru : a.en}</div>
                  <div class="ar-ach-status">${unlocked ? '<svg viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>'}</div>
                </div>`;
            }).join('')}
          </div>

          <div class="ar-name-editor" id="ar-stat-editor" style="display:none; position:absolute; inset:0; background:var(--c-bg-1); z-index:10; padding:16px;">
            <div class="ar-editor-card">
              <div class="ar-editor-label" id="ar-stat-label">Value</div>
              <input type="number" id="ar-stat-input" class="ar-name-input" value="0" step="0.1">
              <div class="ar-editor-actions" style="margin-top:24px">
                <button class="ar-btn-save" data-action="ar:saveStat">${ru ? 'Сохранить' : 'Save'}</button>
                <button class="ar-btn-cancel" data-action="ar:cancelStatEdit">${ru ? 'Отмена' : 'Cancel'}</button>
              </div>
            </div>
          </div>
          <div class="ar-name-editor" id="ar-name-editor" style="display:none; position:absolute; inset:0; background:var(--c-bg-1); z-index:10; padding:16px;">
            <div class="ar-editor-card">
              <div class="ar-editor-label">${ru ? 'Имя' : 'Name'}</div>
              <input type="text" id="ar-name-input" class="ar-name-input" value="${esc(name)}" maxlength="25">
              
              <div class="ar-editor-label" style="margin-top:16px">${ru ? 'Дата рождения' : 'Date of Birth'}</div>
              <input type="date" id="ar-dob-input" class="ar-name-input" value="${ctx.profile?.dob || ''}">
              
              <div class="ar-editor-label" style="margin-top:16px">${ru ? 'Пол' : 'Sex'}</div>
              <select id="ar-sex-input" class="ar-name-input" style="background:var(--c-bg-2); border:1px solid var(--c-border); color:var(--c-text-1); border-radius:12px; height:48px; padding:0 16px; width:100%; font-size:16px; margin-top:8px;">
                <option value="m" ${ctx.profile?.sex !== 'f' ? 'selected' : ''}>Male</option>
                <option value="f" ${ctx.profile?.sex === 'f' ? 'selected' : ''}>Female</option>
              </select>
              
              <div class="ar-editor-colors-label" style="margin-top:16px">${ru ? 'Цвет аватара' : 'Avatar Color'}</div>
              <div class="ar-color-row">
                ${AVATAR_COLORS.map(([e, t], i) => `
                  <div class="ar-color-swatch ${i === (parseInt(ctx.colorIdx) || 0) ? 'active' : ''}"
                       style="background:linear-gradient(135deg, ${e}, ${t})"
                       data-action="ar:selectColor" data-i="${i}"></div>`).join('')}
              </div>

              <div class="ar-editor-colors-label" style="margin-top:16px">${ru ? 'Цвет рамки' : 'Frame Color'}</div>
              <div class="ar-color-row">
                ${FRAME_COLORS.map(([e, t], i) => `
                  <div class="ar-color-swatch ar-frame-swatch ${i === (parseInt(ctx.frameIdx) || 0) ? 'active' : ''}"
                       style="background:conic-gradient(from 0deg, ${e}, ${t}, ${e})"
                       data-action="ar:selectFrame" data-i="${i}"></div>`).join('')}
              </div>

              <div class="ar-editor-actions" style="margin-top:24px">
                <button class="ar-btn-save" data-action="ar:saveName">${ru ? 'Применить' : 'Apply'}</button>
                <button class="ar-btn-cancel" data-action="ar:cancelEdit">${ru ? 'Отмена' : 'Cancel'}</button>
              </div>
            </div>
          </div>
    `;
    setTimeout(initAvatar, 50);
  }

  function _renderMetricsTab(container, ctx) {
    const { ru } = ctx;
    container.innerHTML = `<div id="ar-body-stats-root" style="margin-top: -16px;"></div>`;
    import('../body-stats.js').then(mod => {
      const root = document.getElementById('ar-body-stats-root');
      if(root) {
        mod.renderBodyStats(root);
      }
    });
  }

  function editName() {
    const ed = document.getElementById('ar-name-editor');
    if (ed) ed.style.display = 'block';
    document.getElementById('ar-name-input')?.focus();
  }

  function cancelEdit() {
    const ed = document.getElementById('ar-name-editor');
    if (ed) ed.style.display = 'none';
  }

  let _currentStat = null;
  function editStat(type, val) {
    _currentStat = type;
    const ed = document.getElementById('ar-stat-editor');
    const lbl = document.getElementById('ar-stat-label');
    const inp = /** @type {HTMLInputElement} */ (document.getElementById('ar-stat-input'));
    if (!ed || !lbl || !inp) return;
    lbl.textContent = type === 'weight'
      ? (isRu() ? 'Вес (кг)' : 'Weight (kg)')
      : (isRu() ? 'Рост (см)' : 'Height (cm)');
    inp.value = val;
    ed.style.display = 'block';
    inp.focus();
  }

  function cancelStatEdit() {
    const ed = document.getElementById('ar-stat-editor');
    if (ed) ed.style.display = 'none';
    _currentStat = null;
  }

  async function saveStat() {
    haptic(15);
    const val = parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('ar-stat-input'))?.value);
    if (!val || val <= 0) { cancelStatEdit(); return; }
    
    const latest = await DB.Metrics.latest();
    const w = _currentStat === 'weight' ? val : (latest?.weight || 80);
    const h = _currentStat === 'height' ? val : (latest?.height || 180);
    
    await updateWeightAndHeight(w, h);
    cancelStatEdit();
    render();

    // UI Refresh
    if (window.Dashboard?.load) window.Dashboard.load();
    const sProfile = document.getElementById('s-profile');
    if (sProfile && sProfile.classList.contains('active')) {
      const { renderProfile } = await import('../profile.view.js');
      renderProfile(sProfile);
    }
    const statLbl = _currentStat === 'weight' ? (isRu() ? 'Вес' : 'Weight') : (isRu() ? 'Рост' : 'Height');
    window.Toast?.show(isRu() ? `${statLbl} обновлён` : `${statLbl} updated`, 'success');
  }

  async function saveName() {
    const input = document.getElementById('ar-name-input');
    const dobInput = document.getElementById('ar-dob-input');
    const sexInput = document.getElementById('ar-sex-input');
    if (!input || !dobInput || !sexInput) return;
    
    const newName = input.value.trim();
    const dob = dobInput.value;
    const sex = sexInput.value;
    
    if (newName) {
      await DB.Settings.set('athlete-name', newName);
    }
    
    // We need to import updateProfile from profile.store.js to save dob/sex
    const { updateProfile } = await import('./profile.store.js');
    await updateProfile({ dob, sex, name: newName || undefined });
    
    cancelEdit();
    render();
    
    // Dispatch event so Passport updates
    window.dispatchEvent(new Event('ap-sync-status'));

    // UI Refresh
    const sProfile = document.getElementById('s-profile');
    if (sProfile && sProfile.classList.contains('active')) {
      const { renderProfile } = await import('../profile.view.js');
      renderProfile(sProfile);
    }
    window.Toast?.show(isRu() ? 'Имя обновлено' : 'Name updated', 'success');
  }

  async function cycleColor() {
    haptic(5);
    const curr = parseInt(await DB.Settings.get('avatar-color', '0')) || 0;
    await selectColor((curr + 1) % AVATAR_COLORS.length);
  }

  async function selectColor(idx) {
    haptic(10);
    await DB.Settings.set('avatar-color', String(idx));
    render();
    initAvatar();
  }

  async function selectFrame(idx) {
    haptic(10);
    await DB.Settings.set('avatar-frame', String(idx));
    render();
    initAvatar();
  }

  async function initAvatar() {
    const btn = document.getElementById('athlete-avatar-btn');
    if (!btn) return;
    const [colorIdx, photo, customName, profile] = await Promise.all([
      DB.Settings.get('avatar-color', '0'),
      DB.Settings.get('athlete-photo', null),
      DB.Settings.get('athlete-name', ''),
      loadProfile()
    ]);
    const [c1, c2] = AVATAR_COLORS[(parseInt(colorIdx) || 0) % AVATAR_COLORS.length];
    const name = customName || profile?.name || 'Athlete';
    const initials = name.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';

    if (photo) {
      btn.classList.add('has-photo');
      btn.style.setProperty('--avatar-img', `url(${photo})`);
      btn.style.background = '';
      const ini = document.getElementById('athlete-avatar-initials');
      if (ini) ini.style.display = 'none';
    } else {
      btn.classList.remove('has-photo');
      btn.style.removeProperty('--avatar-img');
      btn.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
      const ini = document.getElementById('athlete-avatar-initials');
      if (ini) {
        ini.style.display = 'block';
        ini.textContent = initials;
      }
    }
  }

  function triggerPhotoUpload() {
    document.getElementById('ar-photo-input')?.click();
  }

  
  function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result;
      if (base64) {
        _openCropModal(base64);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }

  function _openCropModal(base64) {
    const ru = isRu();
    
    const modal = document.createElement('div');
    modal.className = 'ar-crop-modal';
    modal.innerHTML = `
      <div class="ar-crop-card">
        <div class="ar-crop-header">
          <div class="ar-crop-title">${ru ? 'Масштаб и положение' : 'Scale and position'}</div>
        </div>
        <div class="ar-crop-view-container">
          <div class="ar-crop-mask"></div>
          <img id="ar-crop-img" class="ar-crop-img" src="${base64}" draggable="false">
        </div>
        <div class="ar-crop-controls">
          <div class="ar-crop-zoom-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>${ru ? 'Масштаб' : 'Zoom'}</span>
          </div>
          <input type="range" id="ar-crop-zoom" min="1" max="4" step="0.05" value="1" class="ar-crop-slider">
        </div>
        <div class="ar-crop-actions">
          <button class="ar-btn-save" id="ar-crop-apply">${ru ? 'Применить' : 'Apply'}</button>
          <button class="ar-btn-cancel" id="ar-crop-cancel">${ru ? 'Отмена' : 'Cancel'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const img = modal.querySelector('#ar-crop-img');
    const zoomSlider = modal.querySelector('#ar-crop-zoom');
    const btnApply = modal.querySelector('#ar-crop-apply');
    const btnCancel = modal.querySelector('#ar-crop-cancel');

    let scale = 1, tx = 0, ty = 0;
    let isDragging = false, startX = 0, startY = 0;
    const BOX_SIZE = 180; // Size of the mask box

    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio > 1) {
        img.height = BOX_SIZE;
        img.width = BOX_SIZE * ratio;
      } else {
        img.width = BOX_SIZE;
        img.height = BOX_SIZE / ratio;
      }
      img.style.width = img.width + 'px';
      img.style.height = img.height + 'px';
      _updateTransform();
    };

    function _updateTransform() {
      img.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    const onPointerDown = (e) => {
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX - tx;
      startY = clientY - ty;
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      tx = clientX - startX;
      ty = clientY - startY;
      _updateTransform();
    };

    const onPointerUp = () => { isDragging = false; };

    img.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    img.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    zoomSlider.addEventListener('input', (e) => {
      scale = parseFloat(e.target.value);
      _updateTransform();
    });

    const cleanup = () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      modal.remove();
    };

    btnCancel.onclick = cleanup;

    btnApply.onclick = async () => {
      const rectImg = img.getBoundingClientRect();
      const rectMask = img.parentElement.getBoundingClientRect();
      // Center of mask
      const cx = rectMask.left + rectMask.width / 2;
      const cy = rectMask.top + rectMask.height / 2;

      // Offset of mask top-left relative to image top-left
      const offX = (cx - BOX_SIZE / 2) - rectImg.left;
      const offY = (cy - BOX_SIZE / 2) - rectImg.top;

      // Calculate scale of natural image vs rendered image bounds
      const scaleX = img.naturalWidth / rectImg.width;
      const scaleY = img.naturalHeight / rectImg.height;

      const sx = offX * scaleX;
      const sy = offY * scaleY;
      const sWidth = BOX_SIZE * scaleX;
      const sHeight = BOX_SIZE * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, 400, 400);
        const finalBase64 = canvas.toDataURL('image/jpeg', 0.9);
        await DB.Settings.set('athlete-photo', finalBase64);
        render();
        initAvatar();
        
        // Dynamic UI Refresh
        if (window.Dashboard?.load) window.Dashboard.load();
        const sProfile = document.getElementById('s-profile');
        if (sProfile && sProfile.classList.contains('active')) {
          const { renderProfile } = await import('../profile.view.js');
          renderProfile(sProfile);
        }
      }
      cleanup();
    };
  }


  async function removePhoto() {
    await DB.Settings.set('athlete-photo', null);
    render();
    initAvatar();
  }

  function _initSheetDrag() {
    const sheet = _overlay?.querySelector('.ar-sheet');
    if (!sheet) return;
    let startY = 0, currentY = 0;
    sheet.addEventListener('touchstart', (e) => {
      if (sheet.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (sheet.scrollTop > 0) return;
      currentY = e.touches[0].clientY - startY;
      if (currentY > 0) sheet.style.transform = `translateY(${currentY}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      sheet.style.transition = '';
      if (currentY > 120) close();
      else sheet.style.transform = '';
      currentY = 0;
    });
  }

  return { open, close, switchTab, editName, cancelEdit, saveName, cycleColor, selectColor, selectFrame, initAvatar, triggerPhotoUpload, handlePhotoSelected, removePhoto, editStat, cancelStatEdit, saveStat };
})();
