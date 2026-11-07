// @ts-check
/* ════════════════════════════════════════════════════════
   swap-groups.js — группы быстрой замены упражнения (SWAP-1a, решения Gio 07.11)

   Аналог шире семейства реестра: жим грудью = штанга, гантели, наклонный жим
   гантелями, тренажёр. Группы курируются вручную — это не вывод из реестра, а
   решение «что в зале реально подменяет друг друга». Одиночки (сведение, пуловер,
   брусья, разгибание ног…) в группы не входят: у них нет честной замены.
   Добавлять группу — решением Gio, с тестом на состав.

   Чистое чтение: ни DOM, ни IDB, ни флагов. Реестр упражнений читается, не
   правится (`exercise-registry.js`). Имя в истории не меняется: аналоги отдаются
   каноническими именами реестра.
   ════════════════════════════════════════════════════════ */

import { findExercise, getExercise, canonicalNameOf } from './exercise-registry.js';

/**
 * Группы замены: id вариантов реестра (`<семейство>.<вариант>`), не имена —
 * алиасы и переименования имён группу не ломают. Порядок внутри группы —
 * порядок показа в полосе замены.
 * @type {ReadonlyArray<ReadonlyArray<string>>}
 */
export const SWAP_GROUPS = Object.freeze([
  Object.freeze(['bench.barbell', 'bench.dumbbell', 'incline-press.dumbbell', 'chest-press.machine']),
  Object.freeze(['leg-press.base', 'squat.machine']),
  Object.freeze(['pulldown.base', 'pull-up.base']),
  Object.freeze(['cable-row.base', 'lever-row.base', 't-bar-row.supported', 't-bar-row.bent']),
  Object.freeze(['ohp.barbell', 'ohp.dumbbell-seated']),
  Object.freeze(['pushdown.base', 'skull-crusher.base', 'overhead-extension.base']),
  Object.freeze(['cable-curl.base', 'barbell-curl.base', 'dumbbell-curl.base', 'hammer-curl.base', 'preacher-curl.base']),
]);

/** @type {Map<string, ReadonlyArray<string>>} id варианта → его группа */
const GROUP_OF = new Map();
for (const g of SWAP_GROUPS) for (const id of g) GROUP_OF.set(id, g);

/**
 * Аналоги упражнения: канонические имена других участников его группы, в порядке
 * группы, без самого упражнения. Неизвестное имя и одиночка — пустой список.
 * Участник группы без имён в истории (нет канонического) пропускается.
 * @param {unknown} name любое имя реестра, в том числе алиас
 * @returns {string[]}
 */
export function swapAnalogs(name) {
  const entry = findExercise(name);
  const group = entry && GROUP_OF.get(entry.id);
  if (!entry || !group) return [];
  /** @type {string[]} */
  const out = [];
  for (const id of group) {
    if (id === entry.id) continue;
    const e = getExercise(id);
    const n = e && canonicalNameOf(e);
    if (n) out.push(n);
  }
  return out;
}

/**
 * У упражнения есть хотя бы один аналог — условие показа полосы замены.
 * @param {unknown} name
 * @returns {boolean}
 */
export function hasAnalogs(name) {
  return swapAnalogs(name).length > 0;
}

/**
 * @typedef {'barbell'|'dumbbell'|'machine'|'bodyweight'|'other'} SwapKind
 * @typedef {Object} SwapTraits
 * @property {SwapKind} kind        чем работаем: подпись сегмента, блины только у штанги
 * @property {boolean} isBW         вес — добавка к своему (подтягивания)
 * @property {boolean} isUnilateral вес на одну руку (гантели, рычажная тяга Iso-Lateral)
 */

/** Варианты, где реестр говорит `base`, а смысл — свой вес. */
const BODYWEIGHT_IDS = new Set(['pull-up.base']);
/** Вес на одну руку при `kind` не гантели: как в плане (`Iso-Lateral Seated Row`). */
const UNILATERAL_IDS = new Set(['lever-row.base']);
/** Варианты `base`, чей снаряд задан семейством. */
const KIND_BY_FAMILY = Object.freeze(
  /** @type {Record<string, SwapKind>} */ ({
    'barbell-curl': 'barbell',
    'dumbbell-curl': 'dumbbell',
    'hammer-curl': 'dumbbell',
  }),
);

/**
 * Свойства упражнения для замены. Неизвестное имя — `null` (не угадываем).
 * @param {unknown} name
 * @returns {SwapTraits|null}
 */
export function swapTraits(name) {
  const e = findExercise(name);
  if (!e) return null;
  /** @type {SwapKind} */
  let kind = 'other';
  if (e.variant === 'bodyweight' || BODYWEIGHT_IDS.has(e.id)) kind = 'bodyweight';
  else if (KIND_BY_FAMILY[e.family]) kind = KIND_BY_FAMILY[e.family];
  else if (e.variant === 'barbell') kind = 'barbell';
  else if (e.variant.startsWith('dumbbell')) kind = 'dumbbell';
  else if (e.variant === 'machine') kind = 'machine';
  return {
    kind,
    isBW: kind === 'bodyweight',
    isUnilateral: kind === 'dumbbell' || UNILATERAL_IDS.has(e.id),
  };
}

/**
 * Снаряд упражнения. Неизвестное имя — `'other'`.
 * @param {unknown} name
 * @returns {SwapKind}
 */
export function swapKind(name) {
  return swapTraits(name)?.kind ?? 'other';
}
