// @ts-check
/* ════════════════════════════════════════════════════════
   claude.store.js — Claude AI data layer
   Heatmap computation, muscle map, load recommendations
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { safeFetch } from './privacy.store.js';
import { athleteProScore } from './strength-engine.js';
import { DEFAULT_AI_ENGINE } from './shared/ai-engine.js';

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

/* ══════════════════════════════════════════════
   RECOMMENDATIONS — generate adaptive load suggestions
   ══════════════════════════════════════════════ */

const REC_KEY = 'ap-recommendations';

/**
 * @returns {string}
 */
function _newRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/**
 * Generate workout recommendations using hybrid approach:
 * - Simple progression for baseline weights
 * - AI for complex cases (plateaus, fatigue management)
 * @param {Object} workout — completed workout session
 * @param {Object} fatigue — muscle fatigue scores
 * @param {Array} orms — estimated 1RMs
 * @param {Array} nextSessionPlan — planned exercises for next session
 * @returns {Promise<Object>} Recommendations object
 */
export async function generateRecommendations(workout, fatigue, orms, nextSessionPlan) {
  if (!workout || !nextSessionPlan?.length) {
    console.warn('[generateRecommendations] Missing workout or plan');
    return null;
  }

  // Step 1: Compute simple progression baseline
  const simpleRecs = _computeSimpleProgression(workout, nextSessionPlan);

  // Step 2: Get AI analysis for complex cases
  let aiNotes = null;
  try {
    aiNotes = await _fetchAIRecommendations(workout, fatigue, orms, nextSessionPlan);
  } catch (err) {
    console.warn('[generateRecommendations] AI fallback:', err.message);
  }

  // Step 3: Merge simple recs with AI insights
  const recommendations = {
    type: workout.type,
    generatedAt: Date.now(),
    exercises: simpleRecs,
    aiNotes: aiNotes?.notes || null,
    highFatigue: Object.entries(fatigue)
      .filter(([, v]) => v > 0.5)
      .map(([m]) => m),
  };

  // Step 4: Save to localStorage
  _saveRecommendations(recommendations);

  return recommendations;
}

/**
 * Compute simple progressive progression.
 * @param {Object} lastWorkout — completed workout
 * @param {Array} nextPlan — next session plan
 * @returns {Array} Exercise recommendations
 */
function _computeSimpleProgression(lastWorkout, nextPlan) {
  const lastExercises = lastWorkout.exercises || [];

  return nextPlan.map((nextEx) => {
    const lastEx = lastExercises.find((e) => e.name === nextEx.name);
    const lastWeight = lastEx?.sets?.[0]?.weight || nextEx.weight;
    const lastSets = lastEx?.sets?.filter((s) => s.done).length || 0;
    const targetSets = nextEx.sets;

    // Progressive overload: if all sets completed → +2.5kg
    let recommendedWeight = lastWeight;
    let reason = 'Maintain current weight';

    if (lastSets >= targetSets && lastSets > 0) {
      recommendedWeight = Math.round(lastWeight * 2 + 2.5) / 2; // Round to nearest 0.5
      reason = 'Progressive overload: all sets completed';
    } else if (lastSets > 0 && lastSets < targetSets) {
      recommendedWeight = lastWeight;
      reason = 'Build consistency at current weight';
    }

    return {
      name: nextEx.name,
      sets: nextEx.sets,
      reps: nextEx.reps,
      currentWeight: lastWeight,
      recommendedWeight,
      delta: recommendedWeight > lastWeight ? `+${(recommendedWeight - lastWeight).toFixed(1)}kg` : '0',
      reason,
    };
  });
}

/**
 * Fetch AI-powered recommendations for complex cases.
 * @param {Object} workout — completed workout
 * @param {Object} fatigue — muscle fatigue scores
 * @param {Array} orms — estimated 1RMs
 * @param {Array} nextPlan — next session plan
 * @returns {Promise<{notes: string|null}>} AI insights
 */
async function _fetchAIRecommendations(workout, fatigue, orms, nextPlan) {
  const history = await DB.Workouts.getAll();
  const recentHistory = history.filter((w) => w.timestamp > Date.now() - 14 * 24 * 3600000);

  const engine = await DB.Settings.get('ai-engine', DEFAULT_AI_ENGINE);
  // A BYOK key belongs only to its own engine (per-engine field). Empty → server
  // .env key. Sending the wrong engine's key would 401.
  const customKey = (await DB.Settings.get(engine === 'gemini' ? 'gemini-key' : 'anthropic-key')) || undefined;

  const response = await safeFetch('/api/coach/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': _newRequestId(),
    },
    body: JSON.stringify({
      engine,
      customKey,
      workout: {
        type: workout.type,
        tonnage: workout.tonnage,
        duration: workout.duration,
        exercises: (workout.exercises || []).map((ex) => ({
          name: ex.name,
          sets: (ex.sets || []).map((s) => ({
            weight: s.weight,
            reps: s.reps,
            done: s.done,
            rpe: s.rpe,
          })),
        })),
      },
      fatigue: Object.fromEntries(
        Object.entries(fatigue).filter(([, v]) => v > 0.3).map(([k, v]) => [k, Math.round(v * 100)])
      ),
      topLifts: orms.slice(0, 5).map((o) => ({ exercise: o.id, oneRM: o.value })),
      history: recentHistory.length,
      nextSessionPlan: nextPlan.map((ex) => ({
        name: ex.name,
        weight: ex.weight,
        sets: ex.sets,
        reps: ex.reps,
      })),
    }),
  }, 'ai');

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const ref = err.requestId ? ` Ref: ${err.requestId}` : '';
    throw new Error((err.error || `HTTP ${response.status}`) + ref);
  }

  const data = await response.json();
  return { notes: data.aiNotes || null };
}

/**
 * Save recommendations to localStorage.
 * @param {Object} recs — recommendations object
 */
function _saveRecommendations(recs) {
  try {
    const key = `${REC_KEY}-${recs.type}`;
    localStorage.setItem(key, JSON.stringify(recs));
  } catch (err) {
    console.warn('[saveRecommendations] localStorage failed:', err.message);
  }
}

/**
 * Get stored recommendations for a workout type.
 * @param {string} type — 'push' | 'pull' | 'legs'
 * @returns {Object|null} Recommendations or null
 */
export function getRecommendations(type) {
  try {
    const key = `${REC_KEY}-${type}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const recs = JSON.parse(raw);
    // Expire after 7 days
    if (Date.now() - recs.generatedAt > 7 * 24 * 3600000) {
      localStorage.removeItem(key);
      return null;
    }
    return recs;
  } catch {
    return null;
  }
}
