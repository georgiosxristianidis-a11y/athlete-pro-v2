// @ts-check
import { DB } from '../db.js';
import { dotsScore } from '../strength-engine.js';
import { loadProfile, updateProfile } from '../profile.store.js';

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

function _tierFromDots(dots) {
  if (!dots || dots < 200) return 'Untrained';
  if (dots < 300) return 'Novice';
  if (dots < 380) return 'Intermediate';
  if (dots < 470) return 'Advanced';
  return 'Elite';
}

export const AthleteRoom = (() => {
  let _overlay = null;

  async function open() {
    _overlay = document.getElementById('athlete-room');
    if (!_overlay) return;

    _overlay.innerHTML = `<div class="ar-loader"></div>`;
    _overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    await render();
  }

  function close() {
    if (!_overlay) return;
    _overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { _overlay.innerHTML = ''; }, 350);
  }

  async function render() {
    const [workouts, orms, customName, colorIdx, lang, profile, metrics, photo] = await Promise.all([
      DB.Workouts.getAll().catch(() => []),
      DB.OneRM.getAll().catch(() => []),
      DB.Settings.get('athlete-name', ''),
      DB.Settings.get('avatar-color', '0'),
      DB.Settings.get('lang', 'en'),
      loadProfile().catch(() => null),
      DB.Metrics.latest().catch(() => null),
      DB.Settings.get('athlete-photo', null)
    ]);

    const ru = lang === 'ru';
    const name = customName || profile?.name || (ru ? 'Атлет' : 'Athlete');
    const [c1, c2] = AVATAR_COLORS[(parseInt(colorIdx) || 0) % AVATAR_COLORS.length];
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
    const dots = total ? dotsScore({ total, bodyweight: weight, sex: profile?.sex || 'm' }) : 0;
    const tier = _tierFromDots(dots);
    const tierColor = TIER_COLOR[tier];
    const tierLabel = ru ? TIER_RU[tier] : tier;
    const streak = _calcStreak(workouts);

    const unlockedAch = new Set(ACHIEVEMENTS.filter(a => a.check(workouts)).map(a => a.id));

    _overlay.innerHTML = `
      <div class="ar-sheet">
        <div class="ar-header">
          <button class="ar-back-btn" onclick="window.AthleteRoom.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div class="ar-header-title">${ru ? 'Кабинет Атлета' : 'Athlete Room'}</div>
          <div style="width:38px"></div>
        </div>

        <div class="ar-hero">
          <div class="ar-avatar ${photo ? 'has-photo' : ''}" 
               style="background: linear-gradient(135deg, ${c1}, ${c2})"
               id="ar-avatar" onclick="window.AthleteRoom.cycleColor()">
            ${photo ? `<div class="ar-avatar-photo" style="background-image: url(${photo})"></div>` : ''}
            <span class="ar-avatar-initials">${photo ? '' : esc(initials)}</span>
            <div class="ar-avatar-ring" style="--c1:${c1};--c2:${c2}"></div>
            <button class="ar-avatar-upload-overlay" onclick="event.stopPropagation(); window.AthleteRoom.triggerPhotoUpload()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          </div>
          <div class="ar-hero-info">
            <div class="ar-name-wrap">
              <div class="ar-name" onclick="window.AthleteRoom.editName()">${esc(name)}</div>
              <button class="ar-edit-btn" onclick="window.AthleteRoom.editName()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            <div class="ar-level-badge" style="--lc:${tierColor}; border-color:${tierColor}30; background:${tierColor}15">
              <span class="ar-level-dot" style="background:${tierColor}"></span>
              ${tierLabel.toUpperCase()}${dots ? ` • ${dots}` : ''}
            </div>
            <div class="ar-streak-mini">${streak} ${ru ? (streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней') : 'day' + (streak === 1 ? '' : 's')} ${ru ? 'подряд' : 'streak'}</div>
          </div>
        </div>

        <div class="ar-name-editor" id="ar-name-editor" style="display:none">
          <div class="ar-editor-card">
            <div class="ar-editor-label">${ru ? 'Имя' : 'Name'}</div>
            <input type="text" id="ar-name-input" class="ar-name-input" value="${name}" maxlength="25">
            
            <div class="ar-editor-photo">
              <div class="ar-editor-photo-label">${ru ? 'Фото профиля' : 'Profile Photo'}</div>
              <div class="ar-photo-actions">
                <button class="ar-btn-photo-upload" onclick="window.AthleteRoom.triggerPhotoUpload()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  <span>${ru ? 'Загрузить' : 'Upload'}</span>
                </button>
                ${photo ? `<button class="ar-btn-photo-remove" onclick="window.AthleteRoom.removePhoto()"><span>${ru ? 'Удалить' : 'Remove'}</span></button>` : ''}
              </div>
            </div>

            <div class="ar-editor-colors-label">${ru ? 'Цвет аватара' : 'Avatar Color'}</div>
            <div class="ar-color-row">
              ${AVATAR_COLORS.map(([e, t], i) => `
                <div class="ar-color-swatch ${i === (parseInt(colorIdx) || 0) ? 'active' : ''}" 
                     style="background:linear-gradient(135deg, ${e}, ${t})" 
                     onclick="window.AthleteRoom.selectColor(${i})"></div>`).join('')}
            </div>

            <div class="ar-editor-actions">
              <button class="ar-btn-save" onclick="window.AthleteRoom.saveName()">${ru ? 'Применить' : 'Apply'}</button>
              <button class="ar-btn-cancel" onclick="window.AthleteRoom.cancelEdit()">${ru ? 'Отмена' : 'Cancel'}</button>
            </div>
          </div>
        </div>

        <div class="ar-section-label" style="margin-top:20px">${ru ? 'Достижения' : 'Achievements'} <span class="ar-ach-count">${unlockedAch.size}/${ACHIEVEMENTS.length}</span></div>
        <div class="ar-achievements">
          ${ACHIEVEMENTS.map(a => {
            const unlocked = unlockedAch.has(a.id);
            return `
              <div class="ar-ach-card ${unlocked ? 'unlocked' : 'locked'}">
                <div class="ar-ach-icon">${a.icon}</div>
                <div class="ar-ach-title">${ru ? a.ru : a.en}</div>
                <div class="ar-ach-status">${unlocked ? '✅' : '🔒'}</div>
              </div>`;
          }).join('')}
        </div>
        <div style="height:40px"></div>
      </div>
      <input type="file" id="ar-photo-input" accept="image/*" style="display:none" onchange="window.AthleteRoom.handlePhotoSelected(event)">
    `;
    _initSheetDrag();
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

  async function saveName() {
    const val = document.getElementById('ar-name-input')?.value?.trim();
    if (!val) { cancelEdit(); return; }
    await DB.Settings.set('athlete-name', val);
    await updateProfile({ name: val });
    cancelEdit();
    render();
    initAvatar();
  }

  async function cycleColor() {
    const curr = parseInt(await DB.Settings.get('avatar-color', '0')) || 0;
    await selectColor((curr + 1) % AVATAR_COLORS.length);
  }

  async function selectColor(idx) {
    await DB.Settings.set('avatar-color', String(idx));
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
    reader.onload = async (ev) => {
      const base64 = ev.target?.result;
      if (base64) {
        await DB.Settings.set('athlete-photo', base64);
        render();
        initAvatar();
      }
    };
    reader.readAsDataURL(file);
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

  return { open, close, editName, cancelEdit, saveName, cycleColor, selectColor, initAvatar, triggerPhotoUpload, handlePhotoSelected, removePhoto };
})();
