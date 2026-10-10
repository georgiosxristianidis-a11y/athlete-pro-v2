// @ts-check
/* ════════════════════════════════════════════════════════
   coach-snapshot.js — снимок движков для модели (CORE-4)
   ────────────────────────────────────────────────────────
   До CORE-4 каждая дверь коуча слала свой набор сырых полей БД
   (`workouts`, `fatigue`, `topLifts`, `profile`), а сервер вкладывал
   их в промпт как есть. Модель получала записи и сама пересчитывала
   то, что движки приложения уже посчитали.

   Теперь дверь отдаёт один объект: числа движков + сжатая история.
   Чистая функция без DOM и IndexedDB — её импортирует и клиент
   (`js/coach-snapshot.store.js`), и сервер (списки ключей и потолки
   для схемы в `routes/coach.js`). Состав снимка сторожит
   `test/coach-snapshot.test.js`: ключ вне `SNAPSHOT_KEYS` — красный гейт.
   ════════════════════════════════════════════════════════ */

import { readiness, bestE1RM, sessionLoad } from '../intel.engine.js';

export const SNAPSHOT_VERSION = 1;

/** Откуда открыт коуч: экран Core, панель Claude, чат на тренировке. */
export const DOORS = Object.freeze(['intel', 'panel', 'workout']);

/** Единственный полный список полей снимка. */
export const SNAPSHOT_KEYS = Object.freeze([
  'v', 'lang', 'door', 'readiness', 'cns', 'fatigue', 'insights', 'e1rm', 'sessions', 'profile',
]);

/** Белый список профиля — тот же, что уходил в `_coachProfile()` (CORE-1). */
export const PROFILE_KEYS = Object.freeze([
  'name', 'age', 'sex', 'goal', 'equipment', 'experienceYears', 'injuries',
  'limitationsText', 'mode', 'timeMin',
]);

export const LIMITS = Object.freeze({
  insights: 3,
  sessions: 3,
  e1rm: 5,
  exercisesPerSession: 12,
  /** Окно усталости по мышцам — то же, что у `Heatmap` (`COMPUTE_REST_HOURS`). */
  fatigueHours: 72,
  /** Окно сдвига e1RM. */
  shiftDays: 28,
});

/**
 * Потолки значений. Схема на сервере отвергает выход за них, а не подрезает,
 * поэтому сборщик подрезает сам — тем же числом.
 */
export const CAPS = Object.freeze({
  name: 60, shortText: 40, exercise: 60, kind: 20, insightTitle: 120, insightBody: 300,
  injury: 80, injuries: 20, limitations: 500, muscles: 30, age: 120, setsPerExercise: 100,
  kg: 2000, tonnageKg: 10_000_000, minutes: 100_000, hours: 1_000_000, years: 80, timeMin: 600,
});

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** @param {unknown} v @param {number} n */
const str = (v, n) => String(v ?? '').slice(0, n);

/**
 * Число в [lo, hi]; не число → 0.
 * @param {unknown} v @param {number} lo @param {number} hi
 */
const clamp = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : 0);

/**
 * Усталость по мышцам: шкала 0..1 у `Heatmap` → проценты, свежее 5% отсекается.
 * @param {Record<string, number>} scores
 * @returns {Record<string, number>}
 */
export function fatiguePercent(scores) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [muscle, v] of Object.entries(scores || {})) {
    if (Object.keys(out).length >= CAPS.muscles) break;
    if (v > 0.05) out[str(muscle, CAPS.shortText)] = clamp(Math.round(v * 100), 0, 100);
  }
  return out;
}

/**
 * Лучший расчётный 1ПМ по упражнению и его сдвиг за 4 недели: сейчас против
 * лучшего до окна. Нет истории старше окна — `shift4w: null`, а не ноль:
 * «не менялось» и «не с чем сравнить» — разные факты.
 * @param {Array<any>} workouts
 * @param {number} now
 * @returns {Array<{ exercise: string, kg: number, shift4w: number|null }>}
 */
export function e1rmShift(workouts, now) {
  const list = Array.isArray(workouts) ? workouts : [];
  const cutoff = now - LIMITS.shiftDays * DAY;
  const current = bestE1RM(list.filter((w) => Number(w?.timestamp) <= now));
  const before = bestE1RM(list.filter((w) => Number(w?.timestamp) < cutoff));
  return [...current.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITS.e1rm)
    .map(([name, kg]) => {
      const prev = before.get(name);
      return {
        exercise: str(name, CAPS.exercise),
        kg: Math.round(clamp(kg, 0, CAPS.kg)),
        shift4w: prev ? Math.round(clamp(kg - prev, -CAPS.kg, CAPS.kg)) : null,
      };
    });
}

/**
 * Последние сессии в сжатом виде. Пустые записи (тоннаж 0) — след брошенного
 * экрана, не тренировка: тот же отсев, что у `readiness()`.
 * @param {Array<any>} workouts
 * @param {number} now
 */
export function compressSessions(workouts, now) {
  return (Array.isArray(workouts) ? workouts : [])
    .filter((w) => Number.isFinite(w?.timestamp) && w.timestamp <= now && sessionLoad(w) > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, LIMITS.sessions)
    .map((w) => ({
      type: str(w.type, CAPS.kind),
      hoursAgo: Math.round(clamp((now - w.timestamp) / HOUR, 0, CAPS.hours)),
      tonnageKg: Math.round(clamp(w.tonnage, 0, CAPS.tonnageKg)),
      durationMin: Math.round(clamp(Number(w.duration) / 60000, 0, CAPS.minutes)),
      exercises: (w.exercises || [])
        .map((e) => ({
          name: str(e?.name, CAPS.exercise),
          sets: Math.min(CAPS.setsPerExercise, (e?.sets || []).filter((s) => s?.done !== false).length),
        }))
        .filter((e) => e.name && e.sets > 0)
        .slice(0, LIMITS.exercisesPerSession),
    }));
}

/**
 * Профиль — поля вписаны явно, порядок и состав те же, что `PROFILE_KEYS`.
 * @param {Record<string, any>} p
 */
function pickProfile(p) {
  const text = (/** @type {unknown} */ v, /** @type {number} */ n) => (v == null ? null : str(v, n));
  const int = (/** @type {unknown} */ v, /** @type {number} */ hi) =>
    v == null ? null : Math.round(clamp(v, 0, hi));
  return {
    name: text(p?.name, CAPS.name),
    age: int(p?.age, CAPS.age),
    sex: p?.sex === 'm' || p?.sex === 'f' ? p.sex : null,
    goal: text(p?.goal, CAPS.shortText),
    equipment: text(p?.equipment, CAPS.shortText),
    experienceYears: int(p?.experienceYears, CAPS.years),
    injuries: Array.isArray(p?.injuries)
      ? p.injuries.slice(0, CAPS.injuries).map((/** @type {unknown} */ i) => str(i, CAPS.injury))
      : null,
    limitationsText: text(p?.limitationsText, CAPS.limitations),
    mode: text(p?.mode, CAPS.shortText),
    timeMin: int(p?.timeMin, CAPS.timeMin),
  };
}

/**
 * Собрать снимок. Всё, чего нет в `SNAPSHOT_KEYS`, сюда войти не может —
 * поля вписаны явно, а не спредом входа.
 *
 * @param {{
 *   workouts: Array<any>,
 *   fatigue?: Record<string, number>,
 *   insights?: Array<{ kind?: string, title?: string, body?: string }>,
 *   profile?: Record<string, any>,
 *   lang?: string,
 *   door?: string,
 *   now?: number,
 * }} input
 */
export function buildSnapshot(input) {
  const now = Number.isFinite(input.now) ? /** @type {number} */ (input.now) : Date.now();
  const workouts = Array.isArray(input.workouts) ? input.workouts : [];
  const r = readiness(workouts, { now });
  return {
    v: SNAPSHOT_VERSION,
    lang: input.lang === 'ru' || input.lang === 'el' ? input.lang : 'en',
    door: DOORS.includes(/** @type {string} */ (input.door)) ? /** @type {string} */ (input.door) : 'panel',
    readiness: { index: r.index, confidence: r.confidence, parts: { ...r.parts } },
    cns: r.cns,
    fatigue: fatiguePercent(input.fatigue || {}),
    insights: (input.insights || []).slice(0, LIMITS.insights).map((i) => ({
      kind: str(i?.kind, CAPS.kind),
      title: str(i?.title, CAPS.insightTitle),
      body: str(i?.body, CAPS.insightBody),
    })),
    e1rm: e1rmShift(workouts, now),
    sessions: compressSessions(workouts, now),
    profile: pickProfile(input.profile || {}),
  };
}
