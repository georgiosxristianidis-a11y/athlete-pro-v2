// @ts-check
/* ════════════════════════════════════════════════════════
   exercise-identity.js — одно движение под разными именами (NAME-1)
   Читающая склейка: данные в IDB и план в localStorage не трогаем, графики
   сравнивают упражнения по каноническому ключу. План правится числом и
   переименованием руками, поэтому сид-алиасы (`alias` в плане) графику не
   помогают: сохранённое упражнение alias не несёт, а план берёт из localStorage.
   ════════════════════════════════════════════════════════ */

/**
 * Каноническое имя → прочие имена того же движения в истории.
 * - `Seated Cable Row` — имя из импорта 2023 (`scripts/import-etl.py`, библиотека);
 * - `Cable Row` — имя в плане приложения с самого начала;
 * - `Low Block Cable Row` — прежнее имя в сид-алиасе плана.
 * Дописывать только то же движение: склейка необратима для глаза на графике.
 * @type {Record<string, string[]>}
 */
export const SAME_MOVEMENT = {
  'Seated Cable Row': ['Cable Row', 'Low Block Cable Row'],
};

const norm = (/** @type {unknown} */ s) => String(s ?? '').trim().toLowerCase();

/** @type {Map<string, string>} нижний регистр → каноническое имя */
const CANON = new Map();
for (const [canon, others] of Object.entries(SAME_MOVEMENT)) {
  CANON.set(norm(canon), canon);
  for (const o of others) CANON.set(norm(o), canon);
}

/**
 * Каноническое имя для показа и группировки. Неизвестное имя возвращается
 * как есть (обрезанное), регистр и написание не трогаем.
 * @param {string} name
 * @returns {string}
 */
export function canonicalName(name) {
  const t = String(name ?? '').trim();
  return CANON.get(t.toLowerCase()) ?? t;
}

/**
 * Ключ сравнения: каноническое имя в нижнем регистре.
 * @param {string} name
 * @returns {string}
 */
export function canonicalKey(name) {
  return norm(canonicalName(name));
}
