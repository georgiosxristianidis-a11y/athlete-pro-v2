// @ts-check
import { Spring } from './spring.js';
import { esc } from './utils.js';
import { TextField } from '../ui/factory.js';

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

/**
 * Text-input dialog — the dark replacement for native prompt() (0-7).
 * Built on the same .modal-sheet + Spring as confirmDialog, with a TextField
 * from the UI factory. Resolves the trimmed string, or null on cancel / empty /
 * backdrop / ESC.
 *
 * @param {Object} opts
 * @param {string}  opts.title
 * @param {string} [opts.placeholder]
 * @param {string} [opts.value]
 * @param {string} [opts.confirmLabel]  Default 'OK'.
 * @param {string} [opts.cancelLabel]   Default 'Cancel'.
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, placeholder = '', value = '', confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return promptFieldsDialog({
    title,
    fields: [{ key: 'value', placeholder, value }],
    confirmLabel, cancelLabel,
  }).then((res) => (res ? (res.value || null) : null));
}

/**
 * Тот же диалог, но на несколько полей — «Зал» и «Страна» перед выгрузкой
 * журнала спрашиваются одним листом, а не двумя подряд.
 *
 * Отличие от `promptDialog` в трактовке пустого: одиночный prompt считает
 * пустую строку отменой (нечего сохранять), а здесь пустое поле — законный
 * ответ «не указывать», и подтверждение всё равно возвращает объект.
 * Отмена/ESC/бэкдроп → null.
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {Array<{ key: string, label?: string, placeholder?: string, value?: string }>} opts.fields
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.cancelLabel]
 * @returns {Promise<Record<string,string>|null>}
 */
export function promptFieldsDialog({ title, message = '', fields = [], confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    document.querySelector('.confirm-overlay')?.remove();
    const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal-sheet confirm-sheet" role="document">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">${esc(title)}</span>
        </div>
        ${message ? `<p class="confirm-msg">${esc(message)}</p>` : ''}
        <div class="confirm-field"></div>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-cancel" data-act="cancel">${esc(cancelLabel)}</button>
          <button type="button" class="confirm-btn confirm-ok" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const host = overlay.querySelector('.confirm-field');
    /** @type {Array<{ key: string, input: HTMLInputElement }>} */
    const inputs = fields.map((f) => {
      const el = TextField({ label: f.label || '', value: f.value || '', placeholder: f.placeholder || '' });
      host?.appendChild(el);
      return { key: f.key, input: el.inputEl };
    });
    const input = inputs[0]?.input;

    const sheet = /** @type {HTMLElement} */ (overlay.querySelector('.confirm-sheet'));
    const okBtn = /** @type {HTMLElement} */ (overlay.querySelector('[data-act="ok"]'));
    const cancelBtn = /** @type {HTMLElement} */ (overlay.querySelector('[data-act="cancel"]'));

    sheet.style.transform = 'translateY(100%)';
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      Spring.animate({ from: 100, to: 0, stiffness: 200, damping: 20, onUpdate: (v) => { sheet.style.transform = `translateY(${v}%)`; } });
      requestAnimationFrame(() => input?.focus());
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
    const submit = () => finish(Object.fromEntries(inputs.map(({ key, input: el }) => [key, el.value.trim()])));

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
  });
}
