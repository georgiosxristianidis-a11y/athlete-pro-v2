// @ts-check
/* ════════════════════════════════════════════════════════
   journal.store.js — Журнал тренировок: state + business logic
   Ноль обращений к DOM (Store/View pattern).

   Экран отвечает на вопрос «что я делал тогда»: весь архив
   DB.Workouts, фильтр Push/Pull/Legs, поиск по упражнению,
   подгрузка страницами по мере прокрутки.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

/** Сколько строк добавляет один шаг подгрузки. */
export const PAGE_SIZE = 20;

/** Типы тренировок, по которым фильтруем (порядок = порядок сегментов). */
export const TYPES = ['all', 'push', 'pull', 'legs'];

export const JournalState = {
  /** @type {any[]} весь архив, новые сверху */
  all: [],
  /** @type {'all'|'push'|'pull'|'legs'} */
  type: 'all',
  /** @type {string} сырой запрос из поля поиска */
  query: '',
  /** сколько строк отрисовано сейчас */
  visible: PAGE_SIZE,
  loaded: false,
};

/** Нормализация поискового запроса: регистр и края не должны решать. */
export function normalizeQuery(q) {
  return String(q ?? '').trim().toLowerCase();
}

/**
 * Имена упражнений тренировки.
 * @param {any} w
 * @returns {string[]}
 */
export function exerciseNames(w) {
  const list = Array.isArray(w?.exercises) ? w.exercises : [];
  return list.map((ex) => String(ex?.name ?? '')).filter(Boolean);
}

/**
 * Проходит ли тренировка фильтр типа + поиск по упражнению.
 * @param {any} w
 * @param {{type?: string, query?: string}} [opts]
 */
export function matchesFilter(w, opts = {}) {
  const type = opts.type || 'all';
  if (type !== 'all' && w?.type !== type) return false;

  const q = normalizeQuery(opts.query);
  if (!q) return true;
  return exerciseNames(w).some((name) => name.toLowerCase().includes(q));
}

/**
 * Отфильтрованный список (порядок исходного сохраняется — новые сверху).
 * @param {any[]} list
 * @param {{type?: string, query?: string}} [opts]
 */
export function filterWorkouts(list, opts = {}) {
  return (Array.isArray(list) ? list : []).filter((w) => matchesFilter(w, opts));
}

/**
 * Сколько тренировок в каждом типе — для цифр на сегментах.
 * Поиск учитывается, тип — нет: иначе активный сегмент показывал бы
 * свой счётчик, а остальные нули.
 * @param {any[]} list
 * @param {string} [query]
 * @returns {{all: number, push: number, pull: number, legs: number}}
 */
export function typeCounts(list, query = '') {
  const counts = { all: 0, push: 0, pull: 0, legs: 0 };
  for (const w of filterWorkouts(list, { type: 'all', query })) {
    counts.all++;
    if (counts[w?.type] !== undefined) counts[w.type]++;
  }
  return counts;
}

/**
 * Сколько подходов реально отработано. Легаси-записи без `done`
 * считаем выполненными — иначе старый архив покажет ноль подходов.
 * @param {any} w
 */
export function doneSetCount(w) {
  const list = Array.isArray(w?.exercises) ? w.exercises : [];
  let n = 0;
  for (const ex of list) {
    for (const s of (Array.isArray(ex?.sets) ? ex.sets : [])) {
      if (s?.done === undefined || s.done) n++;
    }
  }
  return n;
}

/**
 * Сводка строки списка — всё, что нужно отрисовать, одним объектом.
 * @param {any} w
 */
export function summarize(w) {
  return {
    id: w?.id,
    timestamp: Number(w?.timestamp) || 0,
    type: w?.type || null,
    tonnage: Number(w?.tonnage) || 0,
    duration: Number(w?.duration) || 0,
    exerciseCount: exerciseNames(w).length,
    setCount: doneSetCount(w),
    prCount: Array.isArray(w?.prs) ? w.prs.length : 0,
  };
}

/**
 * Разбивка по месяцам для заголовков секций. Ключ стабилен и не зависит
 * от локали; подпись собирает view.
 * @param {any[]} list — уже отфильтрованный, новые сверху
 * @returns {Array<{key: string, ts: number, items: any[]}>}
 */
export function groupByMonth(list) {
  /** @type {Array<{key: string, ts: number, items: any[]}>} */
  const groups = [];
  for (const w of (Array.isArray(list) ? list : [])) {
    const d = new Date(Number(w?.timestamp) || 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(w);
    else groups.push({ key, ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), items: [w] });
  }
  return groups;
}

/** Текущий срез списка с учётом фильтров и подгрузки. */
export function visibleSlice(state = JournalState) {
  const filtered = filterWorkouts(state.all, { type: state.type, query: state.query });
  return { filtered, page: filtered.slice(0, state.visible) };
}

/** Есть ли что подгружать дальше. */
export function hasMore(state = JournalState) {
  const filtered = filterWorkouts(state.all, { type: state.type, query: state.query });
  return state.visible < filtered.length;
}

/** Сброс подгрузки — обязателен при любой смене фильтра/запроса. */
export function resetPaging(state = JournalState) {
  state.visible = PAGE_SIZE;
}

/** Следующая страница. Возвращает true, если что-то реально добавилось. */
export function loadMore(state = JournalState) {
  if (!hasMore(state)) return false;
  state.visible += PAGE_SIZE;
  return true;
}

/**
 * Найти тренировку по id среди загруженных.
 * Id сравнивается строкой: CRDT foundation (`js/db/core.js` `newId()`) даёт
 * новым записям UUID-строку, а легаси-записи хранят числовой autoIncrement —
 * `data-id` из разметки тоже всегда строка, так что Number() ломает поиск
 * ровно на свежих тренировках (NaN никогда не совпадает).
 */
export function findWorkout(id, state = JournalState) {
  const key = String(id);
  return state.all.find((w) => String(w?.id) === key) || null;
}

/** Загрузить архив из IndexedDB (новые сверху — так отдаёт getAll). */
export async function loadWorkouts(state = JournalState) {
  state.all = await DB.Workouts.getAll();
  state.loaded = true;
  return state.all;
}
