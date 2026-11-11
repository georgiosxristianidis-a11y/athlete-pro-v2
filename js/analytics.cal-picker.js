// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.cal-picker.js — лист дня календаря Analytics
   Вынесен из analytics.view.js (потолок размера файла).
   ════════════════════════════════════════════════════════ */

import { esc, dismissOverlay } from './shared/utils.js';
import { t, tri } from './locale.store.js';
import { pplColor, PPL_TYPES } from './shared/ppl-color.js';
import {
  applyCalendarTypeTap,
  removeCalendarEntry,
  restoreCalendarEntry,
  calendarStubTimestamp,
} from './analytics.store.js';

/**
 * Лист дня календаря: смена типа, удаление пустой заглушки с «Вернуть», переход в журнал.
 * @param {number} year @param {number} month @param {number} day
 * @param {string} existingType @param {string|number|null} existingId @param {boolean} hasSets
 * @param {() => unknown} reload перерисовать экран после изменения
 */
export function openCalendarPicker(year, month, day, existingType, existingId, hasSets, reload) {
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const dateLabel = `${day} ${monthNames[month]} ${year}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay sd-overlay';
  overlay.style.zIndex = '4000';

  // ANL-A1: день с подходами не стирается — только смена типа и переход в журнал;
  // пустую заглушку можно убрать, а тост вернёт её.
  const removeBtn = !existingType
    ? ''
    : hasSets
      ? `<button class="cal-pick-remove cal-pick-journal" id="cal-pick-journal">${esc(tri('Открыть в журнале', 'Open in journal', 'Άνοιγμα στο ημερολόγιο'))}</button>`
      : `
    <button class="cal-pick-remove" id="cal-pick-rm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="14" height="14">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
      </svg>
      ${esc(tri('Убрать пустую запись', 'Remove empty entry', 'Αφαίρεση κενής εγγραφής'))}
    </button>`;

  overlay.innerHTML = `
    <!-- Инлайн padding-bottom снят: base.css .modal-sheet уже даёт ровно
         calc(var(--sp-3) + var(--safe-bottom)), инлайн повторял его сырым 20px. -->
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">Log Workout</div>
        <button class="btn-icon-sm" id="cal-pick-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="cal-pick-date">${dateLabel}</div>
      <div class="cal-pick-grid">
        ${PPL_TYPES.map(
          (t) => `
          <button class="cal-pick-btn ${existingType === t ? 'active' : ''}" data-type="${t}" style="--pick-color:${pplColor(t)}">
            <span class="cal-pick-dot" style="background:${pplColor(t)}"></span>
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`
        ).join('')}
      </div>
      ${removeBtn}
    </div>`;

  document.body.appendChild(overlay);

  const close = () => dismissOverlay(overlay);

  overlay.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      await applyCalendarTypeTap({
        existingId,
        type,
        timestamp: calendarStubTimestamp(year, month, day) ?? new Date(year, month, day, 12, 0, 0).getTime(),
      });
      close();
      reload();
      document.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { force: true } }));
    });
  });

  overlay.querySelector('#cal-pick-rm')?.addEventListener('click', async () => {
    const snapshot = await removeCalendarEntry(existingId);
    close();
    await reload();
    document.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { force: true } }));
    if (!snapshot) return;
    // UNDO-1: «Вернуть» — на 5 с, как у пропуска упражнения.
    window.Toast.show(tri('Запись убрана: ', 'Entry removed: ', 'Η εγγραφή αφαιρέθηκε: ') + dateLabel, 'info', 5000, {
      action: {
        label: t('train.undo'),
        onClick: async () => {
          await restoreCalendarEntry(snapshot);
          await reload();
          document.dispatchEvent(new CustomEvent('ap-sync-status', { detail: { force: true } }));
        },
      },
    });
  });

  overlay.querySelector('#cal-pick-journal')?.addEventListener('click', () => {
    close();
    window.Nav.go('s-journal');
  });

  overlay.querySelector('#cal-pick-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
