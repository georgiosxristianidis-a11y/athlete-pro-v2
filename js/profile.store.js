// @ts-check
/* ════════════════════════════════════════════════════════
   profile.store.js — User profile state + computed metrics
   ────────────────────────────────────────────────────────
   Storage: DB.Settings (key/value, IndexedDB).
   Schema namespaced under 'profile.*'.
   Computed fields (BMI, FFMI, age, LBM) derived on read.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

const KEYS = {
  name: 'profile.name',
  dob: 'profile.dob', // ISO date string YYYY-MM-DD
  sex: 'profile.sex', // 'm' | 'f'  (also used by body-stats Navy formula via 'sex' key — see migration)
  experienceYears: 'profile.experienceYears',
  goal: 'profile.goal', // 'strength' | 'hypertrophy' | 'cut' | 'maintain'
  equipment: 'profile.equipment', // 'gym' | 'home' | 'minimal' | 'hotel'
  injuries: 'profile.injuries', // string[]
  restingHr: 'profile.restingHr',
  avatarBlobId: 'profile.avatarBlobId',
  onboardingCompleted: 'profile.onboardingCompleted',
  sealedEnvelope: 'profile.sealedEnvelope', // { goal, createdAt, revealAt }
  // Phase 4: AI Coach Pro context fields
  trainingMode: 'training-mode', // 'strength' | 'hypertrophy' | 'recovery' | 'maintenance'
  limitationsText: 'coach.injuries', // free-text injuries/restrictions for AI coach
  sessionTime: 'session-time', // number (minutes): 30 | 45 | 60 | 90 | 0 (unlimited)
};

/**
 * @typedef {{
 *   name: string,
 *   dob: string|null,
 *   sex: 'm'|'f',
 *   experienceYears: number,
 *   goal: 'strength'|'hypertrophy'|'cut'|'maintain',
 *   equipment: 'gym'|'home'|'minimal'|'hotel',
 *   injuries: string[],
 *   restingHr: number|null,
 *   avatarBlobId: string|null,
 *   onboardingCompleted: boolean,
 *   mode: 'strength'|'hypertrophy'|'recovery'|'maintenance',
 *   limitationsText: string,
 *   timeMin: number
 * }} ProfileData
 */

/* ════════════════════════════════════════════════════════
   READ
   ════════════════════════════════════════════════════════ */

/** @returns {Promise<ProfileData>} */
export async function loadProfile() {
  const [name, dob, sexProfile, sexLegacy, exp, goal, equip, injuries, hr, avatar, onb, mode, limitationsText, sessionTime] =
    await Promise.all([
      DB.Settings.get(KEYS.name, ''),
      DB.Settings.get(KEYS.dob, null),
      DB.Settings.get(KEYS.sex, null),
      DB.Settings.get('sex', 'm'), // legacy key used by body-stats.js
      DB.Settings.get(KEYS.experienceYears, 0),
      DB.Settings.get(KEYS.goal, 'hypertrophy'),
      DB.Settings.get(KEYS.equipment, 'gym'),
      DB.Settings.get(KEYS.injuries, []),
      DB.Settings.get(KEYS.restingHr, null),
      DB.Settings.get(KEYS.avatarBlobId, null),
      DB.Settings.get(KEYS.onboardingCompleted, false),
      DB.Settings.get(KEYS.trainingMode, 'strength'),
      DB.Settings.get(KEYS.limitationsText, ''),
      DB.Settings.get(KEYS.sessionTime, 0),
    ]);
  return {
    name: name || '',
    dob: dob || null,
    sex: /** @type {'m'|'f'} */ (sexProfile || sexLegacy || 'm'),
    experienceYears: Number(exp) || 0,
    goal: goal || 'hypertrophy',
    equipment: equip || 'gym',
    injuries: Array.isArray(injuries) ? injuries : [],
    restingHr: hr,
    avatarBlobId: avatar,
    onboardingCompleted: !!onb,
    mode: /** @type {'strength'|'hypertrophy'|'recovery'|'maintenance'} */ (mode || 'strength'),
    limitationsText: limitationsText || '',
    timeMin: Number(sessionTime) || 0,
  };
}

/* ════════════════════════════════════════════════════════
   WRITE
   ════════════════════════════════════════════════════════ */

/** @param {Partial<ProfileData>} patch */
export async function updateProfile(patch) {
  const writes = [];
  if (patch.name !== undefined)            writes.push(DB.Settings.set(KEYS.name, patch.name));
  if (patch.dob !== undefined)             writes.push(DB.Settings.set(KEYS.dob, patch.dob));
  if (patch.sex !== undefined) {
    writes.push(DB.Settings.set(KEYS.sex, patch.sex));
    writes.push(DB.Settings.set('sex', patch.sex)); // mirror to legacy for body-stats
  }
  if (patch.experienceYears !== undefined) writes.push(DB.Settings.set(KEYS.experienceYears, patch.experienceYears));
  if (patch.goal !== undefined)            writes.push(DB.Settings.set(KEYS.goal, patch.goal));
  if (patch.equipment !== undefined)       writes.push(DB.Settings.set(KEYS.equipment, patch.equipment));
  if (patch.injuries !== undefined)        writes.push(DB.Settings.set(KEYS.injuries, patch.injuries));
  if (patch.restingHr !== undefined)       writes.push(DB.Settings.set(KEYS.restingHr, patch.restingHr));
  if (patch.avatarBlobId !== undefined)    writes.push(DB.Settings.set(KEYS.avatarBlobId, patch.avatarBlobId));
  if (patch.onboardingCompleted !== undefined) writes.push(DB.Settings.set(KEYS.onboardingCompleted, patch.onboardingCompleted));
  if (patch.mode !== undefined)             writes.push(DB.Settings.set(KEYS.trainingMode, patch.mode));
  if (patch.limitationsText !== undefined)  writes.push(DB.Settings.set(KEYS.limitationsText, patch.limitationsText));
  if (patch.timeMin !== undefined)          writes.push(DB.Settings.set(KEYS.sessionTime, patch.timeMin));
  await Promise.all(writes);
}

/**
 * Update weight and height metrics and trigger re-render.
 * @param {number} weight 
 * @param {number} height 
 */
export async function updateWeightAndHeight(weight, height) {
  if (!weight || !height) return;
  await DB.Metrics.save(weight, height);
}

/* ════════════════════════════════════════════════════════
   COMPUTED — age, BMI, LBM, FFMI
   ════════════════════════════════════════════════════════ */

/** @param {string|null} dob — ISO YYYY-MM-DD */
export function computeAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function computeBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** @param {number} weightKg @param {number} bodyFatPct */
export function computeLBM(weightKg, bodyFatPct) {
  if (!weightKg || bodyFatPct == null) return null;
  return weightKg * (1 - bodyFatPct / 100);
}

/** Fat-Free Mass Index — natural strength ceiling indicator
 *  >25 considered genetic max for natural lifters.
 *  Formula: LBM(kg) / height(m)^2  (no normalization variant) */
export function computeFFMI(weightKg, heightCm, bodyFatPct) {
  const lbm = computeLBM(weightKg, bodyFatPct);
  if (!lbm || !heightCm) return null;
  const m = heightCm / 100;
  return lbm / (m * m);
}

/* ════════════════════════════════════════════════════════
   SEALED ENVELOPE — 90-day goal review
   ════════════════════════════════════════════════════════ */

export async function sealEnvelope(goalText) {
  const now = Date.now();
  const reveal = now + 90 * 24 * 3600 * 1000;
  const env = { goal: goalText, createdAt: now, revealAt: reveal };
  await DB.Settings.set(KEYS.sealedEnvelope, env);
  return env;
}

export async function getSealedEnvelope() {
  return DB.Settings.get(KEYS.sealedEnvelope, null);
}

export async function clearSealedEnvelope() {
  return DB.Settings.set(KEYS.sealedEnvelope, null);
}
