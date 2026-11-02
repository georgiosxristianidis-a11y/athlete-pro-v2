// @ts-check
/* ════════════════════════════════════════════════════════
   exercise-records.js — «Мой максимум», e1RM и стаж из истории (DATA-2)

   Всё считается из тренировок, а не из стора ORM: стор пишется только финишем
   тренировки в приложении, по точному имени и только вверх, а после импорта
   (scripts/import-etl.py, `orm: []`) пуст. Стор остаётся легаси и не трогается.

   Ключ — id варианта реестра (`bench.barbell`), не семейство: смысл веса у
   вариантов разный (решение Gio 01.11). Имя вне реестра ключуется как
   `name:<нормализованное имя>` — не склеивается ни с чем.

   «Мой максимум» — реально поднятый вес: подход с наибольшим весом, при равенстве
   больше повторов. Показывается как «вес × повторы». e1RM (Epley, `estimate1RM`) —
   отдельная оценка; нормы уровня (ExRx, DOTS) считаются по ней.

   Чистые функции: ни флагов, ни DOM, ни IDB. Флаг `history-records` стоит у вызывающих.
   ════════════════════════════════════════════════════════ */

import { estimate1RM } from '../strength-engine.js';
import { findExercise, normalizeName } from './exercise-registry.js';
import { liftByRegistry } from './lift-map.js';
import { isLifted } from './working-sets.js';

/**
 * @typedef {Object} SetMark
 * @property {number} weight
 * @property {number} reps
 * @property {number} timestamp  когда поднято
 *
 * @typedef {Object} ExerciseRecord
 * @property {string} id        id варианта реестра или `name:<имя>`
 * @property {string} name      имя как в истории (первое встреченное)
 * @property {'bench'|'squat'|'deadlift'|'ohp'|undefined} lift  базовое движение для норм
 * @property {SetMark} myMax    реально поднятый вес лучшего подхода
 * @property {SetMark & {value: number}} e1rm  лучшая оценка 1ПМ
 * @property {number} sessions  сколько тренировок содержат движение
 * @property {number} first     timestamp первой тренировки с ним
 */

/**
 * @param {unknown} name
 * @returns {string}
 */
export function recordKey(name) {
  const known = findExercise(name);
  return known ? known.id : `name:${normalizeName(name)}`;
}

/**
 * Рекорды по каждому движению истории.
 * @param {ReadonlyArray<any>|null|undefined} workouts
 * @returns {Map<string, ExerciseRecord>}
 */
export function buildRecords(workouts) {
  /** @type {Map<string, ExerciseRecord>} */
  const out = new Map();
  for (const w of Array.isArray(workouts) ? workouts : []) {
    const ts = Number(w?.timestamp);
    if (!w || w._deleted || !Number.isFinite(ts) || ts <= 0) continue;
    /** @type {Set<string>} */
    const seen = new Set();
    for (const ex of Array.isArray(w.exercises) ? w.exercises : []) {
      if (!ex || typeof ex.name !== 'string' || !normalizeName(ex.name)) continue;
      const id = recordKey(ex.name);
      for (const s of Array.isArray(ex.sets) ? ex.sets : []) {
        const weight = Number(s?.weight) || 0;
        const reps = Number(s?.reps) || 0;
        if (!isLifted(s) || !(weight > 0)) continue;
        let rec = out.get(id);
        if (!rec) {
          const mark = { weight, reps, timestamp: ts };
          rec = {
            id, name: ex.name.trim(), lift: liftByRegistry(ex.name),
            myMax: { ...mark }, e1rm: { ...mark, value: estimate1RM(weight, reps) },
            sessions: 0, first: ts,
          };
          out.set(id, rec);
        }
        const m = rec.myMax;
        if (weight > m.weight || (weight === m.weight && reps > m.reps)) rec.myMax = { weight, reps, timestamp: ts };
        const value = estimate1RM(weight, reps);
        if (value > rec.e1rm.value) rec.e1rm = { weight, reps, timestamp: ts, value };
      }
      const rec = out.get(id);
      if (rec && !seen.has(id)) {
        seen.add(id);
        rec.sessions += 1;
        if (ts < rec.first) rec.first = ts;
      }
    }
  }
  return out;
}

/**
 * Лучшая e1RM по базовым движениям — вход `scoreBreakdown`/ExRx вместо `mapOneRMs(orm)`.
 * Присед и становая появляются только если в истории есть штанговые (хак-присед — вне DOTS).
 * @param {ReadonlyArray<any>|null|undefined} workouts
 * @returns {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }}
 */
export function oneRMsFromHistory(workouts) {
  /** @type {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} */
  const out = {};
  for (const rec of buildRecords(workouts).values()) {
    if (rec.lift && rec.e1rm.value > (out[rec.lift] ?? 0)) out[rec.lift] = rec.e1rm.value;
  }
  return out;
}

/**
 * Историческое поверх легаси: по каждому движению берётся большее. Историю не занижаем
 * записями ORM-стора, а ORM-значения, которых в истории нет (ручные), не теряем.
 * @param {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} legacy
 * @param {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} fromHistory
 */
export function mergeOneRMs(legacy, fromHistory) {
  /** @type {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} */
  const out = { ...legacy };
  for (const k of /** @type {const} */ (['bench', 'squat', 'deadlift', 'ohp'])) {
    const v = fromHistory[k];
    if (v && v > (out[k] ?? 0)) out[k] = v;
  }
  return out;
}

const YEAR_MS = 31557600000;

/**
 * Стаж по истории: срок от первой до последней тренировки в годах, до 0.1 — та же мера,
 * что в герое Stats (`renderStrengthHero`), чтобы числа на экранах не расходились.
 * Меньше двух тренировок — 0 (стажа не видно).
 * @param {ReadonlyArray<any>|null|undefined} workouts
 * @returns {number}
 */
export function experienceYearsFromHistory(workouts) {
  const ts = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => w && !w._deleted)
    .map((w) => Number(w.timestamp))
    .filter((t) => Number.isFinite(t) && t > 0);
  if (ts.length < 2) return 0;
  return Math.round(((Math.max(...ts) - Math.min(...ts)) / YEAR_MS) * 10) / 10;
}

/**
 * Стаж для экрана: из истории, если она показывает срок, иначе то, что назвал в онбординге.
 * @param {number|undefined} profileYears
 * @param {ReadonlyArray<any>|null|undefined} workouts
 * @returns {number}
 */
export function effectiveExperienceYears(profileYears, workouts) {
  return experienceYearsFromHistory(workouts) || Number(profileYears) || 0;
}
