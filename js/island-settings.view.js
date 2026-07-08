// @ts-check
/* ════════════════════════════════════════════════════════
   island-settings.view.js — Island Settings screen (ISL-SET)
   ────────────────────────────────────────────────────────
   Reached by long-pressing the Dynamic Island (or the status-bar
   privacy indicator). Hosts the privacy mode controls — the single
   home for privacy, moved out of the Profile screen.
   Privacy action handlers live in privacy.view.js (wired on import).
   ════════════════════════════════════════════════════════ */

import { renderPrivacyCard } from './privacy.view.js';
import { isRu } from './locale.store.js';
import { flag } from './flags.js';
import { getIslandProfile, setIslandProfile } from './island-profile.store.js';
import { on } from './events.js';

// Profile switch → persist + re-render this screen and the live island.
on('island:setProfile', (el) => {
  setIslandProfile(el.dataset.profile);
  loadIslandSettings();
  window.DynamicIsland?.update();
  navigator.vibrate?.(8);
});

const PROFILES = [
  { id: 'minimal', en: 'Minimal', ru: 'Минимал',
    descEn: 'DHL chamber navigation — a thin near-black strip, air over panel.',
    descRu: 'DHL-навигация по камерам — тонкая полоска, воздух вместо панели.' },
  { id: 'apple', en: 'Classic', ru: 'Классик',
    descEn: 'Apple-style two-state pill: exercise name and set count.',
    descRu: 'Двухсостоянийная капсула Apple: имя упражнения и счёт сетов.' },
];

/** Island-profile selector card — only meaningful when the feature is enabled. */
function renderProfileCard(ru) {
  if (!flag('island-profiles')) return '';
  const cur = getIslandProfile();
  const active = PROFILES.find(p => p.id === cur) || PROFILES[0];
  return `
    <div class="section-header" style="margin-top:var(--sp-1)">
      <span class="section-label">${ru ? 'Профиль острова' : 'Island profile'}</span>
    </div>
    <div class="profile-card">
      <div class="privacy-segment" role="tablist" aria-label="${ru ? 'Профиль острова' : 'Island profile'}">
        ${PROFILES.map(p => `
          <button class="privacy-seg-btn ${p.id === cur ? 'active' : ''}"
                  data-profile="${p.id}" role="tab" aria-selected="${p.id === cur}"
                  data-action="island:setProfile">
            <span>${ru ? p.ru : p.en}</span>
          </button>`).join('')}
      </div>
      <div class="privacy-desc">${ru ? active.descRu : active.descEn}</div>
    </div>
  `;
}

/**
 * Render the Island Settings screen into #s-island-settings.
 */
export function loadIslandSettings() {
  const screen = document.getElementById('s-island-settings');
  if (!screen) return;
  const ru = isRu();

  screen.innerHTML = `
    <div class="screen-header" style="display:flex;align-items:center;gap:var(--sp-2)">
      <button class="btn-icon-sm" data-action="nav:back" aria-label="${ru ? 'Назад' : 'Back'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div>
        <div class="screen-title">${ru ? 'Остров' : 'Island'}</div>
        <div class="screen-sub">${ru ? 'Настройки и приватность' : 'Settings & privacy'}</div>
      </div>
    </div>

    ${renderProfileCard(ru)}
    ${renderPrivacyCard()}
  `;
}
