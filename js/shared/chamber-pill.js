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
  const glyphColor = isPR ? 'var(--c-gold, #d4af37)'
                   : isActive ? PPL_VAR[sessionType]
                   : mode === 'preview' ? 'var(--c-text-1)'
                   : mode === 'completed' ? 'var(--c-text-1)'
                   : 'var(--c-text-3)';
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
    // Done state: shape behind, small ✓ overlay (gold if PR).
    const checkColor = isPR ? 'var(--c-gold, #d4af37)' : PPL_VAR[sessionType];
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
