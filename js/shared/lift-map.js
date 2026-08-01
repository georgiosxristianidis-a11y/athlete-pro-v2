// @ts-check
/* ════════════════════════════════════════════════════════
   lift-map.js — имя упражнения → ключ базового движения

   Один источник на всё приложение. Раньше маппинг жил в двух местах:
   `profile.view.js` (по списку регулярок) и `athlete-room.js` (три
   самодельных `.match()` без OHP). Две реализации давали разную сумму
   трёх на двух экранах — ровно та «непонятная цифра», которую разбирает
   карточка PP-3.
   ════════════════════════════════════════════════════════ */

/** @type {Array<{ key: 'bench'|'squat'|'deadlift'|'ohp', tests: RegExp[] }>} */
export const LIFT_PATTERNS = [
  { key: 'bench',    tests: [/barbell bench press/i, /bench press/i, /жим лёжа/i, /жим штанги лёжа/i] },
  { key: 'squat',    tests: [/barbell back squat/i, /back squat/i, /присед/i]   },
  { key: 'deadlift', tests: [/deadlift \(conventional\)/i, /deadlift/i, /становая/i] },
  { key: 'ohp',      tests: [/overhead press/i, /\bohp\b/i, /жим стоя/i]        },
];

/**
 * @param {Array<{id: string, value: number}>} records
 * @returns {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }}
 */
export function mapOneRMs(records) {
  /** @type {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} */
  const result = {};
  for (const r of records || []) {
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
 * Сумма трёх соревновательных движений — вход и скора, и DOTS.
 * OHP в сумму не входит: это не пауэрлифтерское движение.
 * @param {{ bench?: number, squat?: number, deadlift?: number }} oneRMs
 */
export function powerTotal(oneRMs) {
  return (oneRMs.squat || 0) + (oneRMs.bench || 0) + (oneRMs.deadlift || 0);
}
