// @ts-check
/* SWAP-1b (флаг swap-quick): обработчики полосы быстрой замены. Тап по сегменту — замена
   на аналог (вес из истории, логика в workout.store.js), «Вернуть» в следе — обратно.
   Расщепление сдвигает индексы — перерисовка всего экрана, не патч карточки.
   Отдельный модуль: handlers.js стоит на потолке храповика. Подключается побочным импортом
   из workout.view.js. */
import { State, persistSession, swapExercise, undoSwap, loadWorkoutHistory } from '../workout.store.js';
import { renderActive } from './render.js';
import { haptic } from '../shared/utils.js';
import { flag } from '../flags.js';
import { on } from '../events.js';

on('wo:swap', (el) => _swapQuick(+el.dataset.ei, el.dataset.name || ''));
on('wo:swapUndo', (el) => _swapUndo(+el.dataset.ei));

/** @param {number} ei @param {string} name */
async function _swapQuick(ei, name) {
  if (!flag('swap-quick')) return;
  const r = swapExercise(State.plan, ei, name, await loadWorkoutHistory());
  if (!r) return;
  haptic(10);
  persistSession();
  await renderActive();
}

/** @param {number} ei */
async function _swapUndo(ei) {
  if (!flag('swap-quick') || undoSwap(State.plan, ei) === -1) return;
  haptic(10);
  persistSession();
  await renderActive();
}
