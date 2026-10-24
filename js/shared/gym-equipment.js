// @ts-check
/* ════════════════════════════════════════════════════════
   gym-equipment.js — FIELD-6: чек-лист снарядов зала
   ────────────────────────────────────────────────────────
   Выбор Gio 24.10 (вариант A): тумблеры по значениям `equipment`
   библиотеки. Хранится список ВЫКЛЮЧЕННЫХ видов (`profile.equipmentOff`
   в DB.Settings, владелец — profile.store.js); пустой список = всё есть.
   Отсев действует на отбор упражнений (модалки выбора и замены), а не на
   историю и уже сохранённые планы. Без DOM и DB — чистые функции.
   ════════════════════════════════════════════════════════ */

/** Все значения `equipment` в exercises-library.json, по частоте. */
export const EQUIPMENT_KINDS = Object.freeze([
  'barbell', 'dumbbell', 'bodyweight', 'machine', 'cable',
  'other', 'ez-bar', 'kettlebell', 'smith machine', 'band',
]);

/** Потолок строки профиля для коуча — `CAPS.shortText` в coach-snapshot/routes. */
export const COACH_EQUIPMENT_CAP = 40;

/**
 * Сырое значение из базы → известные виды без дублей, в порядке EQUIPMENT_KINDS.
 * Мусор (старый формат, чужой бэкап) не роняет отбор, а просто отбрасывается.
 * @param {unknown} raw @returns {string[]}
 */
export function normalizeOff(raw) {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.map((v) => String(v)));
  return EQUIPMENT_KINDS.filter((k) => set.has(k));
}

/** Вид снаряда упражнения; без разметки — 'other'. @param {any} ex */
export function kindOf(ex) {
  const v = String(ex?.equipment || '').trim().toLowerCase();
  return EQUIPMENT_KINDS.includes(v) ? v : 'other';
}

/** Ключ словаря подписи вида: пробел → дефис ('smith machine' → equip.kind.smith-machine).
 *  @param {string} kind @returns {string} */
export function equipLabelKey(kind) {
  return `equip.kind.${String(kind).replace(/ /g, '-')}`;
}

/**
 * Разделить список упражнений по чек-листу.
 * @template T
 * @param {T[]} list @param {unknown} off выключенные виды
 * @returns {{ kept: T[], hidden: T[] }}
 */
export function splitByEquipment(list, off) {
  const offSet = new Set(normalizeOff(off));
  const src = Array.isArray(list) ? list : [];
  if (!offSet.size) return { kept: src.slice(), hidden: [] };
  /** @type {T[]} */ const kept = [];
  /** @type {T[]} */ const hidden = [];
  for (const ex of src) (offSet.has(kindOf(ex)) ? hidden : kept).push(ex);
  return { kept, hidden };
}

/**
 * Отбор для модалок выбора и замены: снаряды отсеваются ДО фильтра экрана
 * (категория + поиск). `hiddenCount` — сколько скрыто снарядами из того, что
 * фильтр экрана показал бы; `emptyByEquipment` — список пуст именно из-за
 * снарядов, а не из-за поиска (поиск без совпадений и с выключенными пуст тоже).
 * @template T
 * @param {T[]} list библиотека @param {unknown} off выключенные виды
 * @param {(ex: T) => boolean} match фильтр экрана
 * @returns {{ shown: T[], hiddenCount: number, emptyByEquipment: boolean }}
 */
export function pickFromLibrary(list, off, match) {
  const { kept, hidden } = splitByEquipment(list, off);
  const shown = kept.filter(match);
  const hiddenCount = hidden.filter(match).length;
  return { shown, hiddenCount, emptyByEquipment: !shown.length && hiddenCount > 0 };
}

/**
 * Строка `equipment` для коуча. Пусто → 'gym' — байт в байт как у старого
 * пресета, иначе «gym, no barbell, cable +2»: виды, пока влезает в cap, остаток числом.
 * @param {unknown} off @param {number} [cap]
 * @returns {string}
 */
export function coachEquipment(off, cap = COACH_EQUIPMENT_CAP) {
  const kinds = normalizeOff(off);
  if (!kinds.length) return 'gym';
  const build = (/** @type {number} */ n) =>
    `gym, no ${kinds.slice(0, n).join(', ')}${n < kinds.length ? ` +${kinds.length - n}` : ''}`;
  let n = kinds.length;
  while (n > 1 && build(n).length > cap) n--;
  return build(n).slice(0, cap);
}
