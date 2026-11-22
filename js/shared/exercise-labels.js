// @ts-check
/* ════════════════════════════════════════════════════════
   exercise-labels.js — подписи реестра упражнений на языке UI (UX-2g)

   Один помощник для всех экранов: семейство, вариант и мышцы записи реестра.
   ru — русские подписи таблицы семейств, en/el — английские пары. Язык — только
   через isRu() (не navigator.language, не localStorage). Реестр остаётся чистым
   чтением без зависимостей; язык подключается здесь.
   ════════════════════════════════════════════════════════ */

import { isRu } from '../locale.store.js';
import { MUSCLE_RU, MUSCLE_EN } from './exercise-registry.js';

/**
 * @param {Readonly<import('./exercise-registry.js').ExerciseEntry>} entry
 * @returns {{ family: string, variant: string, muscles: string[] }}
 */
export function entryLabels(entry) {
  const ru = isRu();
  /** @type {Readonly<Record<string, string>>} */
  const dict = ru ? MUSCLE_RU : MUSCLE_EN;
  return {
    family: ru ? entry.familyRu : entry.familyEn,
    variant: ru ? entry.variantRu : entry.variantEn,
    muscles: entry.muscles.map((m) => dict[m] || m),
  };
}
