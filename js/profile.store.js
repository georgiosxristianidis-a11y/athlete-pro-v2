// @ts-check
/* ════════════════════════════════════════════════════════
   profile.store.js — User profile state + computed metrics
   ────────────────────────────────────────────────────────
   Storage: DB.Settings (key/value, IndexedDB).
   Schema namespaced under 'profile.*'.
   Computed fields (BMI, FFMI, age, LBM) derived on read.

   A13 (18.09): единственный вход в IndexedDB для экрана профиля.
   `js/profile.js` владеет экраном и DOM, `js/profile.view*` — разметкой;
   ни один из них не зовёт `DB.*` (baseline A15 в test/import-guard.test.js).
   Ниже профиля лежат три секции того же экрана: настройки приложения,
   маскот и управление данными — их ключи живут в том же key/value-сторе.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { K_LAST_EXPORT } from './db/backup.js';

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

/* ════════════════════════════════════════════════════════
   APP SETTINGS — тумблеры экрана профиля (A13)
   ────────────────────────────────────────────────────────
   Настройки приложения лежат в том же key/value-сторе, что профиль, и
   рисуются на том же экране. Экран получает готовый снимок и зовёт
   именованный тумблер; ключей он больше не знает.
   ════════════════════════════════════════════════════════ */

/**
 * Снимок всех настроек для рендера экрана.
 * Наружу не уходит: profile.js рисует им UI, а не шлёт в запрос —
 * снимок содержит BYOK-ключи (см. test/perimeter-guard.test.js).
 * @returns {Promise<Record<string, any>>}
 */
export async function getAllSettings() {
  return DB.Settings.getAll();
}

/** Язык интерфейса, как он лежит в базе. Фолбэк 'en' — здесь, не у вызывающего.
 *  @returns {Promise<string>} */
export async function getStoredLang() {
  return (await DB.Settings.get('lang', 'en')) || 'en';
}

/** on/off тумблер настройки. Дефолт ON (opt-out), возвращает новое значение.
 *  @param {string} key @returns {Promise<'on'|'off'>} */
async function _toggleOnOff(key) {
  const current = await DB.Settings.get(key, 'on');
  const next = current === 'off' ? 'on' : 'off';
  await DB.Settings.set(key, next);
  return next;
}

/** Длительность отдыха, шаг от кнопок ±. Границы 15..300 с — здесь, не в UI.
 *  @param {number} delta @returns {Promise<number>} новая длительность */
export async function adjustRestDuration(delta) {
  const current = parseInt((await DB.Settings.get('rest-duration')) || 90);
  const next = Math.max(15, Math.min(300, current + delta));
  await DB.Settings.set('rest-duration', next);
  return next;
}

/** @param {string} unit */
export async function setWeightUnit(unit) {
  await DB.Settings.set('weight-unit', unit);
}

export async function toggleHapticPref() {
  return _toggleOnOff('haptic');
}

export async function toggleAutoProgressPref() {
  return _toggleOnOff('auto-progress');
}

/** BG-1: дефолт ON (opt-out) — держится в `_toggleOnOff`. */
export async function toggleKeepAwakePref() {
  return _toggleOnOff('keep-awake');
}

/** @returns {Promise<'on'|'off'>} */
export async function getNotifyRest() {
  return (await DB.Settings.get('notify-rest', 'off')) === 'on' ? 'on' : 'off';
}

/** @param {'on'|'off'} value */
export async function setNotifyRest(value) {
  await DB.Settings.set('notify-rest', value);
}

/* ════════════════════════════════════════════════════════
   MASCOT — видимость панды
   ────────────────────────────────────────────────────────
   Две записи на одно состояние: 'ai-panda-hidden' читает FAB,
   'show-mascot' — пустой Home. Пара обязана меняться вместе, поэтому
   живёт функцией здесь, а не двумя `set` на каждом тумблере экрана.
   ════════════════════════════════════════════════════════ */

/** @returns {Promise<boolean>} новое состояние «панда скрыта» */
export async function togglePandaHidden() {
  const current = await DB.Settings.get('ai-panda-hidden', false);
  const next = !current;
  await DB.Settings.set('ai-panda-hidden', next);
  await DB.Settings.set('show-mascot', next ? 'off' : 'on');
  return next;
}

/** Показать маскота: включение живой панды и мимик иначе шло бы «в пустоту». */
export async function revealMascot() {
  await DB.Settings.set('ai-panda-hidden', false);
  await DB.Settings.set('show-mascot', 'on');
}

/* ════════════════════════════════════════════════════════
   PASSPORT — данные под hero, бенто и радар
   ════════════════════════════════════════════════════════ */

/**
 * Всё, что паспорту нужно из базы, одним заходом.
 * Маппинг 1RM (`mapOneRMs`) остаётся во view намеренно: `js/shared/lift-map.js`
 * снят с бут-графа (BOOT-TRIM), а этот стор в первом кадре — статический импорт
 * вернул бы модуль в install-фазу прекеша.
 * @returns {Promise<{ profile: ProfileData, workouts: any[], latestMetrics: any, oneRMsRaw: any[] }>}
 */
export async function loadPassportSources() {
  const [profile, workouts, latestMetrics, oneRMsRaw] = await Promise.all([
    loadProfile(),
    DB.Workouts.getAll(),
    DB.Metrics.latest(),
    DB.OneRM.getAll(),
  ]);
  return { profile, workouts, latestMetrics, oneRMsRaw };
}

/** Фото и индекс палитры аватара (Athlete Room).
 *  @returns {Promise<{ photo: string|null, colorIdx: number }>} */
export async function getAvatarAppearance() {
  const [photo, colorIdxRaw] = await Promise.all([
    DB.Settings.get('athlete-photo', null),
    DB.Settings.get('avatar-color', '0'),
  ]);
  return { photo, colorIdx: parseInt(colorIdxRaw) || 0 };
}

/* ════════════════════════════════════════════════════════
   DATA — бэкап, экспорт, удаление
   ════════════════════════════════════════════════════════ */

/** @returns {Promise<string>} JSON бэкапа */
export async function exportBackupJson() {
  return DB.Backup.export();
}

/** Дата последнего JSON-бэкапа — её же читает напоминалка в app.js.
 *  @param {number} ts */
export async function saveLastExportAt(ts) {
  await DB.Settings.set(K_LAST_EXPORT, ts);
}

/** @param {string} text */
export async function importBackupJson(text) {
  await DB.Backup.import(text);
}

/** Пользовательское «удалить все мои данные»: мимо `DB.clearAll()` —
 *  тот не трогает localStorage, и курсор синка утянул бы историю назад
 *  (гард test/clear-all-local.test.js). */
export async function deleteAllUserData() {
  await DB.deleteAllUserData();
}

/** @returns {Promise<any[]>} */
export async function getAllWorkouts() {
  return DB.Workouts.getAll();
}

/** @returns {Promise<number>} сколько дублей убрано */
export async function deduplicateWorkouts() {
  return DB.Workouts.deduplicate();
}

/** Место тренировок для шапки TXT-журнала.
 *  @returns {Promise<{ gym: string, country: string }>} */
export async function getGymPlace() {
  const [gym, country] = await Promise.all([
    DB.Settings.get('gym-name', ''),
    DB.Settings.get('gym-country', ''),
  ]);
  return { gym: gym || '', country: country || '' };
}

/** @param {{ gym?: string, country?: string }} place */
export async function saveGymPlace(place) {
  await Promise.all([
    DB.Settings.set('gym-name', place.gym || ''),
    DB.Settings.set('gym-country', place.country || ''),
  ]);
}

/**
 * Источники TXT-журнала. Отказ любого необязательного куска не ломает выгрузку:
 * рекорды, профиль и вес падают в пустоту, журнал уезжает без них.
 * @returns {Promise<{ workouts: any[], orms: any[], customName: string, profile: ProfileData|null, metrics: any }>}
 */
export async function loadTxtExportSources() {
  const [workouts, orms, customName, profile, metrics] = await Promise.all([
    DB.Workouts.getAll(),
    DB.OneRM.getAll().catch(() => []),
    DB.Settings.get('athlete-name', ''),
    loadProfile().catch(() => null),
    DB.Metrics.latest().catch(() => null),
  ]);
  return { workouts, orms: orms || [], customName: customName || '', profile, metrics };
}
