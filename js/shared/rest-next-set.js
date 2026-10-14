// @ts-check
/**
 * FIELD-7 (вариант A из FIELD-4, флаг 'rest-next-set'): вторая строка паузы —
 * вес и повторы ближайшего незакрытого сета упражнения из «далее: X».
 * Формат веса — как в карточке упражнения (render.js, displayWeight):
 * свой вес без отягощения → только повторы («× 12»), +N → «+N кг × 12».
 * Планка пишет секунды в повторы, и карточка показывает их голым числом —
 * здесь так же («× 60»). Чистая функция: dynamic-island.js не грузится под node.
 *
 * @param {{ isBW?: boolean, sets?: Array<{ weight?: number, reps?: number, done?: boolean }> } | null | undefined} ex
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string} пусто — строки нет (нет упражнения или все сеты закрыты)
 */
export function nextSetLine(ex, t) {
  const set = ex?.sets?.find((s) => !s.done);
  if (!set) return '';
  const reps = Number(set.reps) || 0;
  const w = Number(set.weight) || 0;
  if (w <= 0) return t('island.next_set_bw', { r: reps });
  return t('island.next_set', { w: ex?.isBW ? `+${w}` : w, r: reps });
}
