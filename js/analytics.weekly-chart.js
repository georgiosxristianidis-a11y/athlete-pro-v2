// @ts-check
/* ════════════════════════════════════════════════════════
   analytics.weekly-chart.js — ANL-A3, флаг 'weekly-calendar' (вариант B, Gio 22.11)
   «Прогресс объёма»: нейтральный столбец = тоннаж календарной недели пн–вс.
   Лучшая ПОЛНАЯ неделя ярче, текущая — штриховкой, в «лучшую» и норму не входит.
   Цвета и шрифты — токены темы через getComputedStyle; перерисовка на смену
   темы и ширины. Данные считает стор (calendarWeeks / weekSummary).
   ════════════════════════════════════════════════════════ */

import {
  calendarWeeks,
  weekSummary,
  axisLabelMask,
  calendarWeekLabel,
  fmtVol,
} from './analytics.store.js';
import { t, tri } from './locale.store.js';

const H = 140;
const WEEKS = 10;
/** @type {any[]} */
let _workouts = [];
/** @type {HTMLCanvasElement|null} */
let _observed = null;
let _width = 0;
/** @type {ResizeObserver|null} */
let _resize = null;
/** @type {MutationObserver|null} */
let _theme = null;

/** @param {CSSStyleDeclaration} cs @param {string} name */
const tok = (cs, name) => cs.getPropertyValue(name).trim();

/** @param {HTMLCanvasElement} canvas */
function watch(canvas) {
  if (_observed === canvas) return;
  if (typeof ResizeObserver === 'function') {
    _resize?.disconnect();
    _resize = new ResizeObserver(() => {
      // Только по смене ширины: своя запись canvas.height не должна зацикливать
      if (canvas.isConnected && canvas.offsetWidth && canvas.offsetWidth !== _width) draw();
    });
    _resize.observe(canvas);
  }
  if (!_theme && typeof MutationObserver === 'function') {
    _theme = new MutationObserver(() => {
      if (_observed?.isConnected) draw();
    });
    _theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  _observed = canvas;
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h */
function bar(ctx, x, y, w, h) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, Math.min(4, h / 2));
  else ctx.rect(x, y, w, h);
}

/**
 * Нарисовать график в #cv-volume и обновить бейдж #an-week-best.
 * @param {any[]} workouts
 */
export function renderWeeklyCalendar(workouts) {
  _workouts = Array.isArray(workouts) ? workouts : [];
  draw();
}

function draw() {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('cv-volume'));
  if (!canvas) return;
  watch(canvas);

  const buckets = calendarWeeks(_workouts, WEEKS, new Date());
  const { bestIndex, best, norm } = weekSummary(buckets);
  const normText = norm == null ? '' : `${tri('норма', 'norm', 'συνήθως')} ${fmtVol(norm)}`;

  const badge = document.getElementById('an-week-best');
  if (badge)
    badge.textContent =
      bestIndex < 0 ? '—' : normText ? `${fmtVol(best)} · ${normText}` : fmtVol(best);

  const labels = buckets.map((b) =>
    b.partial ? tri('эта', 'this', 'αυτή') : calendarWeekLabel(b)
  );
  const bestWord = tri('лучшая', 'best', 'καλύτερη');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `${t('analytics.weekly_progress')}: ` +
      buckets
        .map(
          (b, i) => `${labels[i]} ${fmtVol(b.tonnage)}${i === bestIndex ? ` (${bestWord})` : ''}`
        )
        .join(', ') +
      (normText ? `. ${normText}` : '')
  );

  const cs = getComputedStyle(document.documentElement);
  const c1 = tok(cs, '--c-text-1');
  const c2 = tok(cs, '--c-text-2');
  const fs1 = tok(cs, '--fs-1');
  const fontLabel = `${tok(cs, '--fw-bold')} ${fs1} ${tok(cs, '--font-main')}`;
  const fontValue = `${tok(cs, '--fw-black')} ${fs1} ${tok(cs, '--font-heading')}`;

  const W = canvas.offsetWidth || 320;
  _width = W;
  const dpr = devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const max = Math.max(...buckets.map((b) => b.tonnage), 1);
  const mask = axisLabelMask(buckets.length);
  const pad = { t: 22, b: 24, l: 8, r: 8 };
  const slot = (W - pad.l - pad.r) / buckets.length;
  const gap = slot * 0.3;
  const chartH = H - pad.t - pad.b;
  ctx.textAlign = 'center';

  buckets.forEach((b, i) => {
    const x = pad.l + i * slot + gap / 2;
    const bw = slot - gap;
    const bh = b.tonnage ? Math.max(4, (b.tonnage / max) * chartH) : 2;
    const y = pad.t + chartH - bh;
    const isBest = i === bestIndex;

    ctx.fillStyle = c2;
    if (b.partial) {
      // Неделя ещё идёт: подложка + диагональная штриховка, обрезанная по столбцу
      ctx.save();
      bar(ctx, x, y, bw, bh);
      ctx.globalAlpha = 0.06;
      ctx.fill();
      ctx.clip();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = c2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -bh; k < bw; k += 5) {
        ctx.moveTo(x + k, y + bh);
        ctx.lineTo(x + k + bh, y);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.globalAlpha = isBest ? 0.85 : b.tonnage ? 0.32 : 0.16;
      bar(ctx, x, y, bw, bh);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (b.tonnage > 0) {
      ctx.fillStyle = isBest ? c1 : c2;
      ctx.font = fontValue;
      ctx.fillText(fmtVol(b.tonnage), x + bw / 2, y - 6);
    }
    if (mask[i]) {
      ctx.fillStyle = b.partial ? c1 : c2;
      ctx.font = fontLabel;
      ctx.fillText(labels[i], x + bw / 2, H - 8);
    }
  });
}
