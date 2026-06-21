// @ts-check
/* ════════════════════════════════════════════════════════
   ppl-gauge.js — shared Push/Pull/Legs balance gauge
   A 3-segment semi-donut (push green · pull cyan · legs purple) with the
   total tonnage in the pocket and a legend below. Pure static SVG — no
   canvas, no animation loop — so it stays buttery at 60fps. Used by both
   the dashboard PPL Split and the analytics PPL Balance.
   ════════════════════════════════════════════════════════ */

import { fmtVol } from './format.js';
import { isRu } from '../locale.store.js';

const CX = 100, CY = 104, R = 86, SW = 18, GAP = 4; // geometry (viewBox units, gap in deg)
const LABELS = { push: 'Push', pull: 'Pull', legs: 'Legs' };

/** Point on a circle. Angle is degrees, 0°=right · 90°=top · 180°=left (y-down). */
function polar(deg) {
  const a = (deg * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
}

/** Arc stroke path from startDeg→endDeg over the top (sweep-flag 1 = clockwise). */
function arcPath(startDeg, endDeg) {
  const [x0, y0] = polar(startDeg);
  const [x1, y1] = polar(endDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Render the PPL gauge into a mount element.
 * @param {HTMLElement|null} mount
 * @param {{push:number, pull:number, legs:number}} ppl — tonnage per type
 */
export function renderPplGauge(mount, ppl) {
  if (!mount) return;
  const order = [
    { key: 'push', color: 'var(--c-push)', val: Math.max(0, ppl.push || 0) },
    { key: 'pull', color: 'var(--c-pull)', val: Math.max(0, ppl.pull || 0) },
    { key: 'legs', color: 'var(--c-legs)', val: Math.max(0, ppl.legs || 0) },
  ];
  const total = order.reduce((s, o) => s + o.val, 0);
  const present = order.filter(o => o.val > 0);
  const gap = present.length > 1 ? GAP : 0;
  const drawable = 180 - gap * (present.length - 1);

  let cur = 180;
  const segs = present.map(o => {
    const span = (o.val / total) * drawable;
    const start = cur, end = cur - span;
    cur = end - gap;
    return `<path d="${arcPath(start, end)}" stroke="${o.color}" class="ppl-g-seg"/>`;
  }).join('');

  const legend = order.map(o => {
    const pct = total ? Math.round((o.val / total) * 100) : 0;
    return `<div class="ppl-g-leg" style="--lc:${o.color}">
      <div class="ppl-g-leg-top"><span class="ppl-g-dot"></span><span class="ppl-g-pct">${pct}%</span></div>
      <div class="ppl-g-leg-lbl">${LABELS[o.key]}</div>
      <div class="ppl-g-leg-vol">${fmtVol(o.val)} kg</div>
    </div>`;
  }).join('');

  mount.innerHTML = `
    <div class="ppl-gauge">
      <svg class="ppl-g-svg" viewBox="0 0 200 118" role="img"
           aria-label="${isRu() ? 'Баланс Push/Pull/Legs' : 'Push/Pull/Legs balance'}, ${fmtVol(total)} kg">
        <path d="${arcPath(180, 0)}" class="ppl-g-track"/>
        ${segs}
        <text x="${CX}" y="86" text-anchor="middle" class="ppl-g-total">${fmtVol(total)}</text>
        <text x="${CX}" y="104" text-anchor="middle" class="ppl-g-cap">${isRu() ? 'кг всего' : 'kg total'}</text>
      </svg>
      <div class="ppl-g-legend">${legend}</div>
    </div>`;
}
