// @ts-check
/* ════════════════════════════════════════════════════════
   island-tracker.js — DHL-style 4-chamber journey marker for the
   Dynamic Island. 4 markers + 3 connecting lines. State semantics:
     past     — filled disc, full opacity
     current  — filled disc + outer pulse ring
     future   — filled disc, 30% opacity
     chamber 4 (Core) — ALWAYS open ring (diegetic: doesn't close
                       into DB); pulses only when current.
   Tap a marker → emits `chamber-jump` custom event with `{ idx }`.
   Optional violet accent (--c-secondary) for a unique navigation hue
   that's not tied to PPL session colour.
   Memory: design-2026-06-20-chambers-and-cool-steel.md
   ════════════════════════════════════════════════════════ */

const PPL_VAR = { push: 'var(--c-push)', pull: 'var(--c-pull)', legs: 'var(--c-legs)' };

/** Geometry inside the tracker zone (viewBox units = pixels at 1×). */
const W = 70, MARKER_Y = 8;
const SLOTS = [4, 23, 42, 61]; // 4 markers, equal spacing

/**
 * Render the DHL tracker into `mount`. Idempotent; pass `current = -1`
 * to render a "not started" state (all 4 future).
 *
 * @param {HTMLElement|null} mount
 * @param {object} opts
 * @param {number} opts.current  — chamber index 0..3 currently active (−1 = none).
 * @param {'push'|'pull'|'legs'} opts.sessionType
 * @param {boolean} [opts.violetAccent]  — override PPL with --c-secondary.
 * @param {{done:number,total:number}} [opts.progress]  — optional set count.
 * @param {string} [opts.label]  — optional inline label (e.g. chamber name).
 * @param {boolean} [opts.expanded]  — render compact (default) or with label.
 */
export function renderIslandTracker(mount, opts) {
  if (!mount) return;
  const { current, sessionType, violetAccent, progress, label, expanded } = opts;
  const color = violetAccent ? 'var(--c-secondary)' : (PPL_VAR[sessionType] || 'var(--c-chrome)');

  // Build 3 connecting lines based on state of bracketing markers.
  // Past→past: solid; past→current or current→future: half; future→future: dim.
  const lineState = (a, b) => {
    if (a < current && b <= current) return 'past';
    if (b > current && a >= current) return 'future';
    return 'transition';
  };

  const lines = [0, 1, 2].map(i => {
    const x1 = SLOTS[i] + 2.5, x2 = SLOTS[i + 1] - 2.5;
    const state = lineState(i, i + 1);
    const op = state === 'past' ? 1 : state === 'future' ? 0.2 : 0.45;
    const sw = state === 'past' ? 1.4 : 1;
    return `<line x1="${x1}" y1="${MARKER_Y}" x2="${x2}" y2="${MARKER_Y}" stroke="${color}" stroke-width="${sw}" opacity="${op}"/>`;
  }).join('');

  const markers = SLOTS.map((x, i) => {
    const isCore = i === 3;
    const isPast = i < current;
    const isCurrent = i === current;
    if (isCore) {
      const op = isCurrent ? 0.95 : 0.4;
      const pulse = isCurrent ? `<circle cx="${x}" cy="${MARKER_Y}" r="5" fill="none" stroke="${color}" stroke-width="0.7" opacity="0.5" class="it-pulse"/>` : '';
      return `${pulse}<circle cx="${x}" cy="${MARKER_Y}" r="3.2" fill="none" stroke="${color}" stroke-width="1.1" opacity="${op}" data-idx="3" class="it-marker"/>`;
    }
    if (isCurrent) {
      return `<circle cx="${x}" cy="${MARKER_Y}" r="5" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.55" class="it-pulse"/><circle cx="${x}" cy="${MARKER_Y}" r="2.8" fill="${color}" data-idx="${i}" class="it-marker"/>`;
    }
    if (isPast) {
      return `<circle cx="${x}" cy="${MARKER_Y}" r="2.5" fill="${color}" data-idx="${i}" class="it-marker"/>`;
    }
    return `<circle cx="${x}" cy="${MARKER_Y}" r="2.5" fill="${color}" opacity="0.3" data-idx="${i}" class="it-marker"/>`;
  }).join('');

  const labelTxt = expanded && label ? `<span class="it-label">${escTxt(label)}</span>` : '';
  const progTxt = expanded && progress ? `<span class="it-progress">${progress.done}/${progress.total}</span>` : '';

  mount.innerHTML = `
    <div class="it-wrap${expanded ? ' is-expanded' : ''}">
      <svg class="it-svg" viewBox="0 0 ${W} 16" width="${W}" height="16" role="img" aria-label="Chamber journey, ${current + 1} of 4">
        ${lines}${markers}
      </svg>
      ${labelTxt}${progTxt}
    </div>`;

  // Tap-to-jump: delegate clicks to emit a custom event the host can listen for.
  const svg = mount.querySelector('.it-svg');
  if (svg && !svg.__itWired) {
    svg.__itWired = true;
    svg.addEventListener('click', (e) => {
      const m = /** @type {SVGElement} */ (e.target).closest('.it-marker');
      if (!m) return;
      const idx = parseInt(m.getAttribute('data-idx') || '-1', 10);
      if (idx >= 0) mount.dispatchEvent(new CustomEvent('chamber-jump', { detail: { idx }, bubbles: true }));
    });
  }
}

function escTxt(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
