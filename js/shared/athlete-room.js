// @ts-check
import { DB } from '../db.js';
import { dotsScore } from '../strength-engine.js';
import { loadProfile, updateProfile, updateWeightAndHeight } from '../profile.store.js';
import { esc, haptic } from './utils.js';

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

    const activeTab = window._arActiveTab || 'profile';

    _overlay.innerHTML = `
      <div class="ar-sheet">
        <div class="ar-header" style="flex-direction: column; align-items: flex-start; padding-bottom: 0;">
          <div style="display: flex; align-items: center; width: 100%; justify-content: space-between; margin-bottom: 16px;">
            <button class="ar-back-btn" onclick="window.AthleteRoom.close()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div style="font-weight: 700; font-size: 16px;">${ru ? 'Мой профиль' : 'Athlete Room'}</div>
            <div style="width: 44px;"></div> <!-- spacer -->
          </div>
          
          <div class="bs-tab-bar" style="margin-bottom: 0; width: 100%; border-bottom-left-radius: 0; border-bottom-right-radius: 0;">
            <button class="bs-tab ${activeTab === 'profile' ? 'active' : ''}" onclick="window.AthleteRoom.switchTab('profile')">${ru ? 'Профиль' : 'Profile'}</button>
            <button class="bs-tab ${activeTab === 'metrics' ? 'active' : ''}" onclick="window.AthleteRoom.switchTab('metrics')">${ru ? 'Замеры' : 'Body Metrics'}</button>
          </div>
        </div>

        <div class="ar-content" id="ar-tab-content" style="padding: 16px; overflow-y: auto; flex: 1;">
          <!-- Content injected by switchTab -->
        </div>
      </div>
    `;

    _initSheetDrag();
    await switchTab(activeTab, { workouts, name, initials, c1, c2, tierLabel, tierColor, streak, total, dots, unlockedAch, metrics, photo, ru });
  }

  async function switchTab(tabId, dataContext = null) {
    haptic(10);
    window._arActiveTab = tabId === 'settings' ? 'profile' : tabId; // Fallback if settings was active
    
    // Update active state in UI if overlay is open
    if (_overlay) {
      _overlay.querySelectorAll('.bs-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${window._arActiveTab}'`));
      });
    }

    const container = document.getElementById('ar-tab-content');
    if (!container) return;

    // Use passed context or fetch fresh if undefined
    let ctx = dataContext;
    if (!ctx) {
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

      ctx = { workouts, name, initials, c1, c2, colorIdx, tierLabel, tierColor, streak, total, dots, unlockedAch, metrics, photo, profile, ru };
    }

    if (window._arActiveTab === 'profile') {
      _renderProfileTab(container, ctx);
    } else if (window._arActiveTab === 'metrics') {
      _renderMetricsTab(container, ctx);
    }
  }

  function _renderProfileTab(container, ctx) {
    const { name, initials, c1, c2, tierLabel, tierColor, streak, total, dots, unlockedAch, photo, ru } = ctx;
    
    // Use the existing avatar init logic but wrap the HTML
    const avatarHtml = photo
      ? `<div class="ar-avatar has-photo" style="background-image: url('${photo}')" onclick="window.AthleteRoom.triggerPhotoUpload()">
           <div class="ar-avatar-ring" style="--c1:${c1}; --c2:${c2}"></div>
         </div>`
      : `<div class="ar-avatar" id="ar-avatar-circle" style="background: linear-gradient(135deg, ${c1}, ${c2})" onclick="window.AthleteRoom.cycleColor()">
           <div class="ar-avatar-ring" style="--c1:${c1}; --c2:${c2}"></div>
           <div class="ar-avatar-initials">${initials}</div>
         </div>`;

    container.innerHTML = `
          <div class="ar-passport">
            <div style="position:relative">
              ${avatarHtml}
              ${photo ? `<button class="ar-remove-photo" onclick="window.AthleteRoom.removePhoto(event)" title="Remove photo">&times;</button>` : ''}
              <input type="file" id="ar-photo-input" accept="image/jpeg, image/png, image/webp" style="display:none" onchange="window.AthleteRoom.handlePhotoSelected(event)">
            </div>
            
            <div class="ar-name" onclick="window.AthleteRoom.editName()">
              <span>${esc(name)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="opacity:0.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            
            <div class="ar-tier" style="color: ${tierColor}">
              <div class="ar-tier-dot" style="background: ${tierColor}; box-shadow: 0 0 8px ${tierColor};"></div>
              ${tierLabel}
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

          <div class="ar-name-editor" id="ar-name-editor" style="display:none; position:absolute; inset:0; background:var(--c-bg-1); z-index:10; padding:16px;">
            <div class="ar-editor-card">
              <div class="ar-editor-label">${ru ? 'Имя' : 'Name'}</div>
              <input type="text" id="ar-name-input" class="ar-name-input" value="${name}" maxlength="25">
              
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
                       onclick="window.AthleteRoom.selectColor(${i})"></div>`).join('')}
              </div>

              <div class="ar-editor-actions" style="margin-top:24px">
                <button class="ar-btn-save" onclick="window.AthleteRoom.saveName()">${ru ? 'Применить' : 'Apply'}</button>
                <button class="ar-btn-cancel" onclick="window.AthleteRoom.cancelEdit()">${ru ? 'Отмена' : 'Cancel'}</button>
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
    lbl.textContent = type === 'weight' ? 'Weight (kg)' : 'Height (cm)';
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
    window.Toast?.show(`${_currentStat === 'weight' ? 'Weight' : 'Height'} updated`, 'success');
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
    window.Toast?.show('Name updated', 'success');
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

  return { open, close, switchTab, editName, cancelEdit, saveName, cycleColor, selectColor, initAvatar, triggerPhotoUpload, handlePhotoSelected, removePhoto, editStat, cancelStatEdit, saveStat };
})();
