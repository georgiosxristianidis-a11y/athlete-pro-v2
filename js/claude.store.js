// @ts-check
/* ════════════════════════════════════════════════════════
   claude.store.js — Claude AI data layer
   Heatmap computation, muscle map
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

/**
 * Видимость маскота — пара ключей (`ai-panda-hidden` + `show-mascot`), и
 * владелец пары один: `profile.store.js` (A13). Здесь только адрес для экрана
 * FAB, чтобы view читал через свой стор и не знал про вторую половину пары.
 */
export { getPandaHidden, hideMascot } from './profile.store.js';

export const COMPUTE_REST_HOURS = 72; // Standard window for fatigue decay

/* ══════════════════════════════════════════════
   MUSCLE MAP — which exercises hit which muscles
   ══════════════════════════════════════════════ */

/** @type {Object<string, string[]>} */
export const MUSCLE_MAP = {
  /* PUSH */
  'Bench Press': ['chest', 'front-delt', 'tricep'],
  'Incline DB Press': ['upper-chest', 'front-delt', 'tricep'],
  'Overhead Press': ['front-delt', 'mid-delt', 'tricep', 'upper-trap'],
  'Cable Fly': ['chest', 'front-delt'],
  'Tricep Pushdown': ['tricep'],
  'Lateral Raise': ['mid-delt'],
  'Chest Dip': ['chest', 'tricep', 'front-delt'],
  /* PULL */
  Deadlift: ['lower-back', 'glute', 'hamstring', 'trap', 'lat'],
  'Pull-up': ['lat', 'bicep', 'rear-delt'],
  'Barbell Row': ['lat', 'mid-trap', 'rear-delt', 'bicep'],
  'Cable Row': ['lat', 'mid-trap', 'rear-delt'],
  'Face Pull': ['rear-delt', 'mid-trap', 'rotator'],
  'Bicep Curl': ['bicep'],
  'Hammer Curl': ['bicep', 'brachialis'],
  /* LEGS */
  Squat: ['quad', 'glute', 'hamstring', 'lower-back'],
  'Romanian Deadlift': ['hamstring', 'glute', 'lower-back'],
  'Leg Press': ['quad', 'glute'],
  'Walking Lunge': ['quad', 'glute', 'hamstring'],
  'Leg Curl': ['hamstring'],
  'Leg Extension': ['quad'],
  'Calf Raise': ['calf'],
};

/* ══════════════════════════════════════════════
   HEATMAP — muscle fatigue score per muscle
   Scale 0–1 based on recency + volume
   ══════════════════════════════════════════════ */

export const Heatmap = (() => {
  /**
   * Compute muscle fatigue scores from recent workouts (72h window).
   * @returns {Promise<Object<string, number>>} Map of muscle name to fatigue score (0-1)
   */
  async function compute() {
    const since = Date.now() - 72 * 3600000;
    const workouts = await DB.Workouts.getAll();
    const recent = workouts.filter((w) => w.timestamp >= since);

    const scores = {}; // muscle → 0..1

    recent.forEach((w) => {
      const ageH = (Date.now() - w.timestamp) / 3600000; // hours ago
      const decay = Math.max(0, 1 - ageH / 72); // linear decay

      (w.exercises || []).forEach((ex) => {
        const muscles = MUSCLE_MAP[ex.name] || [];
        const doneSets = (ex.sets || []).filter((s) => s.done).length;
        const load = doneSets * decay;
        muscles.forEach((m) => {
          scores[m] = Math.min(1, (scores[m] || 0) + load * 0.15);
        });
      });
    });

    return scores;
  }

  /**
   * Get CSS color for a fatigue score.
   * @param {number} score — fatigue score 0-1
   * @returns {string|null} CSS color string, or null if fresh
   */
  function scoreColor(score) {
    if (!score || score < 0.05) return null; // fresh
    if (score < 0.3) return 'rgba(0,230,118,0.55)'; // light
    if (score < 0.6) return 'rgba(255,179,0,0.65)'; // moderate
    return 'rgba(255,71,87,0.75)'; // heavy
  }

  /**
   * Get human-readable label for a fatigue score.
   * @param {number} score — fatigue score 0-1
   * @returns {string} Label like "Fresh", "Warm", "Fatigued", "Heavy"
   */
  function scoreLabel(score) {
    if (!score || score < 0.05) return 'Fresh';
    if (score < 0.3) return 'Warm';
    if (score < 0.6) return 'Fatigued';
    return 'Heavy';
  }

  return { compute, scoreColor, scoreLabel };
})();

/* ══════════════════════════════════════════════
   CLAUDE STATE — shared panel state accessors
   Чат здесь больше не живёт (CORE-5): клиент коуча и
   память диалога — `intel.store.js` › streamCoachReply.
   ══════════════════════════════════════════════ */

/** @type {boolean} */
let _open = false;
/** @type {Object|null} */
let _generatedPlan = null;

export const ClaudeState = {
  /** @returns {boolean} */
  get isOpen() { return _open; },
  /** @param {boolean} v */
  set isOpen(v) { _open = v; },
  /** @returns {Object|null} */
  get generatedPlan() { return _generatedPlan; },
  /** @param {Object|null} v */
  set generatedPlan(v) { _generatedPlan = v; },
};
