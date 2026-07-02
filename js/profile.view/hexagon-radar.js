// @ts-check
import { exrxTier } from '../strength-engine.js';

const TIER_PCT = { Untrained: 8, Novice: 28, Intermediate: 52, Advanced: 76, Elite: 96 };

/** @param {string} tier */
function _tierPct(tier) { return TIER_PCT[tier] || 8; }

/**
 * @param {number} cx @param {number} cy @param {number} r @param {number} angleDeg
 * @returns {{ x: number, y: number }}
 */
function _polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** @param {number} cx @param {number} cy @param {number} R @param {number[]} pcts */
function _polygon(cx, cy, R, pcts) {
  return pcts.map((p, i) => {
    const { x, y } = _polar(cx, cy, R * p / 100, i * 60);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/**
 * @param {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} oneRMs
 * @param {number} bw
 * @param {'m'|'f'} sex
 * @param {number|null} age
 * @param {Array<{timestamp: number, tonnage?: number}>} workouts
 * @param {string} lang
 * @returns {string}
 */
export function renderHexagonRadar(oneRMs, bw, sex, age, workouts, lang) {
  const ru = lang === 'ru';
  const effectiveAge = age || 30;

  const since30d = Date.now() - 30 * 86400000;
  const monthVol = workouts
    .filter(w => w.timestamp >= since30d)
    .reduce((s, w) => s + (w.tonnage || 0), 0);
  const sessions30d = workouts.filter(w => w.timestamp >= since30d).length;

  const volPct  = Math.min(96, Math.round(monthVol / 104));   // 10000kg ≈ 96%
  const consPct = Math.min(96, Math.round(sessions30d / 20 * 96));

  /** @type {Array<{label: string, lift: string|null, rm: number}>} */
  const axes = [
    { label: ru ? 'Жим'    : 'Bench',    lift: 'bench',    rm: oneRMs.bench    || 0 },
    { label: ru ? 'Жим ст' : 'OHP',      lift: 'ohp',      rm: oneRMs.ohp      || 0 },
    { label: ru ? 'Тяга'   : 'Deadlift', lift: 'deadlift', rm: oneRMs.deadlift || 0 },
    { label: ru ? 'Присед' : 'Squat',    lift: 'squat',    rm: oneRMs.squat    || 0 },
    { label: ru ? 'Объём'  : 'Volume',   lift: null,       rm: 0 },
    { label: ru ? 'Регул.' : 'Consist.', lift: null,       rm: 0 },
  ];

  const pcts = axes.map((a, i) => {
    if (a.lift) {
      if (!a.rm) return 4;
      const tier = exrxTier({ lift: a.lift, sex, bodyweight: bw, oneRM: a.rm, age: effectiveAge });
      return _tierPct(tier);
    }
    return i === 4 ? volPct : consPct;
  });

  const cx = 120, cy = 120, R = 75;
  const rings = [20, 40, 60, 80, 100];

  const ringSVG = rings.map(p =>
    `<polygon points="${_polygon(cx, cy, R, [p,p,p,p,p,p])}" fill="none" stroke="var(--c-border)" stroke-width="1"/>`
  ).join('');

  const spokeSVG = axes.map((_, i) => {
    const { x, y } = _polar(cx, cy, R, i * 60);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--c-border)" stroke-width="1"/>`;
  }).join('');

  const dataPts = _polygon(cx, cy, R, pcts);

  const labelSVG = axes.map((a, i) => {
    const { x, y } = _polar(cx, cy, R + 18, i * 60);
    const anchor = x < cx - 4 ? 'end' : x > cx + 4 ? 'start' : 'middle';
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" fill="var(--c-text-3)" font-size="10" font-weight="700" letter-spacing="0.04em" class="radar-lbl">${a.label}</text>`;
  }).join('');

  return `
<div class="pp-section-lbl" style="margin-top:var(--sp-3)">${ru ? 'Профиль силы' : 'Strength Profile'}</div>
<div class="pp-radar-wrap">
  <svg class="pp-radar" viewBox="-15 0 270 240" role="img" aria-label="${ru ? 'Радар силы' : 'Strength radar'}">
    ${ringSVG}
    ${spokeSVG}
    <polygon points="${dataPts}" fill="var(--c-accent-bg)" stroke="var(--c-accent)" stroke-width="1.5" stroke-linejoin="round">
      <animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze"/>
    </polygon>
    ${labelSVG}
  </svg>
</div>`;
}
