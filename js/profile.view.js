// @ts-check
/* ════════════════════════════════════════════════════════
   profile.view.js — Barrel + render entry for Profile Passport UI
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { loadProfile, computeAge } from './profile.store.js';
import { dotsScore } from './strength-engine.js';
import { renderPassportHero } from './profile.view/passport-hero.js';
import { renderBento }        from './profile.view/bento.js';
import { renderHexagonRadar } from './profile.view/hexagon-radar.js';
import { renderLiftBars }     from './profile.view/lift-bars.js';

export { renderPassportHero, renderBento, renderHexagonRadar, renderLiftBars };

/* Exercise name → lift key mapping */
const LIFT_PATTERNS = [
  { key: 'bench',    tests: [/barbell bench press/i, /bench press/i] },
  { key: 'squat',    tests: [/barbell back squat/i, /back squat/i]   },
  { key: 'deadlift', tests: [/deadlift \(conventional\)/i, /deadlift/i] },
  { key: 'ohp',      tests: [/overhead press/i, /\bohp\b/i]          },
];

/** @param {Array<{id: string, value: number}>} records */
function _mapOneRMs(records) {
  /** @type {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} */
  const result = {};
  for (const r of records) {
    for (const { key, tests } of LIFT_PATTERNS) {
      if (tests.some(re => re.test(r.id))) {
        if (!result[key] || r.value > result[key]) result[key] = r.value;
        break;
      }
    }
  }
  return result;
}

/**
 * Render the full Passport UI into a container element.
 * @param {HTMLElement} container
 * @param {string} [lang]
 */
export async function renderProfile(container, lang) {
  const resolvedLang = lang || (await DB.Settings.get('lang', 'en')) || 'en';

  const [profile, workouts, latestMetrics, oneRMsRaw] = await Promise.all([
    loadProfile(),
    DB.Workouts.getAll(),
    DB.Metrics.latest(),
    DB.OneRM.getAll(),
  ]);

  const metrics = latestMetrics || null;
  const bw = metrics?.weight || 80;
  const age = computeAge(profile.dob);
  const oneRMs = _mapOneRMs(oneRMsRaw);

  const total = (oneRMs.squat || 0) + (oneRMs.bench || 0) + (oneRMs.deadlift || 0);
  // Bento "DOTS" tile shows the pure DOTS coefficient (matches Athlete Room's
  // DOTS stat). The composite athleteProScore lives in the passport hero / room.
  const dots = total ? dotsScore({ total, bodyweight: bw, sex: profile.sex }) : 0;

  container.innerHTML =
    renderPassportHero(profile, metrics, oneRMs, resolvedLang) +
    renderBento(workouts, dots, resolvedLang) +
    renderHexagonRadar(oneRMs, bw, profile.sex, age, workouts, resolvedLang) +
    renderLiftBars(oneRMs, bw, profile.sex, age, resolvedLang);

  // Post-render: Apply AthleteRoom photo and colors
  _syncAvatar(container);
}

/** @param {HTMLElement} container */
async function _syncAvatar(container) {
  const [photo, colorIdxRaw] = await Promise.all([
    DB.Settings.get('athlete-photo', null),
    DB.Settings.get('avatar-color', '0'),
  ]);

  const avatar = container.querySelector('#pp-avatar-main');
  const ring = container.querySelector('#pp-avatar-ring-main');
  if (!avatar) return;

  if (photo) {
    avatar.style.backgroundImage = `url(${photo})`;
    avatar.style.backgroundSize = 'cover';
    const initials = avatar.querySelector('.pp-avatar-initials');
    if (initials) initials.style.display = 'none';
  }

  // Ring color matching AthleteRoom palette
  const palettes = [
    ['#4f46e5', '#06b6d4'], ['#10b981', '#059669'], ['#f59e0b', '#d97706'],
    ['#ec4899', '#be185d'], ['#8b5cf6', '#6d28d9']
  ];
  const idx = parseInt(colorIdxRaw) || 0;
  const [c1] = palettes[idx % palettes.length];
  if (ring) {
    ring.style.borderColor = c1;
    ring.style.opacity = '0.4';
  }
}
