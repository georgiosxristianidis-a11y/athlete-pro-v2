// @ts-check
import { exrxTier } from '../strength-engine.js';

const TIER_ORDER = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const TIER_COLOR = {
  Untrained:    'var(--c-text-3)',
  Novice:       'var(--c-blue)',
  Intermediate: 'var(--c-amber)',
  Advanced:     'var(--c-purple)',
  Elite:        'var(--c-accent)',
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

  const rows = ['bench', 'squat', 'deadlift', 'ohp'].map(lift => {
    const rm = oneRMs[lift] || 0;
    const tier = rm
      ? exrxTier({ lift, sex, bodyweight: bw, oneRM: rm, age: effectiveAge })
      : 'Untrained';
    const tierIdx = TIER_ORDER.indexOf(tier);
    const color = TIER_COLOR[tier];
    const pct = rm ? Math.round((tierIdx + 1) / TIER_ORDER.length * 100) : 0;

    const dots = TIER_ORDER.map((t, i) => {
      const filled = rm && i <= tierIdx;
      return `<div class="lift-dot${filled ? ' filled' : ''}" style="${filled ? `background:${TIER_COLOR[t]}` : ''}"></div>`;
    }).join('');

    return `
<div class="lift-row">
  <div class="lift-name">${names[lift]}</div>
  <div class="lift-bar-wrap">
    <div class="lift-bar-track">
      <div class="lift-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
  </div>
  <div class="lift-rm">${rm ? `${rm}<span class="lift-rm-u">kg</span>` : '—'}</div>
  <div class="lift-dots">${dots}</div>
</div>`;
  }).join('');

  return `
<div class="pp-section-lbl" style="margin-top:var(--sp-3)">${ru ? 'Рекорды' : 'Lift Records'}</div>
<div class="pp-card pp-lifts">${rows}</div>`;
}
