// @ts-check
/* ════════════════════════════════════════════════════════
   claude.store.js — Claude AI data layer
   Heatmap computation, muscle map, chat state, SSE fetch
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

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
};

/* ══════════════════════════════════════════════
   FETCH COACH — SSE streaming from /api/coach
   ══════════════════════════════════════════════ */

/**
 * Stream a coaching response from the server via SSE.
 * @param {string|null} message — user message, or null for initial load
 * @param {Object} opts — callback options
 * @param {function(string): void} opts.onText — called for each streamed text chunk
 * @param {function(string): void} opts.onDone — called when stream completes, with full text
 * @param {function(string): void} opts.onError — called on error with error message
 * @returns {Promise<void>}
 */
export async function fetchCoach(message, { onText, onDone, onError }) {
  if (_streaming) return;
  _streaming = true;

  const ctx = _context;
  if (!ctx) {
    _streaming = false;
    onError('No context loaded');
    return;
  }

  const { workouts, scores, orms } = ctx;

  try {
    // Build messages array
    const apiMessages = [
      { role: 'user', content: 'What should I focus on today?' },
      ..._chatHistory,
    ];
    if (message) apiMessages.push({ role: 'user', content: message });

    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workouts: workouts.slice(0, 5).map((w) => ({
          type: w.type,
          hoursAgo: Math.round((Date.now() - w.timestamp) / 3600000),
          tonnageKg: Math.round(w.tonnage || 0),
          durationMin: Math.round((w.duration || 0) / 60),
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
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
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
          const { text, error } = JSON.parse(raw);
          if (error) throw new Error(error);
          if (text) {
            aiText += text;
            onText(text);
          }
        } catch (parseErr) {
          if (parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
        }
      }
    }

    // Store in conversation history
    if (aiText) {
      if (message === null) {
        _chatHistory = [{ role: 'assistant', content: aiText }];
      } else {
        _chatHistory.push({ role: 'user', content: message });
        _chatHistory.push({ role: 'assistant', content: aiText });
      }
    }

    onDone(aiText);
  } catch (err) {
    onError(err.message);
  } finally {
    _streaming = false;
  }
}
