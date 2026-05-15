// @ts-check
/* ════════════════════════════════════════════════════════
   receipt.js
   Post-session receipt drawn on Canvas.

   showReceipt(session) → Promise<void>
     Renders modal with receipt canvas.
     Swipe up or tap "Share" → Web Share API (fallback: download).
     Tap "Done" → resolves promise → caller navigates home.
   ════════════════════════════════════════════════════════ */

import { DB } from '../db.js';

const W       = 360;  // logical canvas width
const FONT    = `'Courier New', Courier, 'Lucida Console', monospace`;
const BG      = '#0d0d0d';
const C_WHITE = '#ffffff';
const C_DIM   = '#555555';
const C_LINE  = '#1e1e1e';
const C_PR    = '#00c86e';

/* ── Public ──────────────────────────────────────────────── */

export async function showReceipt(session) {
  const [prs, prevTonnage] = await Promise.all([
    _detectPRs(session),
    _getPrevTonnage(session),
  ]);

  const canvas = _drawCanvas(session, prs, prevTonnage);

  return new Promise(resolve => {
    const overlay = _buildOverlay(canvas, resolve);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });
}

/* ── PR Detection ─────────────────────────────────────────── */

async function _detectPRs(session) {
  const prs = new Set();
  try {
    const all  = await DB.Workouts.getAll();
    const prev = all.filter(w => w.timestamp !== session.timestamp);

    for (const ex of session.exercises) {
      const curMax = Math.max(0, ...ex.sets.filter(s => s.done).map(s => s.weight));
      if (curMax <= 0) continue;

      let prevMax = 0;
      for (const w of prev) {
        for (const e of (w.exercises || [])) {
          if (e.name !== ex.name) continue;
          for (const s of (e.sets || [])) {
            if (s.done && s.weight > prevMax) prevMax = s.weight;
          }
        }
      }

      if (curMax > prevMax) prs.add(ex.name);
    }
  } catch { /* non-blocking */ }
  return prs;
}

async function _getPrevTonnage(session) {
  try {
    const all      = await DB.Workouts.getAll();
    const sameType = all.filter(w => w.type === session.type && w.timestamp !== session.timestamp);
    return sameType.length ? (sameType[sameType.length - 1].tonnage || 0) : 0;
  } catch { return 0; }
}

/* ── Canvas Drawing ──────────────────────────────────────── */

function _drawCanvas(session, prs, prevTonnage) {
  const dpr  = Math.min(window.devicePixelRatio || 1, 3);
  const LINE = 24;
  const PAD  = 36;

  const exercises = session.exercises.filter(ex => ex.sets.some(s => s.done && (s.weight > 0 || s.reps > 0)));
  const H = PAD + LINE + 16 + exercises.length * LINE + 16 + 3 * LINE + 16 + LINE + PAD + 12;

  const canvas    = document.createElement('canvas');
  canvas.width    = W * dpr;
  canvas.height   = H * dpr;
  canvas.style.cssText = `width:${W}px;height:${H}px;display:block;border-radius:4px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  let y = PAD;

  // ── Header ──
  ctx.font = `600 11px ${FONT}`;
  ctx.letterSpacing = '0.08em';
  ctx.fillStyle = C_WHITE;
  ctx.textAlign = 'left';
  ctx.fillText('ATHLETE PRO', 24, y);

  const date = new Date(session.timestamp).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  }).replace(/\//g, '.');
  ctx.textAlign = 'right';
  ctx.fillStyle = C_DIM;
  ctx.fillText(date, W - 24, y);
  ctx.textAlign = 'left';

  y += 14;
  _line(ctx, y); y += 16;

  // ── Exercises ──
  ctx.font = `500 11px ${FONT}`;
  for (const ex of exercises) {
    const doneSets = ex.sets.filter(s => s.done);
    const best     = doneSets.reduce((a, b) => (b.weight > a.weight ? b : a), doneSets[0] || { weight: 0, reps: 0 });
    const name     = ex.name.toUpperCase().slice(0, 18);
    const val      = best.weight > 0 ? `${best.weight}×${best.reps}` : `BW×${best.reps}`;
    const pr       = prs.has(ex.name);

    ctx.fillStyle = C_WHITE;
    ctx.fillText(name, 24, y);

    ctx.textAlign = 'right';
    if (pr) {
      ctx.fillStyle = C_PR;
      ctx.fillText('PR', W - 24, y);
      ctx.fillStyle = C_WHITE;
      ctx.fillText(val + '   ', W - 24, y);
    } else {
      ctx.fillStyle = C_DIM;
      ctx.fillText(val, W - 24, y);
    }
    ctx.textAlign = 'left';
    y += LINE;
  }

  y += 4;
  _line(ctx, y); y += 16;

  // ── Stats ──
  const tonnage  = Math.round(session.tonnage || 0);
  const minutes  = Math.max(1, Math.round((session.duration || 0) / 60000));
  const tpm      = Math.round(tonnage / minutes);
  const volDelta = prevTonnage > 0
    ? (((tonnage - prevTonnage) / prevTonnage) * 100).toFixed(0)
    : null;

  const stats = [
    ['VOLUME', `${tonnage.toLocaleString()} kg${volDelta != null ? '  ' + (Number(volDelta) >= 0 ? '+' : '') + volDelta + '%' : ''}`],
    ['DURATION', `${minutes} min`],
    ['T/MIN', `${tpm} kg/min`],
  ];

  ctx.font = `500 11px ${FONT}`;
  for (const [label, value] of stats) {
    ctx.fillStyle = C_DIM;
    ctx.fillText(label, 24, y);
    ctx.fillStyle = C_WHITE;
    ctx.textAlign = 'right';
    ctx.fillText(value, W - 24, y);
    ctx.textAlign = 'left';
    y += LINE;
  }

  y += 4;
  _line(ctx, y); y += 18;

  // ── Footer ──
  ctx.font = `400 10px ${FONT}`;
  ctx.letterSpacing = '0.12em';
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'center';
  ctx.fillText('THANK YOU FOR LIFTING', W / 2, y);
  ctx.textAlign = 'left';

  return canvas;
}

function _line(ctx, y) {
  ctx.strokeStyle = C_LINE;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(W - 24, y);
  ctx.stroke();
}

/* ── Modal ───────────────────────────────────────────────── */

function _buildOverlay(canvas, resolve) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay receipt-overlay';

  overlay.innerHTML = `
    <div class="receipt-sheet">
      <div class="modal-handle"></div>
      <div class="receipt-canvas-wrap" id="receipt-cvs"></div>
      <div class="receipt-swipe-hint">swipe up to share</div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" id="receipt-share" style="flex:1">Share</button>
        <button class="btn btn-primary" id="receipt-done" style="flex:2">Done</button>
      </div>
    </div>`;

  overlay.querySelector('#receipt-cvs').appendChild(canvas);

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.remove(); resolve(); }, 300);
  };

  overlay.querySelector('#receipt-done').addEventListener('click', close);
  overlay.querySelector('#receipt-share').addEventListener('click', () => _shareCanvas(canvas));

  // Swipe up to share
  let _sy = 0;
  const sheet = overlay.querySelector('.receipt-sheet');
  sheet.addEventListener('touchstart', e => { _sy = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (_sy - e.changedTouches[0].clientY > 56) _shareCanvas(canvas);
  }, { passive: true });

  return overlay;
}

/* ── Share / Save ────────────────────────────────────────── */

function _shareCanvas(canvas) {
  canvas.toBlob(async blob => {
    const file = new File([blob], `receipt-${Date.now()}.png`, { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Athlete Pro' });
        return;
      } catch { /* cancelled */ }
    }

    // Fallback: trigger download
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: file.name });
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
