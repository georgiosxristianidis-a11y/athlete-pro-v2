// @ts-check
/* ════════════════════════════════════════════════════════
   picker-muscles.js — DATA-4, поиск упражнений, вариант B (выбор Gio 07.11)

   Под выбранной категорией раскрываются мышцы (Push → Грудь/Плечи/Трицепс), у
   карточки — лейблы семейства и мышц в тоне PPL (10–18 % токена, `color-mix`).
   В «Все» подчипов нет. Всё за флагом `muscles-ui`: вызывающий (modals.js) зовёт
   этот модуль только при ON, при OFF разметка пикера прежняя побитно.

   Мышцы — `muscleGroup` библиотеки (ключ), подпись и семейство — из реестра DATA-1
   (`exercise-registry.js`); имя вне реестра — лейбл только по muscleGroup.
   Чистые функции: ни флагов, ни IDB.
   ════════════════════════════════════════════════════════ */

import { esc } from '../shared/utils.js';
import { tri } from '../locale.store.js';
import { findExercise, MUSCLE_RU } from '../shared/exercise-registry.js';

/** muscleGroup библиотеки → [ru, en]. Не в списке — показываем как есть. */
const GROUP_LABEL = Object.freeze({
  chest: ['Грудь', 'Chest'], shoulders: ['Плечи', 'Shoulders'], triceps: ['Трицепс', 'Triceps'],
  back: ['Спина', 'Back'], biceps: ['Бицепс', 'Biceps'], traps: ['Трапеции', 'Traps'],
  forearms: ['Предплечья', 'Forearms'], 'rear delts': ['Задняя дельта', 'Rear delts'],
  quadriceps: ['Квадрицепс', 'Quads'], hamstrings: ['Бицепс бедра', 'Hamstrings'],
  glutes: ['Ягодицы', 'Glutes'], calves: ['Икры', 'Calves'], adductors: ['Приводящие', 'Adductors'],
  abs: ['Пресс', 'Abs'], 'lower back': ['Поясница', 'Lower back'],
});

/** Тон лейбла: PPL по категории, core/cardio/прочее — серый --c-text-2 (консервативный дефолт). */
export function toneOf(/** @type {string} */ category) {
  return category === 'push' || category === 'pull' || category === 'legs' ? category : 'core';
}

/** @param {string} group */
export function groupLabel(group) {
  const l = /** @type {Record<string, string[]>} */ (GROUP_LABEL)[group];
  return l ? tri(l[0], l[1], l[1]) : group;
}

/**
 * Подчипы мышц категории: уникальные muscleGroup из библиотеки, частые первыми,
 * `full body` отсеян. «Все» — подчипов нет.
 * @param {string} category @param {ReadonlyArray<any>} library
 * @returns {Array<{key: string, label: string}>}
 */
export function muscleChipsFor(category, library) {
  if (!category || category === 'all') return [];
  /** @type {Map<string, number>} */
  const n = new Map();
  for (const ex of library) {
    if (ex.category !== category || !ex.muscleGroup || ex.muscleGroup === 'full body') continue;
    n.set(ex.muscleGroup, (n.get(ex.muscleGroup) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => ({ key, label: groupLabel(key) }));
}

/** @param {any} ex @param {string|null} muscle null — без отбора */
export function matchMuscle(ex, muscle) {
  return !muscle || ex.muscleGroup === muscle;
}

/** Разметка ряда подчипов; пусто — пустая строка. @param {Array<{key: string, label: string}>} chips @param {string} category @param {string|null} active */
export function subChipsHtml(chips, category, active) {
  if (!chips.length) return '';
  const body = chips.map((c) =>
    `<button class="ex-mchip${active === c.key ? ' active' : ''}" data-muscle="${esc(c.key)}">${esc(c.label)}</button>`).join('');
  return `<div class="ex-msub ex-tone-${toneOf(category)}">${body}</div>`;
}

/** Строка лейблов карточки: семейство (реестр) + мышцы. Вместо «chest · barbell · compound».
 *  @param {any} ex */
export function itemMetaHtml(ex) {
  const entry = findExercise(ex.name);
  const muscles = entry
    ? entry.muscles.map((m) => /** @type {Record<string, string>} */ (MUSCLE_RU)[m] || m)
    : [groupLabel(ex.muscleGroup)];
  const fam = entry ? `<span class="ex-lbl ex-lbl-fam">${esc(entry.familyRu)}</span>` : '';
  const mus = muscles.map((m) => `<span class="ex-lbl ex-lbl-mus">${esc(m)}</span>`).join('');
  return `<div class="ex-meta ex-tone-${toneOf(ex.category)}">${fam}${mus}</div>`;
}
