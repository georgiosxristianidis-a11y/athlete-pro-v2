// @ts-check
import { on } from '../events.js';

on('bento:toggleGlow', (el) => el.classList.toggle('pp-bento-glow'));

/** @param {Array<{timestamp: number}>} workouts @returns {number} */
function _streak(workouts) {
  if (!workouts.length) return 0;
  const days = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (days.has(key)) {
      streak++;
    } else if (i === 0) {
      // no workout today — start checking from yesterday
      continue;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * @param {Array<{timestamp: number, tonnage?: number, duration?: number}>} workouts
 * @param {number} dots
 * @param {string} lang
 * @returns {string}
 */
export function renderBento(workouts, dots, lang) {
  const ru = lang === 'ru';
  const streak = _streak(workouts);
  const totalVol = Math.round(workouts.reduce((s, w) => s + (w.tonnage || 0), 0) / 1000);
  const totalHrs = Math.round(workouts.reduce((s, w) => s + (w.duration || 0), 0) / 3600000);

  const cells = [
    {
      id: 'bento-dots',
      val: dots || '—',
      lbl: 'DOTS',
      sub: ru ? 'Коэффициент' : 'Score',
      color: 'var(--c-accent)',
      glow: 'var(--glow-accent-md)',
    },
    {
      id: 'bento-streak',
      val: streak || '—',
      lbl: ru ? 'Серия' : 'Streak',
      sub: ru ? 'дней подряд' : 'days',
      color: 'var(--c-amber)',
      glow: 'var(--glow-amber-md)',
    },
    {
      id: 'bento-vol',
      val: totalVol || '—',
      lbl: ru ? 'Тоннаж' : 'Volume',
      sub: ru ? 'тонн' : 'tonnes',
      color: 'var(--c-blue)',
      glow: 'var(--glow-blue-md)',
    },
    {
      id: 'bento-hrs',
      val: totalHrs || '—',
      lbl: ru ? 'Часы' : 'Hours',
      sub: ru ? 'тренировок' : 'trained',
      color: 'var(--c-secondary)',
      glow: 'var(--glow-purple-md)',
    },
  ];

  return `
<div class="pp-bento">
  ${cells.map(c => `
  <div class="pp-bento-cell" id="${c.id}" style="--bento-color:${c.color};--bento-glow:${c.glow}"
       data-action="bento:toggleGlow">
    <div class="pp-bento-val" style="color:${c.color}">${c.val}</div>
    <div class="pp-bento-lbl">${c.lbl}</div>
    <div class="pp-bento-sub">${c.sub}</div>
  </div>`).join('')}
</div>`;
}
