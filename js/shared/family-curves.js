// @ts-check
/* ════════════════════════════════════════════════════════
   family-curves.js — какие карточки показать на Stats (DATA-3)

   Раньше карточки = топ-N по числу сессий. Тренажёры из импорта 2023-25 набрали 30+
   сессий, а свежие жим ногами и штанга — единицы, и вытесняли их с экрана. Здесь
   выбор идёт по СЕМЕЙСТВАМ реестра (js/shared/exercise-registry.js): одна карточка на
   семейство, её рисует вариант, который тренируют сейчас (подпись «семейство · вариант»).

   Порядок семейств — свежесть, потом объём: сначала те, где были тренировки в окне
   RECENT_DAYS до последней тренировки истории, по числу сессий в окне, затем остальные
   по общему числу сессий. Окно считается от последней тренировки истории, а не от «сегодня»:
   результат детерминирован и не «протухает», пока приложение лежит без дела.
   Слоты делятся по типам тренировки (push/pull/legs/other) по кругу — свежие движения
   одного типа не вытесняют остальные.

   Чистые функции: ни флагов, ни DOM, ни IDB. Флаг `stats-families` стоит у вызывающих.
   ════════════════════════════════════════════════════════ */

import { findExercise } from './exercise-registry.js';
import { recordKey, buildRecords } from './exercise-records.js';
import { isLifted } from './working-sets.js';

/** Окно «свежести» в днях от последней тренировки истории. */
export const RECENT_DAYS = 120;
const DAY_MS = 86400000;

/**
 * @typedef {Object} Activity
 * @property {number} total   тренировок с движением
 * @property {number} recent  из них в окне свежести
 * @property {number} last    timestamp последней
 */

/**
 * Ключ семейства: id семейства реестра, имя вне реестра — своя «семья» из одного движения.
 * @param {string} name
 * @returns {string}
 */
export function familyKey(name) {
  const known = findExercise(name);
  return known ? `family:${known.family}` : recordKey(name);
}

/**
 * Подпись «семейство · вариант» (пусто для имён вне реестра и у безымянных вариантов).
 * @param {string} name
 * @returns {{ family: string, label: string }}
 */
export function familyLabel(name) {
  const known = findExercise(name);
  if (!known) return { family: familyKey(name), label: '' };
  const variant = known.variantRu;
  return { family: `family:${known.family}`, label: variant ? `${known.familyRu} · ${variant}` : known.familyRu };
}

/**
 * Активность по движениям и по семействам.
 * @param {ReadonlyArray<any>|null|undefined} workouts
 * @param {number} [recentDays]
 * @returns {{ byVariant: Map<string, Activity>, byFamily: Map<string, Activity> }}
 */
export function activityOf(workouts, recentDays = RECENT_DAYS) {
  const list = (Array.isArray(workouts) ? workouts : []).filter(
    (w) => w && !w._deleted && Number.isFinite(Number(w.timestamp)) && Number(w.timestamp) > 0,
  );
  let latest = 0;
  for (const w of list) latest = Math.max(latest, Number(w.timestamp));
  const since = latest - recentDays * DAY_MS;

  /** @type {Map<string, Activity>} */
  const byVariant = new Map();
  /** @type {Map<string, Activity>} */
  const byFamily = new Map();
  /** @param {Map<string, Activity>} m @param {string} k @param {number} ts */
  const bump = (m, k, ts) => {
    const a = m.get(k) ?? { total: 0, recent: 0, last: 0 };
    a.total += 1;
    if (ts >= since) a.recent += 1;
    if (ts > a.last) a.last = ts;
    m.set(k, a);
  };

  for (const w of list) {
    const ts = Number(w.timestamp);
    const vSeen = new Set();
    const fSeen = new Set();
    for (const ex of Array.isArray(w.exercises) ? w.exercises : []) {
      if (!ex || typeof ex.name !== 'string') continue;
      const lifted = (Array.isArray(ex.sets) ? ex.sets : []).some((s) => isLifted(s) && Number(s?.weight) > 0);
      if (!lifted) continue;
      const v = recordKey(ex.name);
      const f = familyKey(ex.name);
      if (!vSeen.has(v)) { vSeen.add(v); bump(byVariant, v, ts); }
      if (!fSeen.has(f)) { fSeen.add(f); bump(byFamily, f, ts); }
    }
  }
  return { byVariant, byFamily };
}

/** Свежие впереди, внутри — по числу сессий в окне, потом по общему. @param {Activity} a @param {Activity} b */
const byActivity = (a, b) =>
  (b.recent > 0 ? 1 : 0) - (a.recent > 0 ? 1 : 0) || b.recent - a.recent || b.total - a.total || b.last - a.last;

/**
 * Из кривых по движениям (по одной на вариант) выбрать по одной на семейство и урезать до limit.
 * Каждой выбранной кривой дописываются family/label/myMax/e1rm.
 * @template {{ name: string, type: string, n: number }} C
 * @param {C[]} curves
 * @param {ReadonlyArray<any>|null|undefined} workouts
 * @param {number} limit
 * @returns {Array<C & { family: string, label: string, myMax?: {weight:number,reps:number}, e1rm?: number }>}
 */
export function selectFamilyCurves(curves, workouts, limit) {
  const { byVariant, byFamily } = activityOf(workouts);
  const records = buildRecords(workouts);
  const none = { total: 0, recent: 0, last: 0 };

  /** @type {Map<string, C & { _a: Activity }>} */
  const pick = new Map();
  for (const c of curves) {
    const key = familyKey(c.name);
    const a = byVariant.get(recordKey(c.name)) ?? none;
    const cur = pick.get(key);
    if (!cur || byActivity(cur._a, a) > 0) pick.set(key, { ...c, _a: a });
  }

  const ranked = [...pick.entries()]
    .map(([key, c]) => ({ key, c, a: byFamily.get(key) ?? c._a }))
    .sort((x, y) => byActivity(x.a, y.a) || x.c.name.localeCompare(y.c.name));

  // по кругу между типами: без этого пять свежих «push» вытеснят ноги
  /** @type {Map<string, typeof ranked>} */
  const buckets = new Map();
  for (const r of ranked) {
    const list = buckets.get(r.c.type) ?? [];
    list.push(r);
    buckets.set(r.c.type, list);
  }
  const chosen = [];
  for (let round = 0; chosen.length < limit; round++) {
    let took = false;
    for (const list of buckets.values()) {
      if (round < list.length && chosen.length < limit) { chosen.push(list[round]); took = true; }
    }
    if (!took) break;
  }
  chosen.sort((x, y) => ranked.indexOf(x) - ranked.indexOf(y));

  return chosen.map(({ c }) => {
    const { _a, ...curve } = c;
    const rec = records.get(recordKey(c.name));
    const { family, label } = familyLabel(c.name);
    return {
      ...curve,
      family,
      label,
      ...(rec ? { myMax: { weight: rec.myMax.weight, reps: rec.myMax.reps }, e1rm: Math.round(rec.e1rm.value) } : {}),
    };
  });
}
