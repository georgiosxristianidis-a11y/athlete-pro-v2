'use strict';

/** @typedef {{ btnSelector?: string }} SegPillOpts */

const DEFAULT_BTN = ':scope > button';
const nextFrame =
  typeof requestAnimationFrame === 'function'
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(fn, 0);

/**
 * Sliding highlight for segmented controls — GPU-only (translateX + scaleX).
 * Host gets `.seg-pill-host`; pill width updates instantly, position morphs on compositor.
 *
 * @param {HTMLElement} host
 * @param {SegPillOpts} [opts]
 * @returns {() => void}
 */
export function initSegPill(host, opts = {}) {
  if (!host || host.dataset.segPillInit) return () => syncSegPill(host, opts);
  host.dataset.segPillInit = '1';
  host.classList.add('seg-pill-host');

  const pill = document.createElement('span');
  pill.className = 'seg-pill';
  pill.setAttribute('aria-hidden', 'true');
  host.append(pill);
  host._segPill = pill;

  const btnSelector = opts.btnSelector || DEFAULT_BTN;
  const sync = () => syncSegPill(host, opts);

  host.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest?.('button');
    if (btn && host.contains(btn)) nextFrame(sync);
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => sync());
    ro.observe(host);
    host.querySelectorAll(btnSelector).forEach((b) => ro.observe(b));
    host._segPillRO = ro;
  }

  nextFrame(sync);
  return sync;
}

/**
 * @param {HTMLElement} host
 * @param {SegPillOpts} [opts]
 */
export function syncSegPill(host, opts = {}) {
  const pill = host._segPill;
  if (!pill) return;

  const btnSelector = opts.btnSelector || DEFAULT_BTN;
  const buttons = [...host.querySelectorAll(btnSelector)];
  const active =
    host.querySelector(`${btnSelector}.active`) ||
    host.querySelector(`${btnSelector}[aria-selected="true"]`) ||
    buttons[0];
  if (!active) return;

  const x = active.offsetLeft;
  const w = active.offsetWidth;
  const prevW = parseFloat(host.style.getPropertyValue('--pill-w')) || w;

  host.style.setProperty('--pill-x', `${x}px`);
  host.style.setProperty('--pill-w', `${w}px`);

  if (Math.abs(prevW - w) > 0.5 && prevW > 0) {
    host.style.setProperty('--pill-sx', String(prevW / w));
    nextFrame(() => host.style.setProperty('--pill-sx', '1'));
  } else {
    host.style.setProperty('--pill-sx', '1');
  }

  pill.classList.remove('seg-pill--push', 'seg-pill--pull', 'seg-pill--legs');

  if (host.classList.contains('week-segment')) {
    const idx = buttons.indexOf(active);
    pill.classList.toggle('seg-pill--push', idx === 0);
    pill.classList.toggle('seg-pill--legs', idx === 1);
  } else if (host.classList.contains('plan-tabs')) {
    const type = active.dataset.type;
    pill.classList.toggle('seg-pill--push', type === 'push');
    pill.classList.toggle('seg-pill--pull', type === 'pull');
    pill.classList.toggle('seg-pill--legs', type === 'legs');
  }
}

/** @param {ParentNode} [root] */
export function mountSegPills(root = document) {
  root.querySelectorAll('.week-segment, .bs-tab-bar, .plan-tabs').forEach((host) => {
    delete (/** @type {HTMLElement} */ (host).dataset.segPillInit);
    initSegPill(/** @type {HTMLElement} */ (host));
  });
}
