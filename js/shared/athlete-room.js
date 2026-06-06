// @ts-check
import { DB } from '../db.js';
import { dotsScore } from '../strength-engine.js';
import { loadProfile, updateProfile } from '../profile.store.js';

// Helper variables and definitions extracted from compiled bundle
const S = DB;
const ut = loadProfile;
const dt = updateProfile;
const _t = dotsScore;

const $ = [
  ["#4f46e5", "#06b6d4"],
  ["#10b981", "#059669"],
  ["#f59e0b", "#d97706"],
  ["#ec4899", "#be185d"],
  ["#8b5cf6", "#6d28d9"]
];

function Ct(workouts) {
  if (!workouts.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  let streak = 0;
  const current = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(current.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dates.has(key)) {
      streak++;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function wt(workouts) {
  if (workouts.length < 9) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeks = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / (7 * 86400000));
  }));
  let activeWeeks = 0;
  for (let i = 0; i < 5; i++) {
    const weekKey = Math.floor(today.getTime() / (7 * 86400000)) - i;
    if (weeks.has(weekKey)) {
      activeWeeks++;
    } else if (i > 0) {
      break;
    }
  }
  return activeWeeks >= 3;
}

const TIER_COLOR = {
  Untrained: "#78909c",
  Novice: "#26a69a",
  Intermediate: "#f59e0b",
  Advanced: "#7c3aed",
  Elite: "#ff6d00"
};

const TIER_RU = {
  Untrained: "Новичок",
  Novice: "Начинающий",
  Intermediate: "Средний",
  Advanced: "Продвинутый",
  Elite: "Элита"
};

const Tt = TIER_COLOR;
const Et = TIER_RU;

function Dt(dots) {
  if (!dots || dots < 200) return "Untrained";
  if (dots < 300) return "Novice";
  if (dots < 380) return "Intermediate";
  if (dots < 470) return "Advanced";
  return "Elite";
}

const St = [
  { id: "first_workout", icon: "1st", ru: "Первая тренировка", en: "First Workout", check: w => w.length >= 1 },
  { id: "five_workouts", icon: "5x", ru: "5 тренировок", en: "5 Workouts", check: w => w.length >= 5 },
  { id: "ten_workouts", icon: "10x", ru: "10 тренировок", en: "10 Workouts", check: w => w.length >= 10 },
  { id: "fifty_workouts", icon: "50x", ru: "50 тренировок", en: "50 Workouts", check: w => w.length >= 50 },
  { id: "streak_7", icon: "7D", ru: "7 дней подряд", en: "7-Day Streak", check: w => Ct(w) >= 7 },
  { id: "tonne_club", icon: "1T", ru: "1 тонна за сессию", en: "1 Tonne Session", check: w => w.some(s => s.tonnage >= 1000) },
  { id: "push_master", icon: "PM", ru: "Мастер жима", en: "Push Master", check: w => w.filter(s => s.type === "push").length >= 10 },
  { id: "consistency", icon: "3W", ru: "3 недели без пропусков", en: "3 Weeks Consistent", check: w => wt(w) }
];

const Ot = [
  { key: "bench", tests: [/barbell bench press/i, /bench press/i] },
  { key: "squat", tests: [/barbell back squat/i, /back squat/i] },
  { key: "deadlift", tests: [/deadlift \(conventional\)/i, /deadlift/i] },
  { key: "ohp", tests: [/overhead press/i, /\bohp\b/i] }
];

function kt(oneRMs) {
  const best = {};
  for (const item of oneRMs) {
    for (const { key, tests } of Ot) {
      if (tests.some(t => t.test(item.id))) {
        if (!best[key] || item.value > best[key]) {
          best[key] = item.value;
        }
        break;
      }
    }
  }
  return best;
}

export const AthleteRoom = (() => {
  let e=null;async function t(){e=document.getElementById(`athlete-room`),e&&(e.innerHTML=`<div class="ar-loader"></div>`,e.classList.add(`open`),document.body.style.overflow=`hidden`,await r())}function n(){let t=e||document.getElementById(`athlete-room`);t&&(t.classList.remove(`open`),document.body.style.overflow=``,setTimeout(()=>{t.innerHTML=``},350))}async function r(){let[t,n,r,i,a,o,s,c]=await Promise.all([S.Workouts.getAll().catch(()=>[]),S.OneRM.getAll().catch(()=>[]),S.Settings.get(`athlete-name`).catch(()=>``),S.Settings.get(`avatar-color`).catch(()=>`0`),S.Settings.get(`lang`).catch(()=>`en`),ut().catch(()=>null),S.Metrics.latest().catch(()=>null),S.Settings.get(`athlete-photo`).catch(()=>null)]),l=a===`ru`,u=r||o?.name||(l?`Атлет`:`Athlete`),[d,f]=$[(parseInt(i||`0`)||0)%$.length],p=u.split(` `).map(e=>e[0]).filter(Boolean).slice(0,2).join(``).toUpperCase()||`A`,h=s?.weight||80,g=kt(n),_=(g.squat||0)+(g.bench||0)+(g.deadlift||0),v=_?_t({total:_,bodyweight:h,sex:o?.sex||`m`}):0,y=Dt(v),b=Tt[y],x=l?Et[y]:y,C=Ct(t);Math.round(t.reduce((e,t)=>e+(t.tonnage||0),0)/1e3),Math.round(t.reduce((e,t)=>e+(t.duration||0),0)/3600),[...n].sort((e,t)=>t.value-e.value).slice(0,5),t.filter(e=>e.type===`push`).length,t.filter(e=>e.type===`pull`).length,t.filter(e=>e.type===`legs`).length;let ee=new Set(St.filter(e=>e.check(t)).map(e=>e.id));e.innerHTML=`
    <div class="ar-sheet">

      <!-- Header -->
      <div class="ar-header">
        <button class="ar-back-btn" onclick="window.AthleteRoom.close()" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 5 5 12 12 19"/>
          </svg>
        </button>
        <div class="ar-header-title">${l?`Кабинет Атлета`:`Athlete Room`}</div>
        <div style="width:38px"></div>
      </div>

      <!-- Hero -->
      <div class="ar-hero">
        <div class="ar-avatar ${c?`has-photo`:``}"
             style="background: linear-gradient(135deg, ${d}, ${f})"
             id="ar-avatar" onclick="window.AthleteRoom.cycleColor()">
          ${c?`<div class="ar-avatar-photo" style="background-image: url(${c})"></div>`:``}
          <span class="ar-avatar-initials" id="ar-initials">${c?``:p}</span>
          <div class="ar-avatar-ring" style="--c1:${d};--c2:${f}"></div>
          <button class="ar-avatar-upload-overlay" onclick="event.stopPropagation(); window.AthleteRoom.triggerPhotoUpload();" aria-label="Upload Photo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </div>
        <div class="ar-hero-info">
          <div class="ar-name-wrap" id="ar-name-wrap">
            <div class="ar-name" id="ar-name-display" onclick="window.AthleteRoom.editName()">${u}</div>
            <button class="ar-edit-btn" onclick="window.AthleteRoom.editName()" aria-label="Edit name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" width="14" height="14">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
          <div class="ar-level-badge" style="--lc:${b}; border-color:${b}30; background:${b}15">
            <span class="ar-level-dot" style="background:${b}"></span>
            ${x.toUpperCase()}${v?` • ${v}`:``}
          </div>
          <div class="ar-streak-mini">
            ${C} ${l?C===1?`день`:C<5?`дня`:`дней`:`day`+(C===1?``:`s`)} ${l?`подряд`:`streak`}
          </div>
        </div>
      </div>

      <!-- Name editor -->
      <div class="ar-name-editor" id="ar-name-editor" style="display:none">
        <div class="ar-editor-card">
          <div class="ar-editor-label">${l?`Имя`:`Name`}</div>
          <input type="text" id="ar-name-input" class="ar-name-input" value="${u}" maxlength="25">
          
          <div class="ar-editor-photo">
            <div class="ar-editor-photo-label">${l?`Фото профиля`:`Profile Photo`}</div>
            <div class="ar-photo-actions">
              <button class="ar-btn-photo-upload" onclick="window.AthleteRoom.triggerPhotoUpload()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <span>${l?`Загрузить`:`Upload`}</span>
              </button>
              ${c?`
              <button class="ar-btn-photo-remove" onclick="window.AthleteRoom.removePhoto()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                </svg>
                <span>${l?`Удалить`:`Remove`}</span>
              </button>`:``}
            </div>
          </div>

          <div class="ar-editor-colors-label">${l?`Цвет аватара`:`Avatar Color`}</div>
          <div class="ar-color-row">
            ${$.map(([e,t],n)=>`<div class="ar-color-swatch ${n===parseInt(i||`0`)?`active`:``}" style="background:linear-gradient(135deg, ${e}, ${t})" onclick="window.AthleteRoom.selectColor(${n})"></div>`).join(``)}
          </div>

          <div class="ar-editor-actions">
            <button class="ar-btn-save" onclick="window.AthleteRoom.saveName()">${l?`Применить`:`Apply`}</button>
            <button class="ar-btn-cancel" onclick="window.AthleteRoom.cancelEdit()">${l?`Отмена`:`Cancel`}</button>
          </div>
        </div>
      </div>

      <!-- Achievements -->
      <div class="ar-section-label" style="margin-top:20px">${l?`Достижения`:`Achievements`} <span class="ar-ach-count">${ee.size}/${St.length}</span></div>
      <div class="ar-achievements">
        ${St.map(e=>{let t=ee.has(e.id);return`
          <div class="ar-ach-card ${t?`unlocked`:`locked`}">
            <div class="ar-ach-icon">${e.icon}</div>
            <div class="ar-ach-title">${l?e.ru:e.en}</div>
            <div class="ar-ach-status">
              ${t?`
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>`:`
                <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10"/>
                </svg>`}
            </div>
          </div>`}).join(``)}
      </div>

      <div style="height:40px"></div>
    </div>
    
    <!-- Hidden file input -->
    <input type="file" id="ar-photo-input" accept="image/*" style="display:none" onchange="window.AthleteRoom.handlePhotoSelected(event)">`,m()}function i(){document.getElementById(`ar-name-editor`).style.display=`block`,document.getElementById(`ar-name-input`)?.focus()}function a(){document.getElementById(`ar-name-editor`).style.display=`none`}async function o(){let e=document.getElementById(`ar-name-input`)?.value?.trim();if(!e){a();return}await S.Settings.set(`athlete-name`,e),await dt({name:e}).catch(()=>{}),document.getElementById(`ar-name-display`).textContent=e;let t=e.split(` `).map(e=>e[0]).filter(Boolean).slice(0,2).join(``).toUpperCase()||`A`;if(!await S.Settings.get(`athlete-photo`).catch(()=>null)){let e=document.getElementById(`ar-initials`);e&&(e.textContent=t)}let n=document.getElementById(`athlete-avatar-initials`);n&&(n.textContent=t);a();window.Profile?.load?.();}async function s(){await c((parseInt(await S.Settings.get(`avatar-color`).catch(()=>`0`)||`0`)+1)%$.length)}async function c(e){await S.Settings.set(`avatar-color`,String(e));let[t,n]=$[e%$.length],r=document.getElementById(`ar-avatar`),i=await S.Settings.get(`athlete-photo`).catch(()=>null);r&&!i&&(r.style.background=`linear-gradient(135deg, ${t}, ${n})`);let a=r?.querySelector(`.ar-avatar-ring`);a&&(a.style.setProperty(`--c1`,t),a.style.setProperty(`--c2`,n)),await l(e),document.querySelectorAll(`.ar-color-swatch`).forEach((t,n)=>{t.classList.toggle(`active`,n===e)})}async function l(e){let t=document.getElementById(`athlete-avatar-btn`);if(!t)return;let n=e??parseInt(await S.Settings.get(`avatar-color`).catch(()=>`0`)||`0`),[r,i]=$[isNaN(n)?0:n%$.length],a=await S.Settings.get(`athlete-photo`).catch(()=>null),o=document.getElementById(`athlete-avatar-initials`);a?(t.classList.add(`has-photo`),t.style.setProperty(`--avatar-img`,`url(${a})`),t.style.background=``,o&&(o.style.display=`none`)):(t.classList.remove(`has-photo`),t.style.removeProperty(`--avatar-img`),t.style.background=`linear-gradient(135deg, ${r}, ${i})`,o&&(o.style.display=``))}async function u(){let[e,t]=await Promise.all([S.Settings.get(`athlete-name`).catch(()=>null),S.Settings.get(`avatar-color`).catch(()=>null)]),n=(e||`A`).split(` `).map(e=>e[0]).filter(Boolean).slice(0,2).join(``).toUpperCase()||`A`,r=document.getElementById(`athlete-avatar-initials`);r&&(r.textContent=n),await l(parseInt(t||`0`)||0)}function d(){let e=document.getElementById(`ar-photo-input`);e&&e.click()}function f(e){let t=e.target?.files?.[0];if(!t)return;if(!t.type.startsWith(`image/`)){alert(`Please select an image file`);return}let n=new FileReader;n.onload=async function(e){let t=new Image;t.onload=function(){S.Settings.get(`lang`,`en`).then(n=>{let i=n===`ru`,a=document.createElement(`div`);a.className=`ar-crop-modal`,a.innerHTML=`
            <div class="ar-crop-card">
              <div class="ar-crop-header">
                <div class="ar-crop-title">${i?`Масштаб и положение`:`Scale and position`}</div>
              </div>
              <div class="ar-crop-view-container">
                <div class="ar-crop-mask"></div>
                <img id="ar-crop-img" class="ar-crop-img" src="${e.target.result}" draggable="false">
              </div>
              <div class="ar-crop-controls">
                <div class="ar-crop-zoom-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <span>${i?`Масштаб`:`Zoom`}</span>
                </div>
                <input type="range" id="ar-crop-zoom" min="1" max="4" step="0.05" value="1" class="ar-crop-slider">
              </div>
              <div class="ar-crop-actions">
                <button class="ar-btn-save" id="ar-crop-apply">${i?`Применить`:`Apply`}</button>
                <button class="ar-btn-cancel" id="ar-crop-cancel">${i?`Отмена`:`Cancel`}</button>
              </div>
            </div>
          `,document.body.appendChild(a);let o=a.querySelector(`#ar-crop-img`),s=a.querySelector(`#ar-crop-zoom`),c=a.querySelector(`#ar-crop-apply`),l=a.querySelector(`#ar-crop-cancel`),d=1,f=0,p=0,m=!1,h=0,g=0;o.onload=function(){let e=o.naturalWidth/o.naturalHeight;e>1?(o.height=180,o.width=180*e):(o.width=180,o.height=180/e),o.style.width=o.width+`px`,o.style.height=o.height+`px`,_()};function _(){o.style.transform=`translate(-50%, -50%) translate(${f}px, ${p}px) scale(${d})`}let v=e=>{m=!0;let t=e.touches?e.touches[0].clientX:e.clientX,n=e.touches?e.touches[0].clientY:e.clientY;h=t-f,g=n-p},y=e=>{if(!m)return;let t=e.touches?e.touches[0].clientX:e.clientX,n=e.touches?e.touches[0].clientY:e.clientY;f=t-h,p=n-g,_()},b=()=>{m=!1};o.addEventListener(`mousedown`,v),window.addEventListener(`mousemove`,y),window.addEventListener(`mouseup`,b),o.addEventListener(`touchstart`,v,{passive:!0}),window.addEventListener(`touchmove`,y,{passive:!0}),window.addEventListener(`touchend`,b),s.addEventListener(`input`,e=>{d=parseFloat(e.target.value),_()}),l.onclick=function(){x()},c.onclick=function(){let e=o.getBoundingClientRect(),n=o.parentElement.getBoundingClientRect(),i=n.left+120,a=n.top+120,s=i-e.left,c=a-e.top,l=t.width/e.width,d=t.height/e.height,f=(s-180/2)*l,p=(c-180/2)*d,m=180*l,h=180*d,g=document.createElement(`canvas`);g.width=400,g.height=400;let _=g.getContext(`2d`);if(_){_.drawImage(t,f,p,m,h,0,0,400,400);let e=g.toDataURL(`image/jpeg`,.9);S.Settings.set(`athlete-photo`,e).then(()=>r()).then(()=>u()).catch(e=>console.error(`Failed to save cropped photo:`,e))}x()};function x(){window.removeEventListener(`mousemove`,y),window.removeEventListener(`mouseup`,b),window.removeEventListener(`touchmove`,y),window.removeEventListener(`touchend`,b),a.remove()}})},t.src=String(e.target?.result)},n.readAsDataURL(t)}async function p(){await S.Settings.set(`athlete-photo`,``),await r(),await u()}function m(){let t=e?.querySelector(`.ar-sheet`);if(!t)return;let r=0,i=0;t.addEventListener(`touchstart`,e=>{r=e.touches[0].clientY},{passive:!0}),t.addEventListener(`touchmove`,e=>{i=e.touches[0].clientY-r},{passive:!0}),t.addEventListener(`touchend`,()=>{i>80&&n(),i=0},{passive:!0})}return{open:t,close:n,editName:i,cancelEdit:a,saveName:o,cycleColor:s,selectColor:c,initAvatar:u,triggerPhotoUpload:d,handlePhotoSelected:f,removePhoto:p}
})();
