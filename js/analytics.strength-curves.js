// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.strength-curves.js — premium per-lift progression
   Builds top-working-weight time series per exercise from full
   history and renders smooth neon curves (PPL-coloured) with
   peak/current markers. Pure DOM string output; mounted by
   analytics.view.
   ════════════════════════════════════════════════════════ */

import { esc } from './shared/utils.js';
import { tri } from './locale.store.js';
import { pplColor } from './shared/ppl-color.js';
import { monotoneCubicPath } from './shared/sparkline.js';
import { calculateProgressionCurves } from './analytics.progression-curves.js';
import { estimate1RM } from './strength-engine.js';
import { canonicalKey } from './shared/exercise-identity.js';
import { isLifted } from './shared/working-sets.js';

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

const DAY_MS = 86400000;
/** Точки Stats-карточек стоят в середине месяца: соседи в 28–31 дне, один пустой месяц — от 59. */
export const MONTHLY_GAP_DAYS = 45;
/** Перерыв на точках-сессиях — то же понятие, что бамп веса в FIELD-2 (`RETURN_NO_BUMP_DAYS`). */
export const SESSION_GAP_DAYS = 28;

/**
 * FIELD-3: паузы между соседними точками. Разрыв i лежит между pts[i] и pts[i+1].
 * @param {{t:number}[]} pts — по возрастанию t
 * @param {number} minDays
 * @returns {{i:number, days:number}[]}
 */
export function findGaps(pts, minDays) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const days = Math.round((pts[i + 1].t - pts[i].t) / DAY_MS);
    if (days >= minDays) out.push({ i, days });
  }
  return out;
}

/**
 * Длина паузы словами. Месячные точки меряют пустые календарные месяцы (расстояние
 * середина–середина минус один), сессионные — недели.
 * @param {number} days
 * @param {boolean} monthly
 */
export function pauseLabel(days, monthly) {
  const word = tri('пауза', 'break', 'παύση');
  if (monthly) return `${word} ${Math.max(1, Math.round(days / 30.44) - 1)} ${tri('мес', 'mo', 'μήν.')}`;
  return `${word} ${Math.round(days / 7)} ${tri('нед', 'wk', 'εβδ.')}`;
}

/**
 * Линия и заливка с разрывами: сплошная кривая внутри каждого отрезка, пунктир через
 * паузу, заливки под паузой нет. Без разрывов — ровно прежняя геометрия.
 * @param {{x:number,y:number}[]} P
 * @param {{i:number}[]} gaps
 * @param {{H:number, color:string}} o
 * @returns {{line:string, area:string, extra:string}}
 */
export function curvePaths(P, gaps, { H, color }) {
  if (!gaps.length) {
    const line = smoothPath(P);
    return { line, area: `${line} L ${P[P.length - 1].x.toFixed(1)},${H} L ${P[0].x.toFixed(1)},${H} Z`, extra: '' };
  }
  const cut = new Set(gaps.map((g) => g.i));
  const runs = [[]];
  P.forEach((p, i) => {
    runs[runs.length - 1].push(p);
    if (cut.has(i)) runs.push([]);
  });
  const lines = [];
  const areas = [];
  let dots = '';
  for (const r of runs) {
    if (r.length === 1) {
      dots += `<circle cx="${r[0].x.toFixed(1)}" cy="${r[0].y.toFixed(1)}" r="2.5" fill="${color}" class="sc-gap-dot"/>`;
      continue;
    }
    const d = smoothPath(r);
    lines.push(d);
    areas.push(`${d} L ${r[r.length - 1].x.toFixed(1)},${H} L ${r[0].x.toFixed(1)},${H} Z`);
  }
  const bridge = gaps
    .map((g) => `M ${P[g.i].x.toFixed(1)},${P[g.i].y.toFixed(1)} L ${P[g.i + 1].x.toFixed(1)},${P[g.i + 1].y.toFixed(1)}`)
    .join(' ');
  const extra = `<path d="${bridge}" fill="none" stroke="${color}" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="2 5" stroke-linecap="round" vector-effect="non-scaling-stroke" class="sc-gap-line"/>${dots}`;
  return { line: lines.join(' '), area: areas.join(' '), extra };
}

/** Зоны пауз в координатах viewBox — wireScrub читает ими, что под пальцем. */
export function gapZones(P, gaps, monthly) {
  return gaps.map((g) => ({ x0: P[g.i].x, x1: P[g.i + 1].x, text: pauseLabel(g.days, monthly) }));
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
  /** @type {{x0:number,x1:number,text:string}[]} */
  let zones = [];
  let gapNote = '';

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
      <span class="sc-delta up">${tri('Базовый вес', 'Baseline', 'Βάση')}</span>
      <span class="sc-peak">${tri('1-я точка', '1st mark', '1ο σημείο')}</span>
    `;
    axisMarkup = `<span>${fmtMon(t0)}</span><span>${s.n} ${tri(s.n === 1 ? 'сессия' : 'сессии', s.n === 1 ? 'session' : 'sessions', s.n === 1 ? 'συνεδρία' : 'συνεδρίες')}</span><span>${tri('старт', 'start', 'εκκίνηση')}</span>`;
  } else {
    const { vmin, vr } = valueBand(vs);
    const X = (p) => padX + ((p.t - t0) / tr) * (W - 2 * padX);
    const Y = (p) => padTop + (1 - (p.v - vmin) / vr) * (H - padTop - padBot);
    pts = s.pts.map((p) => ({ x: X(p), y: Y(p), v: p.v, t: p.t }));
    const gaps = findGaps(s.pts, MONTHLY_GAP_DAYS);
    zones = gapZones(pts, gaps, true);
    const { line, area, extra } = curvePaths(pts, gaps, { H, color });
    if (gaps.length) {
      const longest = gaps.reduce((a, g) => (g.days > a.days ? g : a));
      gapNote = `<span class="sc-gap-note">${pauseLabel(longest.days, true)}</span>`;
    }
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
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sc-stroke"/>${extra}
      <circle cx="${pts[peakI].x.toFixed(1)}" cy="${pts[peakI].y.toFixed(1)}" r="3.5" fill="${GOLD}" class="sc-peak-dot"/>
      <circle cx="${pts[pts.length - 1].x.toFixed(1)}" cy="${pts[pts.length - 1].y.toFixed(1)}" r="3.5" fill="${color}" class="sc-cur-dot"/>
    `;
    subMarkup = `
      <span class="sc-delta ${s.delta >= 0 ? 'up' : 'down'}">${deltaTxt} kg</span>
      <span class="sc-peak">peak ${peak}</span>${gapNote}
    `;
    axisMarkup = `<span>${fmtMon(t0)}</span><span>${s.n} ${tri('сессий', 'sessions', 'προπονήσεις')}</span><span>${fmtMon(tN)}</span>`;
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
        <svg class="sc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(s.name)} ${tri(`— максимальный рабочий вес по месяцам, сейчас ${cur} кг, пик ${peak} кг`, `top working weight by month, ${cur} kg current, ${peak} kg peak`, `μέγιστο βάρος εργασίας ανά μήνα, τώρα ${cur} kg, κορυφή ${peak} kg`)}">
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

  return { html, pts, zones };
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
 * @param {{viewW?:number, viewH?:number, zones?:{x0:number,x1:number,text:string}[], format?: (p:{x:number,y:number,v:number,t:number}) => {val:string, sub:string}}} [opts]
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
    const zone = opts.zones?.find((z) => svgX > z.x0 && svgX < z.x1);
    // FIELD-3: на паузе показаний нет — не прилипаем к соседней точке и не рисуем её вес.
    dot.style.opacity = zone ? '0' : '';
    const sx = zone ? px : (p.x / viewW) * rect.width;
    const sy = (p.y / viewH) * rect.height;
    line.style.transform = `translateX(${sx.toFixed(1)}px)`;
    if (!zone) dot.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    if (!tipHalf) tipHalf = tip.offsetWidth / 2;
    const tx = Math.max(tipHalf + 2, Math.min(rect.width - tipHalf - 2, sx));
    tip.style.transform = `translateX(calc(${tx.toFixed(1)}px - 50%))`;
    const read = zone ? { val: zone.text, sub: '' } : format(p);
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
 * Strength Index (ANL-3) — chained by estimated 1RM, 1 at the first month. A lift's
 * monthly value is its best `estimate1RM` over lifted sets, so more reps at the same
 * weight counts as growth. Each month multiplies the index by the geometric mean of
 * e1RM(m) / last-seen e1RM over lifts present in that month AND seen before: a new
 * lift enters silently (no drop), +50% and −33% cancel, a lift that skipped a month
 * is compared with its last seen value once (last-seen moves on after every
 * comparison). A lift needs ≥2 months of data; no top-6 cap — that limit belongs to
 * the curve cards, which stay on working weight. Lift key = trim + lowercase + alias.
 * @param {Array<import('./db.js').WorkoutRecord>|null|undefined} workouts
 * @returns {{months:number[], idx:number[]}} mid-month timestamps and index per month (1 = 100)
 */
export function buildIndexSeries(workouts) {
  /** @type {Map<string, Map<number, number>>} lift → calendar month → best e1RM */
  const lifts = new Map();
  for (const w of Array.isArray(workouts) ? workouts : []) {
    if (!w || w._deleted) continue;
    const ts = Number(w.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const d = new Date(ts);
    const mk = d.getFullYear() * 12 + d.getMonth();
    for (const ex of Array.isArray(w.exercises) ? w.exercises : []) {
      if (!ex || typeof ex.name !== 'string') continue;
      const key = canonicalKey(ex.name);
      if (!key) continue;
      let best = 0;
      for (const set of Array.isArray(ex.sets) ? ex.sets : []) {
        const weight = Number(set?.weight);
        if (!isLifted(set) || !(weight > 0)) continue;
        best = Math.max(best, estimate1RM(weight, Number(set.reps)));
      }
      if (!best) continue;
      let months = lifts.get(key);
      if (!months) lifts.set(key, (months = new Map()));
      if (best > (months.get(mk) ?? 0)) months.set(mk, best);
    }
  }

  const tracks = [...lifts.values()].filter((m) => m.size >= 2);
  const monthKeys = [...new Set(tracks.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const lastSeen = tracks.map(() => 0);
  let index = 1;
  const idx = monthKeys.map((mk) => {
    let logSum = 0,
      n = 0;
    tracks.forEach((m, j) => {
      const v = m.get(mk);
      if (!v) return;
      if (lastSeen[j]) {
        logSum += Math.log(v / lastSeen[j]);
        n++;
      }
      lastSeen[j] = v;
    });
    if (n) index *= Math.exp(logSum / n);
    return index;
  });
  const months = monthKeys.map((mk) => Date.UTC(Math.floor(mk / 12), mk % 12, 15, 12, 0, 0));
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
  const { months, idx } = buildIndexSeries(workouts);
  if (!idx.length || !workouts.length) {
    mount.innerHTML = '';
    return;
  }

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
  const durationUnit = showYears ? (tri('г', 'y', 'έτ.')) : tri('мес', 'mo', 'μήν.');

  // index sparkline (normalised to its own min/max)
  const W = 96,
    H = 36,
    pad = 4;
  const mn = Math.min(...idx),
    mx = Math.max(...idx),
    rg = mx - mn || 1;
  // X follows calendar time, like the drill-down plot: a skipped month is a visible gap.
  const sparkT0 = months[0],
    sparkTr = months[months.length - 1] - sparkT0 || 1;
  const P = idx.map((v, i) => ({
    x: pad + ((months[i] - sparkT0) / sparkTr) * (W - 2 * pad),
    y: H - pad - ((v - mn) / rg) * (H - 2 * pad),
  }));
  const spark = idx.length > 1 ? smoothPath(P) : '';

  mount.innerHTML = `
    <div class="sh-hero chart-card" data-action="analytics:openIndex" role="button" tabindex="0" aria-label="${tri('Индекс силы — открыть график', 'Strength Index — open chart', 'Δείκτης δύναμης — άνοιγμα γραφήματος')}">
      <div class="sh-top">
        <div class="sh-main">
          <div class="sh-label">${tri('Индекс силы', 'Strength Index', 'Δείκτης δύναμης')}</div>
          <div class="sh-score">${score}<span class="sh-gain ${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '+' : ''}${gain}%</span></div>
          <div class="sh-cap">${tri('средний рост силы с начала', 'avg strength gain since start', 'μέση αύξηση δύναμης από την αρχή')}</div>
        </div>
        ${
          spark
            ? `<svg class="sh-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${tri('тренд индекса силы', 'strength index trend', 'τάση δείκτη δύναμης')}">
          <path d="${spark}" fill="none" stroke="var(--c-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="sh-spark-stroke"/>
        </svg>`
            : ''
        }
      </div>
      <div class="sh-stats">
        <div class="sh-stat"><b>${tons}<small>${tonsUnit}</small></b><span>${tri('поднято', 'lifted', 'σηκώθηκαν')}</span></div>
        <div class="sh-stat"><b>${workouts.length}</b><span>${tri('тренировок', 'sessions', 'προπονήσεις')}</span></div>
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
        ${tri('Прогрессия строится автоматически по вашим подходам с весом.', 'Progression curves build automatically from your weighted sets.', 'Οι καμπύλες προόδου χτίζονται αυτόματα από τα σετ σου με βάρος.')}
      </div>`;
    return;
  }
  const cards = series.map((s, idx) => curveCard(s, idx));
  mount.innerHTML = `<div class="sc-grid">${cards.map((c) => c.html).join('')}</div>`;
  mount.querySelectorAll('.sc-card').forEach((card, i) => wireScrub(card, cards[i].pts, { zones: cards[i].zones }));
}

const IDX_W = 320,
  IDX_H = 140;

/**
 * Larger Strength Index plot for the drill-down sheet (same series as the hero).
 * @param {Array<import('./db.js').WorkoutRecord>} workouts
 * @returns {{html:string, pts:{x:number,y:number,v:number,t:number}[], viewW:number, viewH:number, score:number, gain:number, t0:number, tN:number}|null}
 */
export function strengthIndexPlot(workouts) {
  const { months, idx } = buildIndexSeries(workouts);
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
        <svg class="sc-chart ex-svg-chart idx-svg-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${tri('тренд индекса силы', 'strength index trend', 'τάση δείκτη δύναμης')}">
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
