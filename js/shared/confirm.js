// @ts-check
import { Spring } from './spring.js';
import { esc } from './utils.js';

/**
 * Shared dark confirmation dialog — replaces native confirm().
 * Promise-based: resolves true on confirm, false on cancel / backdrop / ESC.
 *
 * Built on the same premium primitives as the rest of the app
 * (.modal-overlay / .modal-sheet from css/base.css + Spring physics),
 * so it stays visually consistent with bsPromptField and the workout modals.
 *
 * @param {Object} opts
 * @param {string} opts.title           - Short heading (already localized).
 * @param {string} [opts.message]       - Body text (already localized).
 * @param {string} [opts.confirmLabel]  - Confirm button label. Default 'Confirm'.
 * @param {string} [opts.cancelLabel]   - Cancel button label. Default 'Cancel'.
 * @param {boolean} [opts.danger]       - Red confirm button for destructive actions.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    // Only one confirm at a time — drop any stale instance.
    document.querySelector('.confirm-overlay')?.remove();

    const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal-sheet confirm-sheet" role="document">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">${esc(title)}</span>
        </div>
        ${message ? `<p class="confirm-msg">${esc(message)}</p>` : ''}
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-cancel" data-act="cancel">${esc(cancelLabel)}</button>
          <button type="button" class="confirm-btn confirm-ok${danger ? ' is-danger' : ''}" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const sheet = /** @type {HTMLElement} */ (overlay.querySelector('.confirm-sheet'));
    const okBtn = /** @type {HTMLElement} */ (overlay.querySelector('[data-act="ok"]'));
    const cancelBtn = /** @type {HTMLElement} */ (overlay.querySelector('[data-act="cancel"]'));

    // Spring entrance (matches bsPromptField).
    sheet.style.transform = 'translateY(100%)';
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      Spring.animate({
        from: 100, to: 0, stiffness: 200, damping: 20,
        onUpdate: (v) => { sheet.style.transform = `translateY(${v}%)`; }
      });
      // Destructive dialogs default to the safe (cancel) button.
      // Second rAF: focus only sticks once the element is painted past insert.
      requestAnimationFrame(() => (danger ? cancelBtn : okBtn).focus());
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.remove('visible');
      Spring.animate({
        from: 0, to: 100, stiffness: 250, damping: 25,
        onUpdate: (v) => { sheet.style.transform = `translateY(${v}%)`; },
        onComplete: () => {
          overlay.remove();
          if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
          resolve(result);
        }
      });
    };

    // Minimal focus trap: keep Tab cycling between the two buttons.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    okBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
  });
}
