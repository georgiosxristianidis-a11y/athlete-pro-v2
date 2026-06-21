// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.strength-curves.js — premium per-lift progression
   Builds est-1RM time series per exercise from full history and
   renders smooth neon curves (PPL-coloured) with peak/current
   markers. Pure DOM string output; mounted by analytics.view.
   ════════════════════════════════════════════════════════ */

import { esc } from './shared/utils.js';
import { isRu } from './locale.store.js';

// PPL law colours (hex — markers/fills append alpha).
const TYPE_COLOR = { push: '#00e676', pull: '#00b8d4', legs: '#8b5cf6' };
const GOLD = '#D4AF37';

/**
 * Build a per-exercise progression series: one point per calendar month holding
 * that month's top working weight. Monthly aggregation turns per-session rep
 * noise into a clean strength-climb curve. Even monthly x-spacing.
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @returns {Array<{name:string, pts:{t:number,v:number}[], type:string, n:number, delta:number}>}
 */
function buildSeries(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const d = new Date(w.timestamp);
    const mk = d.getFullYear() * 12 + d.getMonth();   // month key
    for (const ex of (w.exercises || [])) {
      if (!ex || !ex.name) continue;
      let top = 0;
      for (const s of (ex.sets || [])) { if (s && s.weight && s.weight > top) top = s.weight; }
      if (top <= 0) continue;
      const m = map.get(ex.name) || { months: new Map(), type: {}, sessions: 0 };
      m.sessions++;
      m.type[w.type] = (m.type[w.type] || 0) + 1;
      m.months.set(mk, Math.max(m.months.get(mk) || 0, top)); // monthly max working weight
      map.set(ex.name, m);
    }
  }
  const out = [];
  for (const [name, m] of map) {
    if (m.months.size < 3) continue;                  // need ≥3 months for a curve
    const pts = [...m.months.entries()].sort((a, b) => a[0] - b[0])
      .map(([mk, v]) => ({ t: new Date(Math.floor(mk / 12), mk % 12, 15).getTime(), v }));
    const type = Object.entries(m.type).sort((a, b) => b[1] - a[1])[0][0];
    out.push({ name, pts, type, n: m.sessions, delta: pts[pts.length - 1].v - pts[0].v });
  }
  out.sort((a, b) => b.n - a.n);                      // most-tracked lifts first
  return out.slice(0, 6);
}

/** Catmull-Rom → cubic-bézier smooth path. Control-point Y is clamped to the data
 *  band so the curve never over/undershoots into "hooks" at sharp points. */
function smoothPath(P) {
  const minY = Math.min(...P.map(p => p.y)), maxY = Math.max(...P.map(p => p.y));
  const clamp = y => Math.max(minY, Math.min(maxY, y));
  let d = `M ${P[0].x.toFixed(1)},${P[0].y.toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i === 0 ? 0 : i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2 === P.length ? i + 1 : i + 2];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function fmtMon(ts) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(ts);
  return `${M[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

const SC_W = 320, SC_H = 96;

/** Build one curve card. Returns the markup plus the viewBox-space point geometry
 *  ({x,y,v,t}) so the scrub layer can snap a readout to the nearest month. */
function curveCard(s, idx) {
  const W = SC_W, H = SC_H, padX = 8, padTop = 12, padBot = 20;
  const t0 = s.pts[0].t, tN = s.pts[s.pts.length - 1].t, tr = (tN - t0) || 1;
  const vs = s.pts.map(p => p.v), vmin = Math.min(...vs), vmax = Math.max(...vs), vr = (vmax - vmin) || 1;
  const X = p => padX + ((p.t - t0) / tr) * (W - 2 * padX);
  const Y = p => padTop + (1 - (p.v - vmin) / vr) * (H - padTop - padBot);
  const pts = s.pts.map(p => ({ x: X(p), y: Y(p), v: p.v, t: p.t }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${H} L ${pts[0].x.toFixed(1)},${H} Z`;
  const peakI = vs.indexOf(vmax);
  const color = TYPE_COLOR[s.type] || '#00e676';
  const gid = `scg-${idx}`;
  const cur = Math.round(s.pts[s.pts.length - 1].v);
  const peak = Math.round(vmax);
  const deltaTxt = (s.delta >= 0 ? '+' : '') + Math.round(s.delta);

  const html = `
    <div class="sc-card chart-card" style="--sc:${color}">
      <div class="sc-head">
        <div class="sc-name">${esc(s.name)}</div>
        <div class="sc-cur">${cur}<span class="sc-unit">kg</span></div>
      </div>
      <div class="sc-sub">
        <span class="sc-delta ${s.delta >= 0 ? 'up' : 'down'}">${deltaTxt} kg</span>
        <span class="sc-peak">peak ${peak}</span>
      </div>
      <div class="sc-plot">
        <svg class="sc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(s.name)} est 1RM progression, ${cur} kg current, ${peak} kg peak">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#${gid})"/>
          <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sc-stroke"/>
          <circle cx="${pts[peakI].x.toFixed(1)}" cy="${pts[peakI].y.toFixed(1)}" r="3.5" fill="${GOLD}" class="sc-peak-dot"/>
          <circle cx="${pts[pts.length - 1].x.toFixed(1)}" cy="${pts[pts.length - 1].y.toFixed(1)}" r="3.5" fill="${color}" class="sc-cur-dot"/>
        </svg>
        <div class="sc-scrub" aria-hidden="true">
          <div class="sc-scrub-line"></div>
          <div class="sc-scrub-dot"></div>
          <div class="sc-scrub-tip"><b></b><span></span></div>
        </div>
      </div>
      <div class="sc-axis"><span>${fmtMon(t0)}</span><span>${s.n} ${isRu() ? 'сессий' : 'sessions'}</span><span>${fmtMon(tN)}</span></div>
    </div>`;

  return { html, pts };
}

/**
 * Wire touch + hover scrubbing on one curve. A vertical marker + dot snap to the
 * nearest monthly point and a pill reads out weight/date. All movement is via
 * `transform` (no re-render); pointer listeners are passive and coalesced to one
 * update per frame, so it stays at 60fps and never blocks scroll.
 * @param {HTMLElement} card
 * @param {{x:number,y:number,v:number,t:number}[]} pts — viewBox-space geometry
 */
function wireScrub(card, pts) {
  const plot = card.querySelector('.sc-plot');
  const scrub = card.querySelector('.sc-scrub');
  if (!plot || !scrub || !pts.length) return;
  const line = scrub.querySelector('.sc-scrub-line');
  const dot = scrub.querySelector('.sc-scrub-dot');
  const tip = scrub.querySelector('.sc-scrub-tip');
  const tipVal = tip.querySelector('b');
  const tipSub = tip.querySelector('span');

  let raf = 0, lastX = 0, tipHalf = 0;

  function paint() {
    raf = 0;
    const rect = plot.getBoundingClientRect();
    if (!rect.width) return;
    const px = Math.max(0, Math.min(rect.width, lastX - rect.left));
    const svgX = (px / rect.width) * SC_W;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - svgX);
      if (d < bd) { bd = d; bi = i; }
    }
    const p = pts[bi];
    const sx = (p.x / SC_W) * rect.width;
    const sy = (p.y / SC_H) * rect.height;
    line.style.transform = `translateX(${sx.toFixed(1)}px)`;
    dot.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    if (!tipHalf) tipHalf = tip.offsetWidth / 2;
    const tx = Math.max(tipHalf + 2, Math.min(rect.width - tipHalf - 2, sx));
    tip.style.transform = `translateX(calc(${tx.toFixed(1)}px - 50%))`;
    tipVal.textContent = `${Math.round(p.v)} kg`;
    tipSub.textContent = fmtMon(p.t);
    scrub.classList.add('on');
  }

  function onMove(e) {
    lastX = e.clientX;
    if (!raf) raf = requestAnimationFrame(paint);
  }
  function onLeave() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    scrub.classList.remove('on');
  }

  plot.addEventListener('pointerdown', onMove, { passive: true });
  plot.addEventListener('pointermove', onMove, { passive: true });
  plot.addEventListener('pointerup', onLeave, { passive: true });
  plot.addEventListener('pointercancel', onLeave, { passive: true });
  plot.addEventListener('pointerleave', onLeave, { passive: true });
}

/**
 * Strength Index = mean relative gain (current / first working weight) across the
 * tracked lifts, indexed to 100. Honest for machine/PPL data (no big-3 / bodyweight
 * needed, unlike DOTS). Returns the monthly index track for the sparkline.
 */
function strengthIndex(series) {
  const months = [...new Set(series.flatMap(s => s.pts.map(p => p.t)))].sort((a, b) => a - b);
  const idx = months.map(m => {
    const ratios = [];
    for (const s of series) {
      const seen = s.pts.filter(p => p.t <= m);
      if (seen.length) ratios.push(seen[seen.length - 1].v / s.pts[0].v);
    }
    return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  });
  return { months, idx };
}

/**
 * Premium overview hero: Strength Index + total-gain badge + index sparkline +
 * journey stats (tonnage · sessions · span). Pure static SVG/text — no canvas,
 * no animation loop — so it stays buttery at 60fps.
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @param {HTMLElement|null} mount
 */
export function renderStrengthHero(workouts, mount) {
  if (!mount) return;
  const series = buildSeries(workouts);
  if (!series.length || !workouts.length) { mount.innerHTML = ''; return; }

  const { idx } = strengthIndex(series);
  const score = Math.round(idx[idx.length - 1] * 100);
  const gain = Math.round((idx[idx.length - 1] - 1) * 100);

  const tonnage = workouts.reduce((s, w) => s + (w.tonnage || 0), 0);
  const tons = tonnage >= 1000 ? Math.round(tonnage / 1000) : Math.round(tonnage);
  const tonsUnit = tonnage >= 1000 ? 't' : 'kg';
  const ts = workouts.map(w => w.timestamp).sort((a, b) => a - b);
  const years = Math.max(1, Math.round((ts[ts.length - 1] - ts[0]) / 31557600000 * 10) / 10);

  // index sparkline (normalised to its own min/max)
  const W = 96, H = 36, pad = 4;
  const mn = Math.min(...idx), mx = Math.max(...idx), rg = (mx - mn) || 1;
  const P = idx.map((v, i) => ({ x: pad + (i / (idx.length - 1 || 1)) * (W - 2 * pad), y: H - pad - ((v - mn) / rg) * (H - 2 * pad) }));
  const spark = idx.length > 1 ? smoothPath(P) : '';

  mount.innerHTML = `
    <div class="sh-hero chart-card">
      <div class="sh-top">
        <div class="sh-main">
          <div class="sh-label">${isRu() ? 'Индекс силы' : 'Strength Index'}</div>
          <div class="sh-score">${score}<span class="sh-gain ${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '+' : ''}${gain}%</span></div>
          <div class="sh-cap">${isRu() ? 'средний рост весов с начала' : 'avg weight gain since start'}</div>
        </div>
        ${spark ? `<svg class="sh-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${isRu() ? 'тренд индекса силы' : 'strength index trend'}">
          <path d="${spark}" fill="none" stroke="var(--c-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sh-spark-stroke"/>
        </svg>` : ''}
      </div>
      <div class="sh-stats">
        <div class="sh-stat"><b>${tons}<small>${tonsUnit}</small></b><span>${isRu() ? 'поднято' : 'lifted'}</span></div>
        <div class="sh-stat"><b>${workouts.length}</b><span>${isRu() ? 'тренировок' : 'sessions'}</span></div>
        <div class="sh-stat"><b>${years}<small>${isRu() ? 'г' : 'y'}</small></b><span>${fmtMon(ts[0])}–${fmtMon(ts[ts.length - 1])}</span></div>
      </div>
    </div>`;
}

/**
 * Render the Strength Progression section into a container element.
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @param {HTMLElement|null} mount
 */
export function renderStrengthCurves(workouts, mount) {
  if (!mount) return;
  const series = buildSeries(workouts);
  if (!series.length) { mount.innerHTML = ''; return; }
  const cards = series.map(curveCard);
  mount.innerHTML = `<div class="sc-grid">${cards.map(c => c.html).join('')}</div>`;
  mount.querySelectorAll('.sc-card').forEach((card, i) => wireScrub(card, cards[i].pts));
}
