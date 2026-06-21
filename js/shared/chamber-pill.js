// @ts-check
/* ════════════════════════════════════════════════════════
   js/shared/chamber-pill.js — Block header pill component
   
   Renders a single block/chamber header pill with:
   - PPL semantic dot
   - Block label (POWER · SHAPE · ARMS · CORE / WIDTH · THICKNESS)
   - Mode: 'active' (during workout) | 'completed' (in summary)
   - Optional chips: time string + tonnage string
   
   Contract:
     chamberPill({ label, color, mode, time?, tonnage? }) → string (HTML)
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {'active' | 'completed'} ChamberPillMode
 *
 * @typedef {Object} ChamberPillOptions
 * @property {string}            label    - Block label e.g. 'POWER', 'SHAPE', 'CORE'
 * @property {string}            color    - CSS color value (hex or CSS var string)
 * @property {ChamberPillMode}   [mode]   - Rendering context. Defaults to 'active'.
 * @property {string}            [time]   - Optional time chip text e.g. '12m'
 * @property {string}            [tonnage] - Optional tonnage chip text e.g. '3.2t'
 */

/**
 * Render a chamber block header pill as an HTML string.
 * Stateless — no side effects, safe to call in any context.
 *
 * @param {ChamberPillOptions} opts
 * @returns {string}
 */
export function chamberPill({ label, color, mode = 'active', time, tonnage }) {
  const isCompleted = mode === 'completed';

  // Dot: glowing dot with the PPL/block color
  const dot = `<span class="cpill-dot" style="background:${color};box-shadow:0 0 5px ${color}"></span>`;

  // Label
  const labelEl = `<span class="cpill-label cpill-label--${mode}">${label}</span>`;

  // Chips — only shown when data is provided
  const chips = (time || tonnage) ? `
    <span class="cpill-chips">
      ${time    ? `<span class="cpill-chip">${time}</span>`    : ''}
      ${tonnage ? `<span class="cpill-chip">${tonnage}</span>` : ''}
    </span>` : '';

  // Completion mark — shown in 'completed' mode
  const completeMark = isCompleted ? `
    <span class="cpill-done" aria-label="Complete">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" width="12" height="12">
        <polyline points="2.5 8.5 6 12 13.5 4.5"/>
      </svg>
    </span>` : '';

  return `
    <div class="cpill cpill--${mode}">
      <div class="cpill-left">
        ${dot}
        ${labelEl}
      </div>
      <div class="cpill-right">
        ${chips}
        ${completeMark}
      </div>
    </div>`.trim();
}

/**
 * Map a block identifier to a display label.
 * Covers PPL variants: power/shape/arms/core/width/thickness/glutes/quads/hamstrings
 *
 * @param {string} block
 * @returns {string}
 */
export function blockLabel(block) {
  const map = {
    power:      'POWER',
    shape:      'SHAPE',
    arms:       'ARMS',
    core:       'CORE',
    width:      'WIDTH',
    thickness:  'THICK',
    glutes:     'GLUTES',
    quads:      'QUADS',
    hamstrings: 'HAMS',
    align:      'ALIGN',
  };
  return map[block?.toLowerCase()] ?? block?.toUpperCase() ?? '—';
}
