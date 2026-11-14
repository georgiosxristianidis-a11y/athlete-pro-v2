// @ts-check
/**
 * stale-session.store.js — UX-1b: спасение протухшей сессии. Без DOM.
 *
 * Снимок `ap-active-session` старше STALE_SESSION_MS по savedAt (последнее
 * касание) раньше стирался молча вместе с закрытыми подходами. Теперь они
 * уходят в журнал тем же путём, что «Завершить» (buildSessionSummary +
 * persistFinalSession); 1RM — только через commit(), когда окно «Вернуть»
 * закрылось без отмены (запись 1RM необратима).
 *
 * Вне бут-графа: импортируют только лениво грузимые workout.view.js и
 * workout.view/handlers.js, workout.store.js этот модуль не импортирует.
 */

import { DB } from './db.js';
import {
  State,
  SESSION_KEY,
  STALE_SESSION_MS,
  isRecorded,
  clearPersistedSession,
  buildSessionSummary,
  persistFinalSession,
  applyOneRMUpdates,
} from './workout.store.js';

export { STALE_SESSION_MS };


/**
 * Закрытые подходы, которые попадут в запись: isRecorded и не Camera 4 (noDb
 * в журнал не идёт — пустая строка журнала хуже, чем ничего).
 * @param {any[]} plan
 * @returns {number}
 */
export function rescuableSets(plan) {
  let n = 0;
  for (const ex of plan || []) {
    if (ex?.noDb || !isRecorded(ex)) continue;
    for (const s of ex.sets || []) if (s.done) n++;
  }
  return n;
}

/**
 * @typedef {{ id: number, sets: number, startedAt: number,
 *   undo: () => Promise<boolean>, commit: () => Promise<boolean> }} RescuedSession
 */

/**
 * Записать снимок в журнал. Длительность = savedAt − startedAt, timestamp =
 * startedAt. undo() удаляет запись, commit() пишет 1RM; сработает только
 * первый из двух вызовов.
 * @param {{ type: string, plan: any[], startedAt: number, blockTimings?: object, savedAt: number }} snap
 * @param {{ oneRMLookup?: (name: string) => Promise<any> }} [opts]
 * @returns {Promise<RescuedSession|null>} null — нечего сохранять
 */
export async function rescueSession(snap, opts = {}) {
  const plan = Array.isArray(snap?.plan) ? snap.plan : [];
  const sets = rescuableSets(plan);
  if (!sets) return null;
  const savedAt = Number(snap.savedAt) || Date.now();
  const startedAt = Number(snap.startedAt) || savedAt;
  const duration = Math.max(0, savedAt - startedAt);
  const state = { type: snap.type, plan, startedAt, blockTimings: snap.blockTimings || {} };
  const summary = await buildSessionSummary(state, duration, opts);
  const id = await persistFinalSession(state, summary, duration, { oneRM: false });
  let settled = false;
  return {
    id,
    sets,
    startedAt,
    async undo() {
      if (settled) return false;
      settled = true;
      await DB.Workouts.deleteById(id);
      return true;
    },
    async commit() {
      if (settled) return false;
      settled = true;
      await applyOneRMUpdates(plan);
      return true;
    },
  };
}

/**
 * @param {string} raw
 * @returns {any}
 */
function _parseSnapshot(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Загрузка Train: протухший снимок → журнал. Снимок снимается синхронно (двойной
 * load() не задвоит запись); сбой записи кладёт его обратно до следующей загрузки.
 * @param {{ oneRMLookup?: (name: string) => Promise<any> }} [opts]
 * @returns {Promise<RescuedSession|null>}
 */
export async function rescueStaleSession(opts = {}) {
  const raw = localStorage.getItem(SESSION_KEY);
  const snap = _parseSnapshot(raw);
  if (!snap || !(Date.now() - snap.savedAt > STALE_SESSION_MS)) return null;
  localStorage.removeItem(SESSION_KEY);
  try {
    return await rescueSession(snap, opts);
  } catch (err) {
    localStorage.setItem(SESSION_KEY, /** @type {string} */ (raw));
    throw err;
  }
}

/**
 * Сторож 12 ч: активную сессию в памяти — в журнал, без диалога. Фаза снимается
 * синхронно, поэтому следующий тик сторожа получит null. Конец сессии — savedAt
 * снимка (последнее касание), а не момент срабатывания сторожа.
 * @param {{ oneRMLookup?: (name: string) => Promise<any> }} [opts]
 * @returns {Promise<RescuedSession|null>}
 */
export async function rescueActiveSession(opts = {}) {
  if (State.phase !== 'active') return null;
  const prev = _parseSnapshot(localStorage.getItem(SESSION_KEY));
  const snap = {
    type: State.type,
    plan: State.plan,
    startedAt: State.startedAt,
    blockTimings: State.blockTimings || {},
    savedAt: Number(prev?.savedAt) || Date.now(),
  };
  State.phase = 'select';
  State.startedAt = 0;
  State.plan = [];
  State.blockTimings = {};
  clearPersistedSession();
  try {
    return await rescueSession(snap, opts);
  } catch (err) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
    throw err;
  }
}
