// @ts-check
/* ════════════════════════════════════════════════════════
   coach-snapshot.store.js — сборка снимка для коуча (CORE-4)
   ────────────────────────────────────────────────────────
   Единственное место, где двери коуча встречаются с IndexedDB: экран
   Core (`intel.store.js`) и панель/чат тренировки (`claude.store.js`)
   зовут одну функцию и не читают историю сами. Расчёт — в чистом
   `shared/coach-snapshot.js`, здесь только чтение данных.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { Heatmap } from './claude.store.js';
import { generateInsights } from './insights.engine.js';
import { loadProfile, toCoachProfile } from './profile.store.js';
import { getLang } from './locale.store.js';
import { buildSnapshot } from './shared/coach-snapshot.js';

/**
 * Отказ любого источника не роняет вопрос коучу: пустой кусок снимка
 * честнее, чем ошибка вместо ответа.
 * @template T
 * @param {Promise<T>} p
 * @param {T} fallback
 * @returns {Promise<T>}
 */
const orElse = (p, fallback) => p.catch(() => fallback);

/**
 * @param {{ door: 'intel'|'panel'|'workout' }} opts откуда открыт коуч
 * @returns {Promise<ReturnType<typeof buildSnapshot>>}
 */
export async function collectCoachSnapshot({ door }) {
  const [workouts, fatigue, insights, profile] = await Promise.all([
    orElse(DB.Workouts.getAll(), []),
    orElse(Heatmap.compute(), {}),
    orElse(generateInsights(), []),
    orElse(loadProfile().then(toCoachProfile), {}),
  ]);
  return buildSnapshot({ workouts, fatigue, insights, profile, lang: getLang(), door });
}
