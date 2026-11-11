// @ts-check
/* ════════════════════════════════════════════════════════
   ai-consent.view.js — экран согласия на ИИ (P0-AI-CONSENT)
   ────────────────────────────────────────────────────────
   Единственная дверь, через которую ИИ включается. Открывается только явным
   тапом по ИИ (чат, недельный отчёт, тумблер Профиля, ссылка в плашке
   локального режима) — никогда при запуске. «Не сейчас», бэкдроп и Esc = false;
   следующий раз — снова только по тапу (решение 3).

   Геометрия и моушн — общий `.confirm-overlay` (`js/shared/confirm.js`,
   `css/base.css`), здесь только содержимое шторки.
   ════════════════════════════════════════════════════════ */

import { esc, haptic } from './shared/utils.js';
import { t } from './locale.store.js';
import { getPrivacyMode, grantAiConsent } from './privacy.store.js';

/** 0.26s --ease-decel + запас на отрисовку — как SHEET_MS в confirm.js. */
const SHEET_MS = 350;

const ICONS = {
  history:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  text:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  photo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
};

/**
 * Можно ли вообще спросить: в airgap ИИ не включается (режимы не трогаем),
 * там точки ИИ молча уходят в локальные подсказки.
 */
export function canAskAiConsent() {
  return getPrivacyMode() !== 'airgap';
}

/**
 * @param {{ context?: 'chat'|'general' }} [opts]
 *   chat — подзаголовок «Ответ на вопрос уйдёт на сервер вместе с:»,
 *   general (отчёт, Профиль, плашка) — «На сервер уйдут:».
 * @returns {Promise<boolean>} true — согласие дано и ИИ включён.
 */
export function requestAiConsent({ context = 'general' } = {}) {
  if (!canAskAiConsent()) return Promise.resolve(false);
  return new Promise((resolve) => {
    document.querySelector('.ai-consent-overlay')?.remove();
    const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-overlay ai-consent-overlay';
    // Над оверлеями-вызывателями (паспорт 5000, сводка 7000) — как confirmDialog.
    overlay.style.zIndex = '9500';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ai-consent-title');
    const lead = context === 'chat' ? t('aiConsent.leadChat') : t('aiConsent.lead');
    const row = (icon, key) => `
          <li class="ai-consent-row">
            <span class="ai-consent-ico">${icon}</span>
            <span>${esc(t(key))}</span>
          </li>`;
    overlay.innerHTML = `
      <div class="modal-sheet confirm-sheet ai-consent-sheet" role="document">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title" id="ai-consent-title">${esc(t('aiConsent.title'))}</span>
        </div>
        <p class="ai-consent-lead">${esc(lead)}</p>
        <ul class="ai-consent-list">
          ${row(ICONS.history, 'aiConsent.itemHistory')}
          ${row(ICONS.text, 'aiConsent.itemText')}
          ${row(ICONS.photo, 'aiConsent.itemPhoto')}
        </ul>
        <p class="ai-consent-note">${esc(t('aiConsent.note'))}</p>
        <div class="confirm-actions ai-consent-actions">
          <button type="button" class="confirm-btn ai-consent-btn ai-consent-later" data-act="cancel">${esc(t('aiConsent.later'))}</button>
          <button type="button" class="confirm-btn ai-consent-btn ai-consent-ok" data-act="ok">${esc(t('aiConsent.enable'))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const okBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="ok"]'));
    const cancelBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="cancel"]'));

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      requestAnimationFrame(() => cancelBtn.focus());
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
        resolve(result);
      }, SHEET_MS);
    };

    // Capture + stopPropagation: _trapFocus в app.js снял бы оверлей без выхода.
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    okBtn.addEventListener('click', async () => {
      if (settled) return;
      okBtn.disabled = true;
      try {
        await grantAiConsent();
        haptic(10);
        finish(true);
      } catch {
        finish(false);
      }
    });
    cancelBtn.addEventListener('click', () => finish(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false);
    });
  });
}
