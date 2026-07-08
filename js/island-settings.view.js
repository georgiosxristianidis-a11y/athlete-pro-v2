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

    ${renderPrivacyCard()}
  `;
}
