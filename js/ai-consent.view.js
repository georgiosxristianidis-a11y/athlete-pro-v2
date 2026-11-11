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

import { html, raw, haptic, listenerGroup } from './shared/utils.js';
import { tri } from './locale.store.js';
import { getPrivacyMode, getAiEnabled, grantAiConsent } from './privacy.store.js';

/** 0.26s --ease-decel + запас на отрисовку — как SHEET_MS в confirm.js. */
const SHEET_MS = 350;

/**
 * Тексты шторки живут здесь через tri(), а не в DICT: `js/locale.store.js` стоит на
 * потолке гигантов (`test/file-size-ratchet.test.js`), а читает их только этот модуль.
 */
const copy = () => ({
  title: tri('Включить ИИ-коуча?', 'Turn on the AI coach?', 'Ενεργοποίηση του AI προπονητή;'),
  leadChat: tri(
    'Ответ на вопрос уйдёт на сервер вместе с:',
    'Your question will be sent to the server along with:',
    'Η ερώτησή σου θα σταλεί στον διακομιστή μαζί με:'
  ),
  lead: tri('Запросы к ИИ уйдут на сервер вместе с:', 'The server will receive:', 'Στον διακομιστή θα σταλούν:'),
  itemHistory: tri('историей тренировок и замерами', 'workout history and measurements', 'ιστορικό προπονήσεων και μετρήσεις'),
  itemText: tri('текстом сообщений', 'the text of your messages', 'το κείμενο των μηνυμάτων σου'),
  itemPhoto: tri('фото, если приложено', 'a photo, if attached', 'φωτογραφία, αν επισυναφθεί'),
  note: tri(
    'Выключить можно в Профиле. Без ИИ подсказки считаются на устройстве.',
    'You can turn it off in Profile. Without AI, tips are computed on this device.',
    'Μπορείς να το απενεργοποιήσεις στο Προφίλ. Χωρίς AI οι συμβουλές υπολογίζονται στη συσκευή.'
  ),
  enable: tri('Включить ИИ', 'Turn on AI', 'Ενεργοποίηση AI'),
  later: tri('Не сейчас', 'Not now', 'Όχι τώρα'),
});

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
 * Дверь точки ИИ (чат, недельный отчёт): ИИ уже работает или режим airgap —
 * шторки нет, ответ false и точка идёт своим путём; иначе — шторка.
 * @param {'chat'|'general'} [context]
 * @returns {Promise<boolean>} true — согласие дано только что, точке пора перерисоваться.
 */
export function aiConsentDoor(context = 'general') {
  if (getAiEnabled() || !canAskAiConsent()) return Promise.resolve(false);
  return requestAiConsent({ context });
}

/**
 * Плашка локального режима Core: замок, подпись и (вне airgap) ссылка на шторку.
 * @param {string} label уже локализованная подпись «локальный режим»
 * @param {string} action data-action кнопки «Включить ИИ»
 */
export function aiLocalBannerHtml(label, action) {
  const enable = canAskAiConsent()
    ? html`<button type="button" class="intel-local-enable" data-action="${action}">${copy().enable}</button>`
    : '';
  return html`
      <div class="intel-local-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
          <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
        <span>${label}</span>
        ${raw(enable)}
      </div>`;
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
    const L = copy();
    const row = (icon, text) => html`
          <li class="ai-consent-row">
            <span class="ai-consent-ico">${raw(icon)}</span>
            <span>${text}</span>
          </li>`;
    // html`` экранирует интерполяции сам; insertAdjacentHTML — пустой узел, AUD-1.
    overlay.insertAdjacentHTML(
      'beforeend',
      html`
      <div class="modal-sheet confirm-sheet ai-consent-sheet" role="document">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title" id="ai-consent-title">${L.title}</span>
        </div>
        <p class="ai-consent-lead">${context === 'chat' ? L.leadChat : L.lead}</p>
        <ul class="ai-consent-list">
          ${raw(row(ICONS.history, L.itemHistory) + row(ICONS.text, L.itemText) + row(ICONS.photo, L.itemPhoto))}
        </ul>
        <p class="ai-consent-note">${L.note}</p>
        <div class="confirm-actions ai-consent-actions">
          <button type="button" class="confirm-btn ai-consent-btn ai-consent-later" data-act="cancel">${L.later}</button>
          <button type="button" class="confirm-btn ai-consent-btn ai-consent-ok" data-act="ok">${L.enable}</button>
        </div>
      </div>`
    );
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
      keys.release();
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
    // listenerGroup — одна точка снятия (LEAK-1); снимается в finish().
    const keys = listenerGroup(document);
    keys.add('keydown', onKey, true);

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
