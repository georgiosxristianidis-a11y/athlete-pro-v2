// @ts-check
import { tri } from '../locale.store.js';
import { exrxTier } from '../strength-engine.js';
import { flag } from '../flags.js';
import { on, onKeydown } from '../events.js';
import { buildRecords } from '../shared/exercise-records.js';
import { axisCardHtml, hintHtml, nextSelection, isActivateKey } from './radar-axis-card.js';

/* DATA-4 (флаг muscles-ui): состояние радара — выбранная ось и готовые карточки живут здесь,
   перерисовка радара их заменяет. Полигон не перерисовывается: меняются классы, r вершины, карточка. */
/** @type {string|null} */
let _selected = null;
/** @type {Map<string, string>} */
let _cards = new Map();

/** @param {Element} g */
function _pickAxis(g) {
  const key = /** @type {HTMLElement} */ (g).dataset.axis || '';
  _selected = nextSelection(_selected, key);
  const root = g.closest('.pp-radar-wrap');
  root?.querySelectorAll('.pp-axbtn').forEach((el) => {
    const on_ = /** @type {HTMLElement} */ (el).dataset.axis === _selected;
    el.classList.toggle('on', on_);
    el.setAttribute('aria-pressed', on_ ? 'true' : 'false');
    el.querySelector('.pp-vtx')?.setAttribute('r', on_ ? '4' : '3');
  });
  const card = root?.querySelector('#pp-radar-card');
  if (card) card.innerHTML = _selected ? (_cards.get(_selected) || hintHtml()) : hintHtml();
}
on('radar-axis', (el) => _pickAxis(el));
onKeydown('radar-axis-key', (el, e) => {
  if (!isActivateKey(e)) return;
  e.preventDefault();
  _pickAxis(el);
});
on('radar-open-stats', () => window.Nav?.go('s-stats'));

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
    { label: tri('Жим', 'Bench', 'Bench'),    lift: 'bench',    rm: oneRMs.bench    || 0 },
    { label: tri('Жим ст', 'OHP', 'OHP'),      lift: 'ohp',      rm: oneRMs.ohp      || 0 },
    { label: tri('Тяга', 'Deadlift', 'Deadlift'), lift: 'deadlift', rm: oneRMs.deadlift || 0 },
    { label: tri('Присед', 'Squat', 'Squat'),    lift: 'squat',    rm: oneRMs.squat    || 0 },
    { label: tri('Объём', 'Volume', 'Όγκος'),   lift: null,       rm: 0 },
    { label: tri('Регул.', 'Consist.', 'Σταθερ.'), lift: null,       rm: 0 },
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
    // Не даём подписи вылезти за viewBox (0..240): ~6.4px на символ при font-size 10
    const estW = a.label.length * 6.4;
    let lx = x;
    if (anchor === 'end') lx = Math.max(x, estW + 2);
    else if (anchor === 'start') lx = Math.min(x, 238 - estW);
    return `<text x="${lx.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" fill="var(--c-text-3)" font-size="10" font-weight="700" letter-spacing="0.04em" class="radar-lbl">${a.label}</text>`;
  }).join('');

  const ui = flag('muscles-ui');
  let axisSVG = labelSVG;
  let cardHtml = '';
  if (ui) {
    _selected = null;
    const keyOf = (/** @type {{lift: string|null}} */ a, /** @type {number} */ i) => a.lift || (i === 4 ? 'volume' : 'consist');
    const ctx = { oneRMs, bw, sex, age: effectiveAge, records: buildRecords(workouts), monthVol, sessions30d };
    _cards = new Map(axes.map((a, i) => [keyOf(a, i), axisCardHtml({ key: keyOf(a, i), label: a.label }, ctx)]));
    axisSVG = axes.map((a, i) => {
      const v = _polar(cx, cy, R * pcts[i] / 100, i * 60);
      const t = _polar(cx, cy, R + 18, i * 60);
      const anchor = t.x < cx - 4 ? 'end' : t.x > cx + 4 ? 'start' : 'middle';
      const estW = a.label.length * 6.4;
      let lx = t.x;
      if (anchor === 'end') lx = Math.max(t.x, estW + 2);
      else if (anchor === 'start') lx = Math.min(t.x, 238 - estW);
      return `<g class="pp-axbtn" data-action="radar-axis" data-keydown="radar-axis-key" data-axis="${keyOf(a, i)}" role="button" tabindex="0" aria-pressed="false" aria-label="${a.label}">
      <circle class="pp-vtx" r="3" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}"/>
      <circle class="pp-hit" r="19" cx="${lx.toFixed(1)}" cy="${t.y.toFixed(1)}"/>
      <circle class="pp-hit" r="12" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}"/>
      <text class="pp-ax-lbl" x="${lx.toFixed(1)}" y="${(t.y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="10" font-weight="700" letter-spacing="0.04em">${a.label}</text>
    </g>`;
    }).join('');
    cardHtml = `<div class="pp-radar-card" id="pp-radar-card" aria-live="polite">${hintHtml()}</div>`;
  }

  return `
<div class="pp-section-lbl pp-section-lbl-gap">${tri('Профиль силы', 'Strength Profile', 'Προφίλ δύναμης')}</div>
<div class="pp-radar-wrap">
  <svg class="pp-radar" viewBox="0 0 240 240" role="img" aria-label="${tri('Радар силы', 'Strength radar', 'Ραντάρ δύναμης')}">
    ${ringSVG}
    ${spokeSVG}
    <polygon points="${dataPts}" fill="var(--c-accent-bg)" stroke="var(--c-accent)" stroke-width="1.5" stroke-linejoin="round">
      <animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze"/>
    </polygon>
    ${axisSVG}
  </svg>
  ${cardHtml}
</div>`;
}
