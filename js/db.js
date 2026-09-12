// @ts-check
/* ════════════════════════════════════════════════════════
   db.js — Athlete Pro  |  IndexedDB data layer
   Facade split (DB-SPLIT card): schema/open/tx plumbing lives in
   js/db/core.js, per-store modules live in js/db/*.js. This file
   re-exports the same public API (DB.*) so no caller changes.
   ════════════════════════════════════════════════════════ */

import {
  S,
  newId,
  getDeviceId,
  withMeta,
  openDB,
  tx,
  req2p,
  req2pSafe,
  _triggerSync,
} from './db/core.js';
import { Settings } from './db/settings.js';
import { OneRM } from './db/onerm.js';
import { Metrics } from './db/metrics.js';
import { Events } from './db/events.js';
import { NutritionLogs } from './db/nutrition.js';
import { PlannedWorkouts } from './db/planned.js';
import { Workouts } from './db/workouts.js';
import { Backup } from './db/backup.js';

export { newId, getDeviceId, withMeta, openDB };

/* ── Type definitions ── */
/**
 * @typedef {{ id: number, type: 'push'|'pull'|'legs', timestamp: number,
 *   duration: number, tonnage: number, sessionRpe: number|null,
 *   exercises: Array<ExerciseRecord> }} WorkoutRecord
 *
 * @typedef {{ name: string, sets: Array<SetRecord> }} ExerciseRecord
 *
 * @typedef {{ weight: number, reps: number, rpe: number|null, done: boolean }} SetRecord
 *
 * @typedef {{ id: string, value: number, timestamp: number }} OneRMRecord
 *
 * @typedef {{ id: number, weight: number, height: number, bmi: number, timestamp: number }} MetricsRecord
 *
 * @typedef {{ id: number, timestamp: number, payload: Object }} NutritionRecord
 *
 * @typedef {{ id: number, timestamp: number, name: string, payload: Object }} PlanRecord
 */

/* ════════════════════════════════════════════════════════
   PURE AGGREGATE HELPERS  (no IDB — accept pre-fetched list)

   Period boundaries are CALENDAR-based and share one source of
   truth (startOfWeek / startOfMonth) so "Week" and "Month" stats
   stay consistent across volume AND count. Previously volume used
   rolling 7d/30d windows while count used the calendar month — that
   mismatch made Week == Month whenever all data was recent.
   ════════════════════════════════════════════════════════ */

/**
 * Start of the current ISO week (Monday 00:00) as an epoch ms.
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function startOfWeek(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const sinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/**
 * Start of the current calendar month (1st, 00:00) as an epoch ms.
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function startOfMonth(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
}

/**
 * Compute volume (tonnage) for the current calendar week.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function weeklyVolumeFrom(list, ref = new Date()) {
  const since = startOfWeek(ref);
  return list.filter((w) => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

/**
 * Compute volume (tonnage) for the current calendar month.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function monthlyVolumeFrom(list, ref = new Date()) {
  const since = startOfMonth(ref);
  return list.filter((w) => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

/**
 * Compute session count for the current calendar month.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function monthlyCountFrom(list, ref = new Date()) {
  const since = startOfMonth(ref);
  return list.filter((w) => w.timestamp >= since).length;
}

/**
 * Compute PPL split tonnage from pre-fetched workouts array.
 * @param {WorkoutRecord[]} list
 * @returns {{push: number, pull: number, legs: number}}
 */
export function pplTonnageFrom(list) {
  const r = { push: 0, pull: 0, legs: 0 };
  list.forEach((w) => {
    if (r[w.type] !== undefined) r[w.type] += w.tonnage || 0;
  });
  return r;
}

/**
 * Compute session count for the current calendar week.
 * @param {WorkoutRecord[]} list
 * @param {Date} [ref=new Date()]
 * @returns {number}
 */
export function weeklyCountFrom(list, ref = new Date()) {
  const since = startOfWeek(ref);
  return list.filter((w) => w.timestamp >= since).length;
}

/* ════════════════════════════════════════════════════════
   NUKE — clear everything (Danger Zone)
   ════════════════════════════════════════════════════════ */
/**
 * Ключи localStorage, которые переживают полное удаление данных.
 * Список короткий намеренно: каждая строка — с причиной, потому что
 * молчаливое исключение здесь читается как дыра, а не как решение.
 */
export const KEEP_ON_WIPE = Object.freeze([
  // Самоисключение из аналитики. js/usage.js объявляет это прямым текстом:
  // «localStorage: переживает очистку данных». Снести ключ — значит молча
  // включить телеметрию обратно человеку, который от неё отписался, то есть
  // отдать регрессию приватности в обратную сторону.
  'ap-usage-exclude',
  // Личность установки. js/db/backup.js её специально бережёт при импорте
  // («a backup cannot steal this installation's identity»); две ветки одного
  // модуля не должны обращаться с ней противоположно. Новый id заставляет
  // CRDT считать устройство незнакомым при следующем слиянии.
  'ap-device-id',
  // Верхняя отметка того, что уже слито с сервера. Обнулить её — значит на
  // следующем pull утянуть с сервера ВСЮ историю обратно в только что
  // опустошённый IDB: тумбстоунов clearAll не пишет, локально пусто, и
  // _putRaw кладёт всё назад. Удаление отменило бы само себя после reload.
  'ap-sync-pulled-at',
]);

/**
 * Сброс IndexedDB и только его. Этим пользуются тесты: им нужна чистая база,
 * а не чистое устройство, и мок localStorage они держат своими руками.
 * Пользовательское «удалить все мои данные» — `deleteAllUserData()`.
 * @returns {Promise<void>}
 */
async function clearAll() {
  await Promise.all([
    Workouts.clear(),
    OneRM.clear(),
    Metrics.clear(),
    Events.clear(),
    Settings.clear(),
    NutritionLogs.clear(),
    PlannedWorkouts.clear(),
  ]);
}

/**
 * Пользовательское удаление: IndexedDB плюс localStorage по деной-листу.
 * Разведено с `clearAll()` именем, а не флагом: забытый флаг молча оставляет
 * план, Body Metrics и снапшот аварийного восстановления на устройстве, и
 * `ap-active-session` поднимает «удалённую» тренировку после перезагрузки.
 * Имя забыть нельзя — оно одно на оба пользовательских пути.
 * @returns {Promise<void>}
 */
async function deleteAllUserData() {
  await clearAll();
  if (typeof localStorage === 'undefined') return;
  try {
    // Снять-очистить-вернуть, а не удалять в цикле: индексы localStorage
    // съезжают под removeItem, и обход по key(i) пропускает через один.
    const kept = [];
    for (const k of KEEP_ON_WIPE) {
      const v = localStorage.getItem(k);
      if (v !== null) kept.push([k, v]);
    }
    localStorage.clear();
    for (const [k, v] of kept) localStorage.setItem(k, v);
  } catch {
    /* private mode / storage disabled — удалять нечего */
  }
}

/* ── Public API ── */
export const DB = {
  Workouts,
  OneRM,
  Metrics,
  Settings,
  Events,
  NutritionLogs,
  PlannedWorkouts,
  Backup,
  clearAll,
  deleteAllUserData,
  openDB,
  newId,
  getDeviceId,
  withMeta,
  _getRaw: (store, id) => tx(store).then((s) => req2p(s.get(id))),
  // Raw writes for the sync pull path — plain put/delete with NO _triggerSync, so
  // applying a remote-won record locally never re-queues an upstream push (no echo).
  _putRaw: (store, row) => tx(store, 'readwrite').then((s) => req2pSafe(s.put(row), s.transaction)),
  _delRaw: (store, id) =>
    tx(store, 'readwrite').then((s) => {
      const keyField = store === 'settings' ? 'key' : 'id';
      return req2pSafe(
        s.put({ [keyField]: id, _deleted: true, updatedAt: Date.now(), deviceId: getDeviceId() }),
        s.transaction
      );
    }),
};
