// @ts-check
/* ════════════════════════════════════════════════════════
   progressive-overload.js — Systematic load recommendations
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

/* ══════════════════════════════════════════════
   CONFIGURATION
   ══════════════════════════════════════════════ */

const PLATEAU_THRESHOLD = 3; // sessions without progress
const PROGRESSION_INCREMENT = {
  upper: 2.5, // kg for upper body exercises
  lower: 5,   // kg for lower body exercises
  accessory: 1.25 // kg for accessory movements
};

/* ══════════════════════════════════════════════
   EXERCISE CLASSIFICATION
   ══════════════════════════════════════════════ */

const UPPER_BODY_KEYWORDS = [
  'bench', 'incline', 'overhead press', 'row', 'pull-up', 'pullup',
  'curl', 'pushdown', 'fly', 'raise', 'dip', 'shoulder press'
];

const LOWER_BODY_KEYWORDS = [
  'squat', 'deadlift', 'lunge', 'hip thrust', 'leg press', 'leg curl', 'leg extension', 'calf'
];

/**
 * Classify exercise for progression increment.
 * @param {string} exerciseName
 * @returns {'upper'|'lower'|'accessory'}
 */
export function classifyExercise(exerciseName) {
  const name = exerciseName.toLowerCase();

  // Check lower body first (more specific keywords)
  if (LOWER_BODY_KEYWORDS.some(k => name.includes(k))) {
    return 'lower';
  }
  // Check upper body
  if (UPPER_BODY_KEYWORDS.some(k => name.includes(k))) {
    return 'upper';
  }
  // Default to accessory for core/misc
  return 'accessory';
}

/* ══════════════════════════════════════════════
   PROGRESSION CALCULATION
   ══════════════════════════════════════════════ */

/**
 * Calculate recommended weight for next set/session.
 * @param {string} exerciseName
 * @param {number} currentWeight
 * @param {number} completedSets — sets completed at current weight
 * @param {number} targetSets — planned sets
 * @param {Object} options — { lastSessionWeight, lastSessionReps, history }
 * @returns {{ recommended: number, delta: number, reason: string, type: 'pr'|'recommended'|'normal' }}
 */
export function calculateProgression(exerciseName, currentWeight, completedSets, targetSets, options = {}) {
  const {
    lastSessionWeight = currentWeight,
    lastSessionReps = targetSets,
    history = []
  } = options;

  const category = classifyExercise(exerciseName);
  const increment = PROGRESSION_INCREMENT[category];

  let recommended = currentWeight;
  let reason = 'Maintain current weight';
  let type = 'normal';

  // Rule 1: All sets completed with good form → progression
  if (completedSets >= targetSets && completedSets > 0) {
    recommended = Math.round((currentWeight + increment) * 2) / 2; // Round to 0.5
    reason = `Progressive overload: ${completedSets}/${targetSets} sets completed`;
    type = 'recommended';
  }

  // Rule 2: Same weight for PLATEAU_THRESHOLD sessions → deload or technique
  if (history.length >= PLATEAU_THRESHOLD) {
    const recentWeights = history.slice(-PLATEAU_THRESHOLD).map(h => h.weight);
    const allSame = recentWeights.every(w => Math.abs(w - currentWeight) < 0.5);

    if (allSame) {
      recommended = Math.round((currentWeight * 0.9) * 2) / 2; // -10% deload
      reason = `Plateau detected (${PLATEAU_THRESHOLD} sessions). Suggest deload or technique work.`;
      type = 'recommended';
    }
  }

  // Rule 3: Check for PR opportunity
  const oneRMHistory = history.filter(h => h.oneRM).map(h => h.oneRM);
  if (oneRMHistory.length > 0) {
    const maxOneRM = Math.max(...oneRMHistory);
    if (currentWeight >= maxOneRM * 0.9) { // Working at 90%+ of best 1RM
      type = 'pr';
      reason = 'PR territory — focus on single reps';
    }
  }

  // Rule 4: Compare to last session
  if (lastSessionWeight !== currentWeight) {
    if (currentWeight > lastSessionWeight) {
      type = 'pr';
      reason = `New personal best: +${(currentWeight - lastSessionWeight).toFixed(1)}kg`;
    }
  }

  return {
    recommended,
    delta: recommended - currentWeight,
    reason,
    type
  };
}

/* ══════════════════════════════════════════════
   PLATEAU DETECTION
   ══════════════════════════════════════════════ */

/**
 * Detect plateau for an exercise.
 * @param {string} exerciseName
 * @param {Array} workoutHistory — last 10 workouts
 * @returns {{ isPlateau: boolean, sessions: number, lastProgress: number|null, suggestion: string }}
 */
export function detectPlateau(exerciseName, workoutHistory) {
  const sessions = [];

  // Find all sessions with this exercise
  for (const workout of workoutHistory) {
    const ex = (workout.exercises || []).find(e => e.name === exerciseName);
    if (ex) {
      const bestSet = (ex.sets || []).reduce((max, s) => {
        const volume = (s.weight || 0) * (s.reps || 0);
        return volume > max ? volume : max;
      }, 0);

      sessions.push({
        timestamp: workout.timestamp,
        weight: ex.sets?.[0]?.weight || 0,
        bestVolume: bestSet
      });
    }
  }

  // Sort by timestamp
  sessions.sort((a, b) => a.timestamp - b.timestamp);

  // Check last PLATEAU_THRESHOLD sessions
  const recent = sessions.slice(-PLATEAU_THRESHOLD);
  if (recent.length < PLATEAU_THRESHOLD) {
    return { isPlateau: false, sessions: recent.length, lastProgress: null, suggestion: '' };
  }

  const weights = recent.map(s => s.weight);
  const allSame = weights.every((w, _, arr) => Math.abs(w - arr[0]) < 0.5);

  if (allSame) {
    const lastProgressDate = sessions.find((s, i, arr) => {
      if (i === 0) return false;
      return s.weight > arr[i - 1].weight;
    });

    const weeksSinceProgress = lastProgressDate
      ? Math.round((Date.now() - lastProgressDate.timestamp) / (7 * 24 * 3600000))
      : 999;

    return {
      isPlateau: true,
      sessions: PLATEAU_THRESHOLD,
      lastProgress: weeksSinceProgress,
      suggestion: _generatePlateauSuggestion(exerciseName, weights[0])
    };
  }

  return { isPlateau: false, sessions: recent.length, lastProgress: null, suggestion: '' };
}

/**
 * Generate plateau suggestion.
 * @param {string} exercise
 * @param {number} currentWeight
 * @returns {string}
 */
function _generatePlateauSuggestion(exercise, currentWeight) {
  const category = classifyExercise(exercise);

  const suggestions = {
    upper: [
      `Try ${currentWeight - 5}kg for 2 weeks to rebuild technique`,
      `Add 1 rep per set before increasing weight`,
      `Consider a deload week at 60% volume`
    ],
    lower: [
      `Try ${currentWeight - 10}kg for 2 weeks to rebuild technique`,
      `Add volume with accessory movements (RDLs, leg press)`,
      `Consider a deload week — lower body needs more recovery`
    ],
    accessory: [
      `Focus on tempo: 3s eccentric, 1s pause`,
      `Increase reps before weight (15 → 20 reps)`,
      `Add 1-2 extra sets per week`
    ]
  };

  const options = suggestions[category] || suggestions.accessory;
  return options[Math.floor(Math.random() * options.length)];
}

/* ══════════════════════════════════════════════
   WEEKLY SUMMARY
   ══════════════════════════════════════════════ */

/**
 * Generate weekly summary with plateau alerts.
 * @param {Array} workoutHistory — all workouts
 * @returns {Promise<{summary: string, plateauAlerts: Array, prs: Array}>}
 */
export async function generateWeeklySummary(workoutHistory) {
  const since = Date.now() - 7 * 24 * 3600000; // Last 7 days
  const recent = workoutHistory.filter(w => w.timestamp >= since);

  const plateauAlerts = [];
  const prs = [];

  // Get all unique exercises
  const exercises = new Set();
  recent.forEach(w => {
    (w.exercises || []).forEach(e => exercises.add(e.name));
  });

  // Check each exercise
  for (const exName of exercises) {
    const plateau = detectPlateau(exName, workoutHistory);
    if (plateau.isPlateau) {
      plateauAlerts.push({
        exercise: exName,
        weeks: plateau.lastProgress,
        suggestion: plateau.suggestion
      });
    }

    // Check for PRs
    const sessionExercises = recent
      .flatMap(w => w.exercises || [])
      .filter(e => e.name === exName);

    const bestWeight = Math.max(...sessionExercises.map(e => e.sets?.[0]?.weight || 0));
    const allTimeBest = Math.max(
      ...(workoutHistory
        .flatMap(w => w.exercises || [])
        .filter(e => e.name === exName)
        .map(e => e.sets?.[0]?.weight || 0))
    );

    if (bestWeight >= allTimeBest && bestWeight > 0) {
      prs.push({
        exercise: exName,
        weight: bestWeight,
        date: new Date().toISOString()
      });
    }
  }

  // Build summary
  const summaryParts = [];
  if (recent.length > 0) {
    summaryParts.push(`**${recent.length} workouts** this week`);
  }
  if (prs.length > 0) {
    summaryParts.push(`**${prs.length} PRs**: ${prs.map(p => `${p.exercise} ${p.weight}kg`).join(', ')}`);
  }
  if (plateauAlerts.length > 0) {
    summaryParts.push(`**${plateauAlerts.length} plateaus** detected`);
  }

  return {
    summary: summaryParts.join('\n') || 'No workouts this week — rest is important too!',
    workoutCount: recent.length,
    plateauAlerts,
    prs
  };
}

/* ══════════════════════════════════════════════
   INLINE SUGGESTION RENDERER
   ══════════════════════════════════════════════ */

/**
 * Get CSS class for progression type.
 * @param {'pr'|'recommended'|'normal'} type
 * @returns {string}
 */
export function getTypeClass(type) {
  switch (type) {
    case 'pr': return 'progression-pr';
    case 'recommended': return 'progression-recommended';
    default: return 'progression-normal';
  }
}

/**
 * Get icon for progression type.
 * @param {'pr'|'recommended'|'normal'} type
 * @returns {string}
 */
export function getTypeIcon(type) {
  switch (type) {
    case 'pr': return '⚡';
    case 'recommended': return '•';
    default: return '·';
  }
}

/**
 * Render inline suggestion for set card.
 * @param {string} exerciseName
 * @param {number} currentWeight
 * @param {number} completedSets
 * @param {number} targetSets
 * @param {Object} options
 * @returns {Promise<{html: string, delta: number}>}
 */
export async function renderInlineSuggestion(exerciseName, currentWeight, completedSets, targetSets, options = {}) {
  const progression = calculateProgression(exerciseName, currentWeight, completedSets, targetSets, options);
  const icon = getTypeIcon(progression.type);
  const cssClass = getTypeClass(progression.type);

  const deltaText = progression.delta > 0
    ? `+${progression.delta.toFixed(1)}kg`
    : progression.delta < 0
      ? `${progression.delta.toFixed(1)}kg`
      : '0kg';

  return {
    html: `<span class="progression-suggestion ${cssClass}">
      ${icon} ${progression.recommended}kg × ${targetSets} <small>(${deltaText})</small>
    </span>`,
    delta: progression.delta
  };
}
