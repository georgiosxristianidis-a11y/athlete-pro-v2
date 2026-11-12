// @ts-check
/* ════════════════════════════════════════════════════════
   swap-strip.js — сегменты полосы быстрой замены (SWAP-1b, флаг swap-quick)

   Чистая подготовка данных для вьюхи: какие сегменты нарисовать под названием
   упражнения и какой подписью. Ни DOM, ни IDB, ни флагов; группы и снаряд —
   из `swap-groups.js` (SWAP-1a), имена — из реестра.

   Подпись сегмента — каноническое имя без слов, общих для всей группы
   («Press» в группе жима груди), и без снаряда (barbell / dumbbell / db):
   снаряд несёт мелкая подпись над названием. `Bench Press` и `Dumbbell Bench Press`
   дают два «Bench» — их различает «штанга» / «гантели».
   ════════════════════════════════════════════════════════ */

import { SWAP_GROUPS, swapKind } from './swap-groups.js';
import { findExercise, getExercise, canonicalNameOf } from './exercise-registry.js';

/** Слова-снаряды: вес и подпись снаряда уже в мелкой подписи сегмента. */
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'db', 'machine']);

/** @param {string} s @returns {string[]} */
const words = (s) => s.split(/[\s/()-]+/).filter(Boolean);

/**
 * @typedef {Object} SwapSegment
 * @property {string} name  каноническое имя — уходит в `swapExercise`
 * @property {string} label короткая подпись сегмента
 * @property {import('./swap-groups.js').SwapKind} kind снаряд для мелкой подписи
 * @property {boolean} on   сегмент — само упражнение карточки
 */

/**
 * Сегменты полосы для упражнения: вся его группа замены в порядке группы, текущее
 * помечено `on`. Нет аналогов (одиночка, неизвестное имя) — пустой список.
 * @param {unknown} name любое имя реестра, в том числе алиас
 * @returns {SwapSegment[]}
 */
export function swapSegments(name) {
  const entry = findExercise(name);
  const group = entry && SWAP_GROUPS.find((g) => g.includes(entry.id));
  if (!entry || !group) return [];

  const members = group.flatMap((id) => {
    const e = getExercise(id);
    const n = e && canonicalNameOf(e);
    return e && n ? [{ id, name: n, words: words(n) }] : [];
  });
  if (members.length < 2) return [];

  const common = new Set(members[0].words.map((w) => w.toLowerCase()));
  for (const m of members.slice(1)) {
    const have = new Set(m.words.map((w) => w.toLowerCase()));
    for (const w of [...common]) if (!have.has(w)) common.delete(w);
  }

  return members.map((m) => {
    const keep = m.words.filter((w) => !common.has(w.toLowerCase()) && !EQUIPMENT.has(w.toLowerCase()));
    return {
      name: m.name,
      label: keep.length ? keep.join(' ') : m.name,
      kind: swapKind(m.name),
      on: m.id === entry.id,
    };
  });
}
