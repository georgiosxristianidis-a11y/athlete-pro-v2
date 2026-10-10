// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.strength-curves.js — premium per-lift progression
   Builds top-working-weight time series per exercise from full
   history and renders smooth neon curves (PPL-coloured) with
   peak/current markers. Pure DOM string output; mounted by
   analytics.view.
   ════════════════════════════════════════════════════════ */

import { esc } from './shared/utils.js';
import { isRu } from './locale.store.js';
import { pplColor } from './shared/ppl-color.js';
import { monotoneCubicPath } from './shared/sparkline.js';
import { calculateProgressionCurves } from './analytics.progression-curves.js';

const GOLD = 'var(--c-gold)';

/**
 * Build a per-exercise progression series: one point per calendar month holding
 * that month's top working weight. Monthly aggregation turns per-session rep
 * noise into a clean strength-climb curve. X follows calendar time so a
 * skipped month is a visible gap, not a fake equal step.
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @param {{ minMonths?: number, limit?: number }} [options]
 * @returns {Array<{name:string, pts:{t:number,v:number}[], type:string, n:number, delta:number}>}
 */
export function buildSeries(workouts, { minMonths = 3, limit = 6 } = {}) {
  return calculateProgressionCurves(workouts, { minMonths, limit });
}

/** Monotone cubic through the points — no Catmull-Rom hooks or fake peaks. */
function smoothPath(P) {
  return monotoneCubicPath(P);
}

/**
 * Pad the value band so a 2 kg climb doesn't fill the plot like a cliff.
 * @param {number[]} vs
 * @param {number} [padRatio]
 * @returns {{vmin:number, vmax:number, vr:number}}
 */
export function valueBand(vs, padRatio = 0.12) {
  const rawMin = Math.min(...vs);
  const rawMax = Math.max(...vs);
  const spread = rawMax - rawMin || 1;
  const pad = spread * padRatio;
  const vmin = rawMin - pad;
  const vmax = rawMax + pad;
  return { vmin, vmax, vr: vmax - vmin };
}

function fmtMon(ts) {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(ts);
  return `${M[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

const SC_W = 320,
  SC_H = 96;

/** Build one curve card. Returns the markup plus the viewBox-space point geometry
 *  ({x,y,v,t}) so the scrub layer can snap a readout to the nearest month. */
function curveCard(s, idx) {
  const W = SC_W,
    H = SC_H,
    padX = 8,
    padTop = 12,
    padBot = 20;
  const isSingle = s.pts.length === 1;
  const t0 = s.pts[0].t,
    tN = s.pts[s.pts.length - 1].t,
    tr = tN - t0 || 1;
  const vs = s.pts.map((p) => p.v);
  const color = pplColor(s.type);
  const gid = `scg-${idx}`;
  const cur = Math.round(s.pts[s.pts.length - 1].v);
  const peakVal = Math.max(...vs);
  const peak = Math.round(peakVal);

  let pts, svgContent, subMarkup, axisMarkup;

  if (isSingle) {
    const midY = Math.round((padTop + H - padBot) / 2);
    const midX = Math.round(W / 2);
    pts = [{ x: midX, y: midY, v: s.pts[0].v, t: s.pts[0].t }];
    svgContent = `
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="${padX}" y="${midY}" width="${W - 2 * padX}" height="${H - midY}" fill="url(#${gid})"/>
      <line x1="${padX}" y1="${midY}" x2="${W - padX}" y2="${midY}" stroke="${color}" stroke-opacity="0.4" stroke-dasharray="4 4" stroke-width="1.5"/>
      <circle cx="${midX}" cy="${midY}" r="4" fill="${color}" stroke="var(--c-surface)" stroke-width="2" class="sc-cur-dot"/>
    `;
    subMarkup = `
      <span class="sc-delta up">${isRu() ? 'Базовый вес' : 'Baseline'}</span>
      <span class="sc-peak">${isRu() ? '1-я точка' : '1st mark'}</span>
    `;
    axisMarkup = `<span>${fmtMon(t0)}</span><span>${s.n} ${isRu() ? (s.n === 1 ? 'сессия' : 'сессии') : (s.n === 1 ? 'session' : 'sessions')}</span><span>${isRu() ? 'старт' : 'start'}</span>`;
  } else {
    const { vmin, vr } = valueBand(vs);
    const X = (p) => padX + ((p.t - t0) / tr) * (W - 2 * padX);
    const Y = (p) => padTop + (1 - (p.v - vmin) / vr) * (H - padTop - padBot);
    pts = s.pts.map((p) => ({ x: X(p), y: Y(p), v: p.v, t: p.t }));
    const line = smoothPath(pts);
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${H} L ${pts[0].x.toFixed(1)},${H} Z`;
    const peakI = vs.indexOf(peakVal);
    const deltaTxt = (s.delta >= 0 ? '+' : '') + Math.round(s.delta);

    svgContent = `
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
    `;
    subMarkup = `
      <span class="sc-delta ${s.delta >= 0 ? 'up' : 'down'}">${deltaTxt} kg</span>
      <span class="sc-peak">peak ${peak}</span>
    `;
    axisMarkup = `<span>${fmtMon(t0)}</span><span>${s.n} ${isRu() ? 'сессий' : 'sessions'}</span><span>${fmtMon(tN)}</span>`;
  }

  const html = `
    <div class="sc-card chart-card" style="--sc:${color}" data-action="analytics:openExercise" data-exercise="${esc(s.name)}" role="button" tabindex="0" aria-label="${esc(s.name)}">
      <div class="sc-head">
        <div class="sc-name">${esc(s.name)}</div>
        <div class="sc-cur">${cur}<span class="sc-unit">kg</span></div>
      </div>
      <div class="sc-sub">
        ${subMarkup}
      </div>
      <div class="sc-plot">
        <svg class="sc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(s.name)} ${isRu() ? `— максимальный рабочий вес по месяцам, сейчас ${cur} кг, пик ${peak} кг` : `top working weight by month, ${cur} kg current, ${peak} kg peak`}">
          ${svgContent}
        </svg>
        <div class="sc-scrub" aria-hidden="true">
          <div class="sc-scrub-line"></div>
          <div class="sc-scrub-dot"></div>
          <div class="sc-scrub-tip"><b></b><span></span></div>
        </div>
      </div>
      <div class="sc-axis">${axisMarkup}</div>
    </div>`;

  return { html, pts };
}

/**
 * Wire touch + hover scrubbing on one curve. A vertical marker + dot snap to the
 * nearest monthly point and a pill reads out weight/date. All movement is via
 * `transform` (no re-render); pointer listeners are passive and coalesced to one
 * update per frame, so it stays at 60fps and never blocks scroll.
 *
 * Click on the plot is swallowed so a scrub/inspect gesture doesn't fire the
 * parent card's `data-action` (field: tap-to-open stole the graph).
 *
 * @param {HTMLElement} card
 * @param {{x:number,y:number,v:number,t:number}[]} pts — viewBox-space geometry
 * @param {{viewW?:number, viewH?:number, format?: (p:{x:number,y:number,v:number,t:number}) => {val:string, sub:string}}} [opts]
 */
function wireScrub(card, pts, opts = {}) {
  const plot = card.querySelector('.sc-plot');
  const scrub = card.querySelector('.sc-scrub');
  if (!plot || !scrub || !pts.length) return;
  const viewW = opts.viewW ?? SC_W;
  const viewH = opts.viewH ?? SC_H;
  const format = opts.format || ((p) => ({ val: `${Math.round(p.v)} kg`, sub: fmtMon(p.t) }));
  const line = scrub.querySelector('.sc-scrub-line');
  const dot = scrub.querySelector('.sc-scrub-dot');
  const tip = scrub.querySelector('.sc-scrub-tip');
  const tipVal = tip.querySelector('b');
  const tipSub = tip.querySelector('span');

  let raf = 0,
    lastX = 0,
    tipHalf = 0;

  function paint() {
    raf = 0;
    const rect = plot.getBoundingClientRect();
    if (!rect.width) return;
    const px = Math.max(0, Math.min(rect.width, lastX - rect.left));
    const svgX = (px / rect.width) * viewW;
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - svgX);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const p = pts[bi];
    const sx = (p.x / viewW) * rect.width;
    const sy = (p.y / viewH) * rect.height;
    line.style.transform = `translateX(${sx.toFixed(1)}px)`;
    dot.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    if (!tipHalf) tipHalf = tip.offsetWidth / 2;
    const tx = Math.max(tipHalf + 2, Math.min(rect.width - tipHalf - 2, sx));
    tip.style.transform = `translateX(calc(${tx.toFixed(1)}px - 50%))`;
    const read = format(p);
    tipVal.textContent = read.val;
    tipSub.textContent = read.sub;
    scrub.classList.add('on');
  }

  function onMove(e) {
    lastX = e.clientX;
    if (!raf) raf = requestAnimationFrame(paint);
  }
  function onLeave() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    scrub.classList.remove('on');
  }

  plot.addEventListener('pointerdown', onMove, { passive: true });
  plot.addEventListener('pointermove', onMove, { passive: true });
  plot.addEventListener('pointerup', onLeave, { passive: true });
  plot.addEventListener('pointercancel', onLeave, { passive: true });
  plot.addEventListener('pointerleave', onLeave, { passive: true });
  plot.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Strength Index = mean relative gain (current / first working weight) across the
 * tracked lifts, indexed to 100. Honest for machine/PPL data (no big-3 / bodyweight
 * needed, unlike DOTS). Returns the monthly index track for the sparkline.
 */
function strengthIndex(series) {
  const months = [...new Set(series.flatMap((s) => s.pts.map((p) => p.t)))].sort((a, b) => a - b);
  const idx = months.map((m) => {
    const ratios = [];
    for (const s of series) {
      const seen = s.pts.filter((p) => p.t <= m);
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
  if (!series.length || !workouts.length) {
    mount.innerHTML = '';
    return;
  }

  const { idx } = strengthIndex(series);
  const score = Math.round(idx[idx.length - 1] * 100);
  const gain = Math.round((idx[idx.length - 1] - 1) * 100);

  const tonnage = workouts.reduce((s, w) => s + (w.tonnage || 0), 0);
  const tons = tonnage >= 1000 ? Math.round(tonnage / 1000) : Math.round(tonnage);
  const tonsUnit = tonnage >= 1000 ? 't' : 'kg';
  const ts = workouts.map((w) => w.timestamp).sort((a, b) => a - b);
  // Journeys under a year used to floor to "1y" here, which self-contradicted
  // the date range printed right next to it (e.g. "1y" beside "Jan '26–Apr '26").
  // Switch to months below a year, same way tonnage switches kg→t at 1000.
  const spanMs = ts[ts.length - 1] - ts[0];
  const spanYears = spanMs / 31557600000;
  const showYears = spanYears >= 1;
  const duration = showYears
    ? Math.round(spanYears * 10) / 10
    : Math.max(1, Math.round(spanMs / 2629800000)); // avg month = 365.25/12 days
  const durationUnit = showYears ? (isRu() ? 'г' : 'y') : isRu() ? 'мес' : 'mo';

  // index sparkline (normalised to its own min/max)
  const W = 96,
    H = 36,
    pad = 4;
  const mn = Math.min(...idx),
    mx = Math.max(...idx),
    rg = mx - mn || 1;
  const P = idx.map((v, i) => ({
    x: pad + (i / (idx.length - 1 || 1)) * (W - 2 * pad),
    y: H - pad - ((v - mn) / rg) * (H - 2 * pad),
  }));
  const spark = idx.length > 1 ? smoothPath(P) : '';

  mount.innerHTML = `
    <div class="sh-hero chart-card" data-action="analytics:openIndex" role="button" tabindex="0" aria-label="${isRu() ? 'Индекс силы — открыть график' : 'Strength Index — open chart'}">
      <div class="sh-top">
        <div class="sh-main">
          <div class="sh-label">${isRu() ? 'Индекс силы' : 'Strength Index'}</div>
          <div class="sh-score">${score}<span class="sh-gain ${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '+' : ''}${gain}%</span></div>
          <div class="sh-cap">${isRu() ? 'средний рост весов с начала' : 'avg weight gain since start'}</div>
        </div>
        ${
          spark
            ? `<svg class="sh-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${isRu() ? 'тренд индекса силы' : 'strength index trend'}">
          <path d="${spark}" fill="none" stroke="var(--c-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sh-spark-stroke"/>
        </svg>`
            : ''
        }
      </div>
      <div class="sh-stats">
        <div class="sh-stat"><b>${tons}<small>${tonsUnit}</small></b><span>${isRu() ? 'поднято' : 'lifted'}</span></div>
        <div class="sh-stat"><b>${workouts.length}</b><span>${isRu() ? 'тренировок' : 'sessions'}</span></div>
        <div class="sh-stat"><b>${duration}<small>${durationUnit}</small></b><span>${fmtMon(ts[0])}–${fmtMon(ts[ts.length - 1])}</span></div>
      </div>
    </div>`;
}

/**
 * Render the Strength Progression section into a container element.
 * @param {Array<import('./db.js').WorkoutRecord>|Array<import('./analytics.progression-curves.js').ExerciseProgressionCurve>} workoutsOrCurves
 * @param {HTMLElement|null} mount
 */
export function renderStrengthCurves(workoutsOrCurves, mount) {
  if (!mount) return;
  const isCurves =
    Array.isArray(workoutsOrCurves) &&
    workoutsOrCurves.length > 0 &&
    Array.isArray(workoutsOrCurves[0]?.pts);
  const series = isCurves
    ? workoutsOrCurves
    : calculateProgressionCurves(workoutsOrCurves, { minMonths: 1, limit: 6 });

  if (!series.length) {
    mount.innerHTML = `
      <div class="sc-empty-hint" style="padding: var(--sp-4); text-align: center; color: var(--c-text-3); font-size: var(--fs-2); background: var(--c-surface-h); border-radius: var(--r-md); border: 1px dashed var(--c-border); line-height: 1.5;">
        ${isRu() ? 'Прогрессия строится автоматически по вашим подходам с весом.' : 'Progression curves build automatically from your weighted sets.'}
      </div>`;
    return;
  }
  const cards = series.map((s, idx) => curveCard(s, idx));
  mount.innerHTML = `<div class="sc-grid">${cards.map((c) => c.html).join('')}</div>`;
  mount.querySelectorAll('.sc-card').forEach((card, i) => wireScrub(card, cards[i].pts));
}

const IDX_W = 320,
  IDX_H = 140;

/**
 * Larger Strength Index plot for the drill-down sheet (same series as the hero).
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @returns {{html:string, pts:{x:number,y:number,v:number,t:number}[], viewW:number, viewH:number, score:number, gain:number, t0:number, tN:number}|null}
 */
export function strengthIndexPlot(workouts) {
  const series = buildSeries(workouts);
  if (!series.length) return null;
  const { months, idx } = strengthIndex(series);
  if (idx.length < 2) return null;

  const score = Math.round(idx[idx.length - 1] * 100);
  const gain = Math.round((idx[idx.length - 1] - 1) * 100);
  const W = IDX_W,
    H = IDX_H,
    padX = 8,
    padTop = 16,
    padBot = 24;
  const { vmin, vr } = valueBand(idx);
  const t0 = months[0],
    tN = months[months.length - 1],
    tr = tN - t0 || 1;
  const pts = months.map((t, i) => ({
    x: padX + ((t - t0) / tr) * (W - 2 * padX),
    y: padTop + (1 - (idx[i] - vmin) / vr) * (H - padTop - padBot),
    v: Math.round(idx[i] * 100),
    t,
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${H} L ${pts[0].x.toFixed(1)},${H} Z`;
  const gid = 'idx-chart-grad';

  const html = `
      <div class="sc-plot ex-chart-plot">
        <svg class="sc-chart ex-svg-chart idx-svg-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${isRu() ? 'тренд индекса силы' : 'strength index trend'}">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--c-accent)" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="var(--c-accent)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#${gid})"/>
          <path d="${line}" fill="none" stroke="var(--c-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sc-stroke"/>
          <circle cx="${pts[pts.length - 1].x.toFixed(1)}" cy="${pts[pts.length - 1].y.toFixed(1)}" r="3.5" fill="var(--c-accent)" class="sc-cur-dot"/>
        </svg>
        <div class="sc-scrub" aria-hidden="true">
          <div class="sc-scrub-line"></div>
          <div class="sc-scrub-dot"></div>
          <div class="sc-scrub-tip"><b></b><span></span></div>
        </div>
      </div>
      <div class="sc-axis">
        <span>${fmtMon(t0)}</span>
        <span>${score}</span>
        <span>${fmtMon(tN)}</span>
      </div>`;

  return { html, pts, viewW: W, viewH: H, score, gain, t0, tN };
}

export { smoothPath, fmtMon, wireScrub, GOLD };
