// @ts-check
import { exrxTier } from '../strength-engine.js';

const TIER_ORDER = ['untrained', 'novice', 'intermediate', 'advanced', 'elite'];
const TIER_COLOR = {
  untrained:    'var(--c-text-3)',
  novice:       'var(--c-blue)',
  intermediate: 'var(--c-amber)',
  advanced:     'var(--c-purple)',
  elite:        'var(--c-accent)',
};

const TIER_RU = {
  untrained: 'Новичок',
  novice: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
  elite: 'Элита',
};

const LIFT_EN = { bench: 'Bench', squat: 'Squat', deadlift: 'Deadlift', ohp: 'OHP' };
const LIFT_RU = { bench: 'Жим', squat: 'Присед', deadlift: 'Тяга', ohp: 'Жим стоя' };

/**
 * @param {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} oneRMs
 * @param {number} bw
 * @param {'m'|'f'} sex
 * @param {number|null} age
 * @param {string} lang
 * @returns {string}
 */
export function renderLiftBars(oneRMs, bw, sex, age, lang) {
  const ru = lang === 'ru';
  const names = ru ? LIFT_RU : LIFT_EN;
  const effectiveAge = age || 30;

  const rows = ['bench', 'squat', 'deadlift', 'ohp'].map((lift, idx) => {
    const rm = oneRMs[lift] || 0;
    const tierData = rm
      ? exrxTier({ lift, sex, bodyweight: bw, oneRM: rm, age: effectiveAge })
      : null;
    
    const tier = tierData?.tier || 'untrained';
    const tierIdx = TIER_ORDER.indexOf(tier);
    const color = TIER_COLOR[tier];
    const pct = rm ? Math.round((tierIdx + 1) / TIER_ORDER.length * 100) : 0;
    const barDelay = (0.15 + idx * 0.07).toFixed(2);

    const dots = TIER_ORDER.map((t, i) => {
      const filled = rm && i <= tierIdx;
      return `<div class="lift-dot${filled ? ' filled' : ''}" style="${filled ? `background:${TIER_COLOR[t]}` : ''}"></div>`;
    }).join('');

    const percentileText = tierData && tierData.percentile > 0
      ? `<div class="lift-percentile">${ru ? 'Топ' : 'Top'} ${100 - tierData.percentile}%</div>`
      : '';

    return `
<div class="lift-row-v2">
  <div class="lift-info-v2">
    <div class="lift-name-v2">${names[lift]}</div>
    <div class="lift-tier-label" style="color:${color}">${ru ? TIER_RU[tier] : tier.charAt(0).toUpperCase() + tier.slice(1)}</div>
  </div>
  
  <div class="lift-bar-wrap-v2">
    <div class="lift-bar-track">
      <div class="lift-bar-fill" style="--bar-w:${pct}%;--bar-delay:${barDelay}s;background:${color}"></div>
    </div>
    <div class="lift-dots-v2">${dots}</div>
  </div>
  
  <div class="lift-stats-v2">
    <div class="lift-rm-v2">${rm ? `${rm}<span class="lift-rm-u">kg</span>` : '—'}</div>
    ${percentileText}
  </div>
</div>`;
  }).join('');

  return `
<div class="pp-section-lbl" style="margin-top:var(--sp-4); margin-bottom:var(--sp-2)">${ru ? 'Силовые показатели' : 'Strength Records'}</div>
<div class="pp-card-v2 pp-lifts-v2">${rows}</div>`;
}
