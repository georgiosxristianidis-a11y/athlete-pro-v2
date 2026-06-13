// @ts-check
/* ════════════════════════════════════════════════════════
   claude.store.js — Claude AI data layer
   Heatmap computation, muscle map, chat state, SSE fetch
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { safeFetch } from './privacy.store.js';
import { loadProfile, computeAge } from './profile.store.js';
import { athleteProScore } from './strength-engine.js';

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
   CLAUDE STATE — shared chat state accessors
   ══════════════════════════════════════════════ */

/** @type {boolean} */
let _open = false;
/** @type {Object|null} */
let _context = null;
/** @type {Array<{role: string, content: string}>} */
let _chatHistory = [];
/** @type {boolean} */
let _streaming = false;
/** @type {Object|null} */
let _generatedPlan = null;

export const ClaudeState = {
  /** @returns {boolean} */
  get isOpen() { return _open; },
  /** @param {boolean} v */
  set isOpen(v) { _open = v; },
  /** @returns {Object|null} */
  get context() { return _context; },
  /** @param {Object|null} v */
  set context(v) { _context = v; },
  /** @returns {Array<{role: string, content: string}>} */
  get chatHistory() { return _chatHistory; },
  /** @param {Array<{role: string, content: string}>} v */
  set chatHistory(v) { _chatHistory = v; },
  /** @returns {boolean} */
  get isStreaming() { return _streaming; },
  /** @param {boolean} v */
  set isStreaming(v) { _streaming = v; },
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

  const response = await safeFetch('/api/coach/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': _newRequestId(),
    },
    body: JSON.stringify({
      engine: await DB.Settings.get('ai-engine', 'anthropic'),
      customKey: await DB.Settings.get('gemini-key'),
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

/* ══════════════════════════════════════════════
   FETCH COACH — SSE streaming from /api/coach
   ══════════════════════════════════════════════ */

const COACH_CLIENT_TIMEOUT_MS = 130000;

/**
 * @param {Error} err
 * @param {number} [status]
 * @param {string} [bodyError]
 * @returns {string}
 */
function _coachFetchErrorMessage(err, status, bodyError) {
  if (err?.name === 'AbortError') {
    return 'The coach took too long to respond. Try a shorter question or check your connection.';
  }
  const msg = err?.message || '';
  if (msg === 'Failed to fetch' || /network|fetch/i.test(msg)) {
    return "Can't reach the server. Run `npm run dev` (or `npm start`) and check your connection.";
  }
  if (status === 502 || status === 503) {
    return 'The coach service is temporarily unavailable. Try again in a moment.';
  }
  if (status === 413) {
    return 'Request too large. Shorten the message or clear some chat history.';
  }
  return bodyError || msg || 'Something went wrong talking to the coach.';
}

/**
 * Render local insights as a markdown-ish text block for the chat UI.
 * @param {Array<{title:string, body:string, action?:string}>} insights
 * @param {'cloud'|'anon'|'airgap'} mode
 * @returns {string}
 */
function _renderInsightsAsText(insights, mode) {
  const banner = mode === 'airgap'
    ? '**Air-Gapped — local insights only.** No data left this device.\n\n'
    : '**AI Coach is off.** Showing rule-based insights from your local data.\n\n';
  if (!insights.length) {
    return banner + 'Not enough data yet. Log a few workouts and check back.';
  }
  const body = insights.map(i => {
    const action = i.action ? `\n  → ${i.action}` : '';
    return `**${i.title}**\n${i.body}${action}`;
  }).join('\n\n');
  return banner + body;
}

/**
 * Stream a coaching response from the server via SSE.
 * @param {string|null} message — user message, or null for initial load
 * @param {Object} opts — callback options
 * @param {function(string): void} opts.onText — called for each streamed text chunk
 * @param {function(string): void} opts.onDone — called when stream completes, with full text
 * @param {function(string): void} opts.onError — called on error with error message
 * @param {Object|null} [contextOverride] — optional context when ClaudeState.context is not set (e.g. in-workout AI)
 * @returns {Promise<void>}
 */
export async function fetchCoach(message, { onText, onDone, onError }, contextOverride = null) {
  if (_streaming) return;
  _streaming = true;

  // Privacy gate: short-circuit to local Insights if AI is blocked
  try {
    const { getPrivacyMode, getAiEnabled } = await import('./privacy.store.js');
    if (getPrivacyMode() === 'airgap' || !getAiEnabled()) {
      const { generateInsights } = await import('./insights.engine.js');
      const insights = await generateInsights();
      const text = _renderInsightsAsText(insights, getPrivacyMode());
      // Stream-like: chunk the local text so UI animation matches
      let i = 0;
      const chunk = () => {
        if (i >= text.length) { _streaming = false; onDone?.(text); return; }
        const slice = text.slice(i, i + 6);
        i += 6;
        onText(slice);
        setTimeout(chunk, 18);
      };
      chunk();
      return;
    }
  } catch { /* fall through to network coach */ }

  const ctx = contextOverride ?? _context;
  if (!ctx) {
    _streaming = false;
    onError('No workout context loaded. Open the dashboard and try again.');
    return;
  }

  const { workouts, scores, orms } = ctx;
  const persistChatToStore = !ctx.skipPersistChatHistory;
  const chatSource =
    ctx.chatHistory != null && Array.isArray(ctx.chatHistory) ? ctx.chatHistory : _chatHistory;

  const engine = await DB.Settings.get('ai-engine', 'anthropic');
  const requestId = _newRequestId();
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), COACH_CLIENT_TIMEOUT_MS);

  // ... (enriched profile logic) ...

  try {
    const profileObj = await loadProfile();
    const coachProfile = {
      name: profileObj.name,
      age: computeAge(profileObj.dob),
      sex: profileObj.sex,
      goal: profileObj.goal
    };
    const longTermStats = {}; // To be populated in Phase 7 (Deep Analytics)

    // Build messages array
    const apiMessages = [
      { role: 'user', content: 'What should I focus on today?' },
      ...chatSource,
    ];
    if (message) apiMessages.push({ role: 'user', content: message });

    const response = await safeFetch('/api/coach', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({
        engine,
        customKey: await DB.Settings.get('gemini-key'),
        workouts: workouts.slice(0, 5).map((w) => ({
          type: w.type,
          hoursAgo: Math.round((Date.now() - w.timestamp) / 3600000),
          tonnageKg: Math.round(w.tonnage || 0),
          durationMin: Math.round((w.duration || 0) / 60000),
          exercises: (w.exercises || [])
            .map((e) => ({ name: e.name, sets: (e.sets || []).filter((s) => s.done).length }))
            .filter((e) => e.sets > 0),
        })),
        fatigue: Object.fromEntries(
          Object.entries(scores)
            .filter(([, v]) => v > 0.05)
            .map(([k, v]) => [k, Math.round(v * 100)])
        ),
        topLifts: orms
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
          .map((o) => ({ exercise: o.id, oneRM: o.value })),
        profile: coachProfile,
        longTermStats,
        messages: apiMessages,
      }),
    }, 'ai');

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const hint = _coachFetchErrorMessage(
        new Error(errJson.error || `HTTP ${response.status}`),
        response.status,
        errJson.error
      );
      const ref = errJson.requestId ? ` Ref: ${errJson.requestId}` : '';
      throw Object.assign(new Error(hint + ref), { requestId: errJson.requestId });
    }

    if (!response.body) {
      throw new Error('No response body from coach. Check that the app server is running.');
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aiText = '';

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break outer;
        try {
          const payload = JSON.parse(raw);
          const { text, error, requestId: rid } = payload;
          if (error) {
            const ref = rid ? ` Ref: ${rid}` : '';
            throw new Error(error + ref);
          }
          if (text) {
            aiText += text;
            onText(text);
          }
        } catch (parseErr) {
          if (parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
        }
      }
    }

    // Store in conversation history (dashboard) unless caller owns history (in-workout AI)
    if (aiText && persistChatToStore) {
      if (message === null) {
        _chatHistory = [{ role: 'assistant', content: aiText }];
      } else {
        _chatHistory.push({ role: 'user', content: message });
        _chatHistory.push({ role: 'assistant', content: aiText });
      }
    }

    onDone(aiText);
  } catch (err) {
    const base = _coachFetchErrorMessage(err, undefined, err.message);
    onError(base);
  } finally {
    clearTimeout(timeoutId);
    _streaming = false;
  }
}
