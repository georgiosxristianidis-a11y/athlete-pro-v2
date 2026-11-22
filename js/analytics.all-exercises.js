// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.all-exercises.js — вход «Все упражнения» (ANL-A11)

   Карточки Stats режут список по лимиту (топ по числу сессий, при равенстве —
   по давности). При `stats-families` OFF полного списка не было вовсе: упражнение
   вне топа было недостижимо. Лист даёт тот же список целиком; тап по строке
   открывает историю упражнения тем же `analytics:openExercise`, что и карточка.
   ════════════════════════════════════════════════════════ */

import { html, raw, dismissOverlay, haptic } from './shared/utils.js';
import { t, tri } from './locale.store.js';
import { fmtDate } from './shared/format.js';

/**
 * Лист со всеми упражнениями. Порядок — как отдал движок (сессии, давность, имя).
 * @param {Array<import('./analytics.progression-curves.js').ExerciseProgressionCurve>} curves
 */
export function openAllExercisesSheet(curves) {
  if (!curves.length) return;
  const rows = curves.map(
    (c) => html`
      <div class="orm-row" data-action="analytics:openExercise" data-exercise="${c.name}" role="button" tabindex="0">
        <div class="orm-name">${c.name}</div>
        <div class="an-allex-meta">${c.n} ${tri('сессий', 'sessions', 'προπονήσεις')}${c.lastTs ? ` · ${fmtDate(c.lastTs, { month: 'short', day: 'numeric' })}` : ''}</div>
      </div>`
  );

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay sd-overlay ex-history-overlay';
  overlay.style.zIndex = '4000';
  overlay.insertAdjacentHTML(
    'beforeend',
    html`
    <div class="modal-sheet ex-history-sheet">
      <div class="modal-handle"></div>
      <div class="ex-history-head">
        <div class="ex-head-info">
          <div class="ex-history-title">${tri('Все упражнения', 'All exercises', 'Όλες οι ασκήσεις')}</div>
          <div class="an-allex-sub">${curves.length} ${tri('упражнений · нажми — история', 'exercises · tap for history', 'ασκήσεις · πάτα για ιστορικό')}</div>
        </div>
        <button class="btn-icon-sm" data-allex-close aria-label="${t('journal.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      ${raw(rows.join(''))}
    </div>`
  );
  document.body.appendChild(overlay);
  const close = () => dismissOverlay(overlay);
  overlay.querySelector('[data-allex-close]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  haptic(10);
}
