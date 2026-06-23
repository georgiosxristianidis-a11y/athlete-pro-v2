// @ts-check
import { computeAge } from '../profile.store.js';
import { fmtNum } from '../shared/format.js';
import { athleteProScore, exrxTier } from '../strength-engine.js';
import { DB } from '../db.js';
import { esc } from '../shared/utils.js';

const TIER_COLOR = {
  Untrained:    'var(--c-text-3)',
  Novice:       'var(--c-text-2)',
  Intermediate: 'var(--c-text-2)',
  Advanced:     'var(--c-text-1)',
  Elite:        'var(--c-text-1)',
};

const TIER_RU = {
  Untrained: 'Новичок', Novice: 'Начинающий',
  Intermediate: 'Средний', Advanced: 'Продвинутый', Elite: 'Элита',
};

const GOAL_EN = { strength: 'Strength', hypertrophy: 'Hypertrophy', cut: 'Cut', maintain: 'Maintain' };
const GOAL_RU = { strength: 'Сила', hypertrophy: 'Масса', cut: 'Сушка', maintain: 'Поддержание' };

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
  
  // Overall athlete score tier (composite athleteProScore, not raw DOTS)
  const total = (oneRMs.squat || 0) + (oneRMs.bench || 0) + (oneRMs.deadlift || 0);
  const score = total ? athleteProScore({ total, bodyweight: bw, sex: profile.sex, age, experience: profile.experienceYears, height: metrics?.height }) : 0;
  const tier = _tierFromScore(score);
  const tierColor = TIER_COLOR[tier];
  const tierLabel = ru ? TIER_RU[tier] : tier;
  const goalMap = ru ? GOAL_RU : GOAL_EN;

  // Best lift percentile (Top X% logic)
  let bestPercentile = 0;
  ['bench', 'squat', 'deadlift', 'ohp'].forEach(lift => {
    const rm = oneRMs[lift];
    if (rm) {
      const res = exrxTier({ lift, sex: profile.sex, bodyweight: bw, oneRM: rm, age: age || 30 });
      if (res && res.percentile > bestPercentile) bestPercentile = res.percentile;
    }
  });

  const initials = (profile.name || '')
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';

  const metaStr = [
    age ? (ru ? `${age} лет` : `${age} yo`) : null,
    profile.experienceYears ? (ru ? `${profile.experienceYears} г. опыта` : `${profile.experienceYears}y exp`) : null,
  ].filter(Boolean).join(' · ');

  // Photo & Color cycle integration from AthleteRoom
  // We'll use a placeholder for the photo and ring color, to be populated by the caller if possible
  // or just default to initials for now as we don't want to make renderPassportHero async
  return `
<div class="pp-hero-v2">
  <div class="pp-avatar-wrap">
    <div class="pp-avatar-v2" id="pp-avatar-main" onclick="window.AthleteRoom?.open()">
      <span class="pp-avatar-initials">${esc(initials)}</span>
    </div>
    <div class="pp-avatar-ring" id="pp-avatar-ring-main"></div>
  </div>
  
  <div class="pp-identity-v2">
    <div class="pp-name-v2">${esc(profile.name || (ru ? 'Атлет' : 'Athlete'))}</div>
    <div class="pp-meta-v2">${esc(metaStr) || (ru ? 'Настрой профиль' : 'Set up your profile')}</div>
    
    <div class="pp-badge-row">
      <div class="pp-tier-pill-v2" style="color:${tierColor}; border-color:${tierColor}20; background:${tierColor}0d">
        ${esc(tierLabel)} ${score ? `· <span style="color:var(--c-amber); text-shadow: 0 0 12px rgba(255,179,0,0.4)">${score}</span>` : ''}
      </div>
      ${bestPercentile > 0 ? `
        <div class="pp-percentile-pill">
          ${ru ? 'Топ' : 'Top'} ${100 - bestPercentile}%
        </div>
      ` : ''}
    </div>
  </div>

  <div class="pp-goal-v2">
    <div class="pp-goal-lbl-v2">${ru ? 'Цель' : 'Goal'}</div>
    <div class="pp-goal-val-v2">${esc(goalMap[profile.goal] || profile.goal)}</div>
  </div>
</div>

<div class="pp-metrics-strip" style="cursor: pointer;" onclick="window._arActiveTab = 'metrics'; window.AthleteRoom?.open()" title="Edit Metrics">
  <div class="pp-m-item">
    <div class="pp-m-val">${metrics?.weight || '—'}<span class="pp-m-u">kg</span></div>
    <div class="pp-m-lbl">${ru ? 'Вес' : 'Weight'}</div>
  </div>
  <div class="pp-m-div"></div>
  <div class="pp-m-item">
    <div class="pp-m-val">${metrics?.height || '—'}<span class="pp-m-u">cm</span></div>
    <div class="pp-m-lbl">${ru ? 'Рост' : 'Height'}</div>
  </div>
  <div class="pp-m-div"></div>
  <div class="pp-m-item">
    <div class="pp-m-val" style="color:${(metrics?.bmi || 0) < 25 ? 'var(--c-accent)' : 'var(--c-amber)'}">
      ${metrics?.bmi ? fmtNum(metrics.bmi) : '—'}
    </div>
    <div class="pp-m-lbl">BMI</div>
  </div>
</div>
`;
}

/** @param {number} score */
function _tierFromScore(score) {
  if (!score || score < 200) return 'Untrained';
  if (score < 300) return 'Novice';
  if (score < 380) return 'Intermediate';
  if (score < 470) return 'Advanced';
  return 'Elite';
}
