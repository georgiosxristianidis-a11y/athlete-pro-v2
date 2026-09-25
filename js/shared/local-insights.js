// @ts-check
/* ════════════════════════════════════════════════════════
   local-insights.js — инсайты ядра без модели (CORE-8)
   ────────────────────────────────────────────────────────
   ИИ выключен (airgap или тумблер) — экран ядра не ошибка, а режим:
   тот же снимок движков, что уходит модели (`buildSnapshot`, CORE-4),
   читается шаблонами. Чистая функция: ни DOM, ни базы, ни сети.

   Каждое число в тексте берётся из снимка и подставляется параметром
   `t()` — сырьём, поэтому экранирует тот, кто кладёт текст в DOM.
   Пороги ниже — пороги подачи текста, не движка: формулы и окна живут
   в `intel.engine.js` и отсюда не двигаются.
   ════════════════════════════════════════════════════════ */

import { t as translate } from '../locale.store.js';

/** Сколько карточек показывает экран: больше трёх читается как стена. */
export const LOCAL_INSIGHTS_MAX = 3;

/** Пороги подачи — те же ступени, что у виджета готовности (70/50). */
export const LOCAL_THRESHOLDS = Object.freeze({
  readinessHigh: 70,
  readinessMid: 50,
  cnsHigh: 70,
  musclePct: 60,
  idleHours: 96,
});

/**
 * @typedef {{ kind: 'readiness'|'cns'|'fatigue'|'strength'|'rhythm'|'start', text: string }} LocalInsight
 */

/**
 * @param {ReturnType<typeof import('./coach-snapshot.js').buildSnapshot>} snapshot
 * @param {(key: string, params?: Record<string, any>) => string} [t]
 * @returns {LocalInsight[]}
 */
export function buildLocalInsights(snapshot, t = translate) {
  /** @type {LocalInsight[]} */
  const out = [];
  const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];

  // Пустая история — единственная карточка: разбирать нечего, и говорить
  // «готовность не считается» новичку раньше, чем «запиши первую», — шум.
  if (!sessions.length) {
    return [{ kind: 'start', text: t('core.local.start') }];
  }

  const idx = snapshot?.readiness?.index;
  if (idx === null || idx === undefined) {
    out.push({ kind: 'readiness', text: t('core.local.readiness_none') });
  } else {
    const key =
      idx >= LOCAL_THRESHOLDS.readinessHigh
        ? 'core.local.readiness_high'
        : idx >= LOCAL_THRESHOLDS.readinessMid
          ? 'core.local.readiness_mid'
          : 'core.local.readiness_low';
    out.push({ kind: 'readiness', text: t(key, { index: Math.round(idx) }) });
  }

  const cns = Number(snapshot?.cns);
  if (Number.isFinite(cns) && cns >= LOCAL_THRESHOLDS.cnsHigh) {
    out.push({ kind: 'cns', text: t('core.local.cns_high', { cns: Math.round(cns) }) });
  }

  const [muscle, pct] =
    Object.entries(snapshot?.fatigue || {}).sort((a, b) => b[1] - a[1])[0] || [];
  if (muscle && pct >= LOCAL_THRESHOLDS.musclePct) {
    out.push({ kind: 'fatigue', text: t('core.local.muscle_tired', { muscle, pct }) });
  }

  // Сдвиг null — «не с чем сравнить», не ноль: такие строки молчат.
  const moved = (snapshot?.e1rm || []).filter((e) => Number.isFinite(e?.shift4w) && e.shift4w !== 0);
  const up = moved.filter((e) => e.shift4w > 0).sort((a, b) => b.shift4w - a.shift4w)[0];
  const down = moved.filter((e) => e.shift4w < 0).sort((a, b) => a.shift4w - b.shift4w)[0];
  if (up) {
    out.push({ kind: 'strength', text: t('core.local.e1rm_up', { exercise: up.exercise, kg: up.shift4w }) });
  } else if (down) {
    out.push({
      kind: 'strength',
      text: t('core.local.e1rm_down', { exercise: down.exercise, kg: Math.abs(down.shift4w) }),
    });
  }

  const hoursAgo = Number(sessions[0]?.hoursAgo);
  if (Number.isFinite(hoursAgo) && hoursAgo >= LOCAL_THRESHOLDS.idleHours) {
    out.push({ kind: 'rhythm', text: t('core.local.idle', { days: Math.round(hoursAgo / 24) }) });
  }

  return out.slice(0, LOCAL_INSIGHTS_MAX);
}
