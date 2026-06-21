// @ts-check
/* ════════════════════════════════════════════════════════
   chamber-pill.js — shared 4-chamber navigator pill
   Design lock 2026-06-20: chamber identity is geometric, not numeric
   and not coloured. PPL session colour tints the rim; the 4 shapes
   carry the role:
     ▣  solid square  → Heavy/Compound  (chamber 1)
     ▥  stacked bars  → Shape/Hypertrophy (chamber 2)
     ◆  diamond       → Accent muscle    (chamber 3)
     ○  open ring     → Core/UI-only     (chamber 4)
   Forms = constant grammar, color = current voice.
   See memory: design-2026-06-20-chambers-and-cool-steel.md
   ════════════════════════════════════════════════════════ */

import { esc } from './utils.js';

/** Map session type → PPL CSS var for rim colour. */
const PPL_VAR = { push: 'var(--c-push)', pull: 'var(--c-pull)', legs: 'var(--c-legs)' };

/** Glyph templates — token `__C__` replaced with the colour. Drawn at origin (0,0). */
const SHAPES = {
  square:  '<rect x="-6" y="-6" width="12" height="12" rx="1.5" fill="__C__"/>',
  bars:    '<g fill="__C__"><rect x="-6" y="-6" width="12" height="2.5" rx="1"/><rect x="-6" y="-1.25" width="12" height="2.5" rx="1"/><rect x="-6" y="3.5" width="12" height="2.5" rx="1"/></g>',
  diamond: '<polygon points="0,-7 7,0 0,7 -7,0" fill="__C__"/>',
  ring:    '<circle r="6.5" fill="none" stroke="__C__" stroke-width="1.6"/>',
};

/** Default shape order for the 4 chambers per session day. */
const DEFAULT_SHAPES = ['square', 'bars', 'diamond', 'ring'];

function glyph(shape, color) {
  return (SHAPES[shape] || SHAPES.square).replaceAll('__C__', color);
}

/**
 * Render the chamber pill into `mount`.
 *
 * @param {HTMLElement|null} mount
 * @param {object} opts
 * @param {Array<{name:string, shape?:string, uiOnly?:boolean, pr?:boolean}>} opts.chambers
 *   — Exactly 4 chamber descriptors. `name` is the contextual label
 *     ("Chest Power", "Back Width", etc.). `shape` defaults to
 *     square/bars/diamond/ring by index. `uiOnly:true` forces the
 *     open-ring glyph (Core). `pr:true` paints the chamber gold.
 * @param {'preview'|'mastery'|'completed'} opts.mode
 *   — preview: all 4 equal, glyph + label. mastery: active chamber
 *     expanded with progress bar, others collapsed to glyph + dim dot.
 *     completed: all 4 with ✓ overlay; PR chamber gets gold accent.
 * @param {'push'|'pull'|'legs'} opts.sessionType  — drives rim colour.
 * @param {number} [opts.active]  — chamber index 0..3 (mastery only).
 * @param {{done:number,total:number}} [opts.progress]  — for mastery bar.
 */
export function renderChamberPill(mount, opts) {
  if (!mount) return;
  const { chambers, mode, sessionType, active = 0, progress } = opts;
  if (!Array.isArray(chambers) || chambers.length !== 4) {
    mount.innerHTML = '';
    return;
  }

  const rimColor = PPL_VAR[sessionType] || 'var(--c-chrome)';
  const segments = chambers.map((ch, i) => {
    const shape = ch.uiOnly ? 'ring' : (ch.shape || DEFAULT_SHAPES[i]);
    const isActive = mode === 'mastery' && i === active;
    const isPR = mode === 'completed' && ch.pr;
    return _segment({ ch, i, shape, mode, isActive, isPR, sessionType, progress });
  });

  mount.innerHTML = `
    <div class="cp-pill cp-${mode}" style="--cp-rim:${rimColor}" role="tablist"
         aria-label="Chamber navigator, ${esc(sessionType)} session">
      ${segments.join('')}
    </div>`;
}

function _segment({ ch, i, shape, mode, isActive, isPR, sessionType, progress }) {
  // Cool Steel B: static glyphs use --c-chrome (palette-aligned silver) instead
  // of pure white — less shouting, matches the "polished steel" identity.
  // Active = PPL (data voice), PR = gold (celebration), mastery non-active =
  // text-3 (deliberately dimmed to push focus to the active chamber).
  const glyphColor = isPR ? 'var(--c-gold, #d4af37)'
                   : isActive ? PPL_VAR[sessionType]
                   : mode === 'mastery' ? 'var(--c-text-3)'
                   : 'var(--c-chrome)';
  const cls = [
    'cp-seg',
    isActive ? 'is-active' : '',
    ch.uiOnly ? 'is-core' : '',
    isPR ? 'is-pr' : '',
    mode === 'completed' ? 'is-done' : '',
  ].filter(Boolean).join(' ');

  // Mastery layout: active gets expanded label + progress bar; others compact.
  let body = '';
  if (mode === 'mastery' && isActive) {
    const pct = progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;
    body = `
      <div class="cp-glyph"><svg viewBox="-12 -12 24 24" width="20" height="20" aria-hidden="true">${glyph(shape, glyphColor)}</svg></div>
      <div class="cp-meta">
        <div class="cp-name">${esc(ch.name)}</div>
        <div class="cp-progress" aria-hidden="true">
          <div class="cp-progress-track"></div>
          <div class="cp-progress-fill" style="width:${pct}%; background:${PPL_VAR[sessionType]}"></div>
        </div>
        ${progress ? `<div class="cp-progress-text">${progress.done} / ${progress.total}</div>` : ''}
      </div>`;
  } else if (mode === 'preview') {
    body = `
      <div class="cp-glyph"><svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">${glyph(shape, glyphColor)}</svg></div>
      <div class="cp-name cp-name-stack">${esc(ch.name)}</div>`;
  } else if (mode === 'completed') {
    // Done state: shape behind, small ✓ overlay. Non-PR check picks up the PPL
    // session colour (data voice on neutral chrome). PR check is WHITE: gold ✓
    // on gold-tint chamber had bad contrast — white pops as a trophy highlight.
    const checkColor = isPR ? 'var(--c-text-1)' : PPL_VAR[sessionType];
    body = `
      <div class="cp-glyph cp-done-glyph"><svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">${glyph(shape, glyphColor)}</svg></div>
      <svg class="cp-check" viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
        <polyline points="2,7 6,11 12,3" fill="none" stroke="${checkColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  } else {
    // Mastery — non-active chambers compact: just glyph + dim dot.
    body = `
      <div class="cp-glyph cp-glyph-sm"><svg viewBox="-12 -12 24 24" width="16" height="16" aria-hidden="true">${glyph(shape, glyphColor)}</svg></div>
      <div class="cp-dot" aria-hidden="true"></div>`;
  }

  return `<button class="${cls}" data-idx="${i}" role="tab" aria-selected="${isActive}" aria-label="${esc(ch.name)}${isPR ? ', personal record' : ''}">${body}</button>`;
}

/* ════════════════════════════════════════════════════════
   COMPAT HELPERS — used by summary.js island headers
   ════════════════════════════════════════════════════════ */

/**
 * Render a simple block-header pill as an HTML string (summary islands).
 * Lightweight alternative to renderChamberPill for completed-mode island headers.
 *
 * @param {{ label:string, color:string, mode?:string, time?:string, tonnage?:string }} opts
 * @returns {string}
 */
export function chamberPill({ label, color, mode = 'active', time, tonnage }) {
  const isCompleted = mode === 'completed';
  const dot = `<span class="cpill-dot" style="background:${color};box-shadow:0 0 5px ${color}"></span>`;
  const labelEl = `<span class="cpill-label cpill-label--${mode}">${label}</span>`;
  const chips = (time || tonnage) ? `
    <span class="cpill-chips">
      ${time    ? `<span class="cpill-chip">${time}</span>`    : ''}
      ${tonnage ? `<span class="cpill-chip">${tonnage}</span>` : ''}
    </span>` : '';
  const completeMark = isCompleted ? `
    <span class="cpill-done" aria-label="Complete">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" width="12" height="12">
        <polyline points="2.5 8.5 6 12 13.5 4.5"/>
      </svg>
    </span>` : '';

  return `
    <div class="cpill cpill--${mode}">
      <div class="cpill-left">${dot}${labelEl}</div>
      <div class="cpill-right">${chips}${completeMark}</div>
    </div>`.trim();
}

/**
 * Map a block identifier to a display label.
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
