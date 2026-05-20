// @ts-check
import { computeAge } from '../profile.store.js';
import { dotsScore } from '../strength-engine.js';

const TIER_COLOR = {
  Untrained:    'var(--c-text-3)',
  Novice:       'var(--c-blue)',
  Intermediate: 'var(--c-amber)',
  Advanced:     'var(--c-purple)',
  Elite:        'var(--c-accent)',
};

const GOAL_EN = { strength: 'Strength', hypertrophy: 'Hypertrophy', cut: 'Cut', maintain: 'Maintain' };
const GOAL_RU = { strength: 'Сила', hypertrophy: 'Масса', cut: 'Сушка', maintain: 'Поддержание' };

/** @param {number} dots */
function _tierFromDots(dots) {
  if (!dots) return 'Untrained';
  if (dots < 200) return 'Untrained';
  if (dots < 300) return 'Novice';
  if (dots < 380) return 'Intermediate';
  if (dots < 470) return 'Advanced';
  return 'Elite';
}

const TIER_RU = {
  Untrained: 'Новичок', Novice: 'Начинающий',
  Intermediate: 'Средний', Advanced: 'Продвинутый', Elite: 'Элита',
};

/**
 * @param {import('../profile.store.js').ProfileData} profile
 * @param {{ weight: number, height: number, bmi: number }|null} metrics
 * @param {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} oneRMs
 * @param {string} lang
 * @returns {string}
 */
export function renderPassportHero(profile, metrics, oneRMs, lang) {
  const ru = lang === 'ru';
  const age = computeAge(profile.dob);
  const bw = metrics?.weight || 80;
  const total = (oneRMs.squat || 0) + (oneRMs.bench || 0) + (oneRMs.deadlift || 0);
  const dots = total ? dotsScore({ total, bodyweight: bw, sex: profile.sex }) : 0;
  const tier = _tierFromDots(dots);
  const tierColor = TIER_COLOR[tier];
  const tierLabel = ru ? TIER_RU[tier] : tier;
  const goalMap = ru ? GOAL_RU : GOAL_EN;

  const initials = (profile.name || '')
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';

  const metaStr = [
    age ? (ru ? `${age} лет` : `${age} yo`) : null,
    profile.experienceYears ? (ru ? `${profile.experienceYears} г. опыта` : `${profile.experienceYears}y exp`) : null,
  ].filter(Boolean).join(' · ');

  const statsStrip = metrics ? `
<div class="pp-stats-strip">
  <div class="pp-stat">
    <div class="pp-stat-val">${metrics.weight}<span class="pp-stat-u">kg</span></div>
    <div class="pp-stat-lbl">${ru ? 'Вес' : 'Weight'}</div>
  </div>
  <div class="pp-stat-div"></div>
  <div class="pp-stat">
    <div class="pp-stat-val">${metrics.height}<span class="pp-stat-u">cm</span></div>
    <div class="pp-stat-lbl">${ru ? 'Рост' : 'Height'}</div>
  </div>
  <div class="pp-stat-div"></div>
  <div class="pp-stat">
    <div class="pp-stat-val" style="color:${metrics.bmi < 25 ? 'var(--c-accent)' : 'var(--c-amber)'}">${metrics.bmi.toFixed(1)}</div>
    <div class="pp-stat-lbl">BMI</div>
  </div>
  <div class="pp-stat-div"></div>
  <div class="pp-stat">
    <div class="pp-stat-val">${total ? Math.round(total) : '—'}<span class="pp-stat-u">kg</span></div>
    <div class="pp-stat-lbl">${ru ? 'Сумма' : 'Total'}</div>
  </div>
</div>` : '';

  return `
<div class="pp-hero">
  <div class="pp-avatar">${initials}</div>
  <div class="pp-identity">
    <div class="pp-name">${profile.name || (ru ? 'Атлет' : 'Athlete')}</div>
    ${metaStr ? `<div class="pp-meta">${metaStr}</div>` : ''}
    <div class="pp-tier-pill" style="color:${tierColor};border-color:${tierColor}20;background:${tierColor}0d">
      ${tierLabel}${dots ? ` · ${dots}` : ''}
    </div>
  </div>
  <div class="pp-goal-badge">
    <div class="pp-goal-label">${ru ? 'Цель' : 'Goal'}</div>
    <div class="pp-goal-val">${goalMap[profile.goal] || profile.goal}</div>
  </div>
</div>
${statsStrip}`;
}
