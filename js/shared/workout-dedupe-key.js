// @ts-check
/* ════════════════════════════════════════════════════════
   workout-dedupe-key.js — ключ «это одна и та же сессия» для кнопки
   «убрать дубли» (DB.Workouts.deduplicate).
   ────────────────────────────────────────────────────────
   Легаси-ключ `timestamp-type` не видит содержимого: 22 разные сессии
   импорта с одной датой считались дублями, и 21 уходили в корзину.
   Здесь ключ несёт состав: упражнения, подходы (вес × повторы), тоннаж.
   Идентичность импорта — id `imp-...`: ETL детерминирован, повторный импорт
   того же файла кладёт ту же строку (put по id) и дубля не рождает; два
   РАЗНЫХ `imp-` id — разные сессии источника, даже если состав совпал.
   Чистая функция: без IDB и DOM, флаг читает вызывающий.
   ════════════════════════════════════════════════════════ */

/**
 * Состав сессии одной строкой: порядок упражнений и подходов значим.
 * @param {any} w
 * @returns {string}
 */
export function workoutSignature(w) {
  const exs = Array.isArray(w && w.exercises) ? w.exercises : [];
  const body = exs
    .map((ex) => {
      const sets = Array.isArray(ex && ex.sets) ? ex.sets : [];
      const s = sets.map((x) => `${x && x.weight}x${x && x.reps}`).join(',');
      return `${ex && ex.name}:${s}`;
    })
    .join(';');
  return `${w && w.tonnage}|${body}`;
}

/**
 * @param {any} w запись workouts (активная)
 * @returns {string}
 */
export function contentDedupeKey(w) {
  const id = typeof w.id === 'string' && w.id.startsWith('imp-') ? w.id : '';
  return `${w.timestamp}|${w.type}|${id}|${workoutSignature(w)}`;
}
