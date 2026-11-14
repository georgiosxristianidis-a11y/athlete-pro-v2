// @ts-check
/**
 * UX-1b — спасённая протухшая сессия: тост «Вернуть», потом 1RM.
 * View-сторона stale-session.store.js; вынесено из handlers.js (потолок гиганта).
 * Строки через tri(): словарь locale.store.js на потолке храповика.
 */
import { Timer } from '../timer.js';
import { Toast } from '../shell.js';
import { State } from '../workout.store.js';
import { rescueActiveSession } from '../stale-session.store.js';
import { renderSelect } from './render.js';
import { t, tri } from '../locale.store.js';
import { fmtDate } from '../shared/format.js';
import { releaseWakeLock } from '../features/wake-lock.js';

/** Окно «Вернуть»: пока оно открыто, 1RM не пишется (запись 1RM необратима). */
const RESCUE_UNDO_MS = 8000;

/**
 * Тост «Тренировка от <время> сохранена» с кнопкой «Вернуть». Отмена удаляет
 * запись; окно закрылось без отмены — пишем 1RM.
 * @param {import('../stale-session.store.js').RescuedSession|null} rescued
 */
export function showRescueToast(rescued) {
  if (!rescued) return;
  const when = fmtDate(rescued.startedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const n = String(rescued.sets);
  const msg = tri(
    `Тренировка от ${when} сохранена: подходов — ${n}`,
    `Workout from ${when} saved: ${n} sets`,
    `Η προπόνηση της ${when} αποθηκεύτηκε: ${n} σετ`
  );
  Toast.show(msg, 'success', RESCUE_UNDO_MS, {
    action: {
      label: t('train.undo'),
      onClick: () => {
        rescued
          .undo()
          .then(async (undone) => {
            if (!undone) return;
            Toast.show(tri('Тренировка убрана из журнала', 'Workout removed from history', 'Η προπόνηση αφαιρέθηκε από το ιστορικό'), 'info');
            if (State.phase !== 'active') await renderSelect();
          })
          .catch(() =>
            Toast.show(tri('Не удалось убрать тренировку', 'Could not remove the workout', 'Δεν ήταν δυνατή η αφαίρεση της προπόνησης'), 'error')
          );
      },
    },
  });
  setTimeout(() => {
    rescued.commit().catch(() => {});
  }, RESCUE_UNDO_MS);
}

/**
 * Сторож 12 ч: сессия уходит в журнал без диалога (раньше cancelSession()
 * открывал «Отменить тренировку?» поверх любого confirm).
 */
export async function rescueOverdueSession() {
  let rescued = null;
  try {
    rescued = await rescueActiveSession();
  } catch {
    // Снимок вернулся в localStorage — следующая загрузка Train повторит.
  }
  Timer.reset();
  // @ts-ignore
  if (window.DynamicIsland) window.DynamicIsland.hide();
  releaseWakeLock();
  await renderSelect();
  showRescueToast(rescued);
}
