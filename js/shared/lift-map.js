// @ts-check
/* ════════════════════════════════════════════════════════
   lift-map.js — имя упражнения → ключ базового движения

   Один источник на всё приложение. Раньше маппинг жил в двух местах:
   `profile.view.js` (по списку регулярок) и `athlete-room.js` (три
   самодельных `.match()` без OHP). Две реализации давали разную сумму
   трёх на двух экранах — ровно та «непонятная цифра», которую разбирает
   карточка PP-3.

   DATA-1: за флагом `exercise-registry` имя сначала ищется в реестре упражнений
   (`exercise-registry.js`): гантели и тренажёр — не штанга, «ё»/«е» и регистр не
   важны. Имя вне реестра идёт по тем же регэкспам, но на свёрнутой строке и с отсевом
   не-штанговых снарядов. Флаг OFF — прежний путь побитно.
   ════════════════════════════════════════════════════════ */

import { flag } from '../flags.js';
import { findExercise, normalizeName } from './exercise-registry.js';

/** @type {Array<{ key: 'bench'|'squat'|'deadlift'|'ohp', tests: RegExp[] }>} */
export const LIFT_PATTERNS = [
  { key: 'bench',    tests: [/barbell bench press/i, /bench press/i, /жим лёжа/i, /жим штанги лёжа/i] },
  { key: 'squat',    tests: [/barbell back squat/i, /back squat/i, /присед/i]   },
  { key: 'deadlift', tests: [/deadlift \(conventional\)/i, /deadlift/i, /становая/i] },
  { key: 'ohp',      tests: [/overhead press/i, /\bohp\b/i, /жим стоя/i]        },
];

/**
 * Те же движения для имён вне реестра, но под `normalizeName` (ё→е, нижний регистр):
 * регэкспы без «ё», плюс «жим штанги стоя».
 * @type {Array<{ key: 'bench'|'squat'|'deadlift'|'ohp', tests: RegExp[] }>}
 */
const FOLDED_PATTERNS = [
  { key: 'bench',    tests: [/barbell bench press/, /bench press/, /жим лежа/, /жим штанги лежа/] },
  { key: 'squat',    tests: [/barbell back squat/, /back squat/, /присед/] },
  { key: 'deadlift', tests: [/deadlift \(conventional\)/, /deadlift/, /становая/] },
  { key: 'ohp',      tests: [/overhead press/, /\bohp\b/, /жим стоя/, /жим штанги стоя/] },
];

/** Снаряд не штанга: имя вне реестра с таким словом в базовые движения не идёт. */
const NOT_BARBELL = /dumbbell|\bdb\b|гантел|machine|тренажер|hack|хак/;

/**
 * @param {string} id
 * @returns {'bench'|'squat'|'deadlift'|'ohp'|undefined}
 */
function liftByRegistry(id) {
  const known = findExercise(id);
  if (known) return known.lift;
  const n = normalizeName(id);
  if (NOT_BARBELL.test(n)) return undefined;
  for (const { key, tests } of FOLDED_PATTERNS) {
    if (tests.some(re => re.test(n))) return key;
  }
  return undefined;
}

/**
 * @param {string} id
 * @returns {'bench'|'squat'|'deadlift'|'ohp'|undefined}
 */
function liftByLegacy(id) {
  for (const { key, tests } of LIFT_PATTERNS) {
    if (tests.some(re => re.test(id))) return key;
  }
  return undefined;
}

/**
 * @param {Array<{id: string, value: number}>} records
 * @returns {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }}
 */
export function mapOneRMs(records) {
  /** @type {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} */
  const result = {};
  const byRegistry = flag('exercise-registry');
  for (const r of records || []) {
    const key = byRegistry ? liftByRegistry(r.id) : liftByLegacy(r.id);
    if (key && (!result[key] || r.value > result[key])) result[key] = r.value;
  }
  return result;
}

/**
 * Сумма трёх соревновательных движений — вход и скора, и DOTS.
 * OHP в сумму не входит: это не пауэрлифтерское движение.
 * @param {{ bench?: number, squat?: number, deadlift?: number }} oneRMs
 */
export function powerTotal(oneRMs) {
  return (oneRMs.squat || 0) + (oneRMs.bench || 0) + (oneRMs.deadlift || 0);
}
