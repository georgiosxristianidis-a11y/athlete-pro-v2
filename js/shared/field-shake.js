'use strict';

/**
 * Short horizontal shake for invalid fields — compositor-only (translateX).
 * Retriggerable via class toggle + reflow.
 *
 * @param {HTMLElement|null|undefined} el
 */
export function shakeField(el) {
  if (!el) return;
  el.classList.remove('is-shake');
  void el.offsetWidth;
  el.classList.add('is-shake');
  el.addEventListener('animationend', () => el.classList.remove('is-shake'), { once: true });
}
