'use strict';
const express = require('express');
const router = express.Router();
const anthropic = require('../lib/anthropicClient');
const { record } = require('../lib/tokenUsage');
const { logInfo, logWarn, logError } = require('../lib/logger');

const COACH_STREAM_TIMEOUT_MS = Number(process.env.COACH_STREAM_TIMEOUT_MS) || 120000;
const COACH_MAX_MESSAGES = 40;
const COACH_MAX_CONTENT_LEN = 12000;

/**
 * @param {unknown} body
 * @returns {{ ok: true } | { ok: false, code: number, error: string, detail: string }}
 */
function _validateCoachPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      code: 400,
      error: 'Body must be a JSON object',
      detail: 'body_type',
    };
  }
  const { messages } = body;
  if (!Array.isArray(messages)) {
    return {
      ok: false,
      code: 400,
      error: 'messages must be an array',
      detail: 'messages_type',
    };
  }
  if (messages.length === 0) {
    return {
      ok: false,
      code: 400,
      error: 'messages array is required',
      detail: 'messages_empty',
    };
  }
  if (messages.length > COACH_MAX_MESSAGES) {
    return {
      ok: false,
      code: 400,
      error: `Too many messages (max ${COACH_MAX_MESSAGES})`,
      detail: 'messages_limit',
    };
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return {
        ok: false,
        code: 400,
        error: `messages[${i}] must be an object`,
        detail: 'message_shape',
      };
    }
    if (m.role !== 'user' && m.role !== 'assistant') {
      return {
        ok: false,
        code: 400,
        error: `messages[${i}].role must be "user" or "assistant"`,
        detail: 'message_role',
      };
    }
    if (typeof m.content !== 'string') {
      return {
        ok: false,
        code: 400,
        error: `messages[${i}].content must be a string`,
        detail: 'message_content_type',
      };
    }
    if (m.content.length === 0 || m.content.length > COACH_MAX_CONTENT_LEN) {
      return {
        ok: false,
        code: 400,
        error: `messages[${i}].content must be 1–${COACH_MAX_CONTENT_LEN} characters`,
        detail: 'message_content_length',
      };
    }
  }
  return { ok: true };
}

/* ── POST /generate-plan — generate full PPL program ── */
router.post('/generate-plan', async (req, res) => {
  const {
    workoutHistory = [],
    oneRMs = [],
    goals = 'strength',
    experience = 'intermediate'
  } = req.body;

  // Fallback for new users without data
  const DEFAULT_PLAN = {
    push: [
      { name: 'Bench Press', sets: 4, reps: 8, weight: 80, notes: 'Focus on controlled descent' },
      { name: 'Incline DB Press', sets: 3, reps: 12, weight: 30, notes: '' },
      { name: 'Overhead Press', sets: 3, reps: 10, weight: 50, notes: '' },
      { name: 'Lateral Raise', sets: 3, reps: 15, weight: 12, notes: '' },
      { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: 25, notes: '' }
    ],
    pull: [
      { name: 'Deadlift', sets: 4, reps: 5, weight: 120, notes: 'Keep back neutral' },
      { name: 'Pull-up', sets: 3, reps: 8, weight: 0, notes: '' },
      { name: 'Barbell Row', sets: 3, reps: 10, weight: 70, notes: '' },
      { name: 'Face Pull', sets: 3, reps: 15, weight: 20, notes: '' },
      { name: 'Bicep Curl', sets: 3, reps: 12, weight: 18, notes: '' }
    ],
    legs: [
      { name: 'Squat', sets: 4, reps: 6, weight: 100, notes: 'Depth below parallel' },
      { name: 'Romanian Deadlift', sets: 3, reps: 10, weight: 80, notes: '' },
      { name: 'Leg Press', sets: 3, reps: 12, weight: 140, notes: '' },
      { name: 'Leg Curl', sets: 3, reps: 12, weight: 40, notes: '' },
      { name: 'Calf Raise', sets: 4, reps: 15, weight: 60, notes: '' }
    ]
  };

  // If no API key or no history, return default plan
  if (!process.env.ANTHROPIC_API_KEY || !workoutHistory.length) {
    return res.json({
      success: true,
      plan: DEFAULT_PLAN,
      generated: true,
      note: !process.env.ANTHROPIC_API_KEY
        ? 'Default plan — AI unavailable (ANTHROPIC_API_KEY not set)'
        : 'Default plan for new users — customize based on your goals'
    });
  }

  try {
    const system = _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      system,
      messages: [
        {
          role: 'user',
          content: 'Generate a personalized PPL program. Return JSON only, no markdown.'
        }
      ]
    });

    const content = response.content[0]?.text || '';
    record('/api/generate-plan', response.usage);
    const plan = _parseGeneratedPlan(content, DEFAULT_PLAN);

    res.json({
      success: true,
      plan,
      generated: true,
      aiNotes: content
    });
  } catch (err) {
    logError(req, 'generate_plan_error', err.message, {
      name: err.name,
      stack: err.stack && String(err.stack).slice(0, 800),
    });
    // Fallback to default plan on error
    res.json({
      success: true,
      plan: DEFAULT_PLAN,
      generated: true,
      note: 'Default plan — AI generation failed'
    });
  }
});

/* ── POST /recommendations — generate workout recommendations ── */
router.post('/recommendations', async (req, res) => {
  const {
    workout,
    fatigue = {},
    topLifts = [],
    history = [],
    nextSessionPlan = [],
  } = req.body;

  if (!workout || !nextSessionPlan.length) {
    logWarn(req, 'recommendations_bad_payload', 'workout or nextSessionPlan missing', {
      hasWorkout: Boolean(workout),
      planLen: Array.isArray(nextSessionPlan) ? nextSessionPlan.length : -1,
    });
    return res.status(400).json({
      error: 'workout and nextSessionPlan are required',
      requestId: req.correlationId,
    });
  }

  // If no API key, return simple fallback recommendations
  if (!process.env.ANTHROPIC_API_KEY) {
    const fallback = nextSessionPlan.map((ex) => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      recommendedWeight: ex.weight,
      reason: 'Maintain current weight (AI unavailable)',
    }));
    return res.json({
      success: true,
      recommendations: fallback,
      aiNotes: null,
      warning: 'AI recommendations unavailable — ANTHROPIC_API_KEY not set'
    });
  }

  try {
    const system = _buildRecommendationsPrompt(workout, fatigue, topLifts, history, nextSessionPlan);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system,
      messages: [
        {
          role: 'user',
          content: 'Generate personalized weight recommendations for the next session. Return JSON only, no markdown.',
        },
      ],
    });

    const content = response.content[0]?.text || '';
    const recommendations = _parseRecommendations(content, nextSessionPlan);

    res.json({ success: true, recommendations, aiNotes: content });
  } catch (err) {
    logError(req, 'recommendations_error', err.message, {
      name: err.name,
      stack: err.stack && String(err.stack).slice(0, 800),
    });
    res.status(500).json({ error: err.message, requestId: req.correlationId });
  }
});

/* ── POST /coach — stream a coaching response ── */
router.post('/coach', async (req, res) => {
  const validation = _validateCoachPayload(req.body);
  if (!validation.ok) {
    logWarn(req, 'coach_bad_payload', validation.detail, { clientError: validation.error });
    return res.status(validation.code).json({
      error: validation.error,
      requestId: req.correlationId,
    });
  }

  let { workouts = [], fatigue = {}, topLifts = [], messages } = req.body;

  if (!Array.isArray(workouts)) {
    logWarn(req, 'coach_coerce_payload', 'workouts is not an array — using []');
    workouts = [];
  }
  if (fatigue !== null && typeof fatigue === 'object' && !Array.isArray(fatigue)) {
    /* ok */
  } else {
    logWarn(req, 'coach_coerce_payload', 'fatigue invalid — using {}');
    fatigue = {};
  }
  if (!Array.isArray(topLifts)) {
    logWarn(req, 'coach_coerce_payload', 'topLifts is not an array — using []');
    topLifts = [];
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logWarn(req, 'coach_no_api_key', 'ANTHROPIC_API_KEY missing');
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not set in .env',
      requestId: req.correlationId,
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const t0 = Date.now();
  logInfo(req, 'coach_stream_start', 'Coach SSE stream started', {
    messageCount: messages.length,
    workoutContextN: workouts.length,
  });

  try {
    const system = _buildSystemPrompt(workouts, fatigue, topLifts);

    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      system,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    const timeoutErr = new Error('COACH_TIMEOUT');
    timeoutErr.code = 'COACH_TIMEOUT';

    await Promise.race([
      stream.finalMessage(),
      new Promise((_, reject) => setTimeout(() => reject(timeoutErr), COACH_STREAM_TIMEOUT_MS)),
    ]);

    res.write('data: [DONE]\n\n');
    logInfo(req, 'coach_stream_ok', 'Coach stream completed', { ms: Date.now() - t0 });
  } catch (err) {
    const isTimeout = err.code === 'COACH_TIMEOUT' || err.message === 'COACH_TIMEOUT';
    if (isTimeout) {
      logError(req, 'coach_timeout', 'Anthropic stream exceeded timeout', {
        timeoutMs: COACH_STREAM_TIMEOUT_MS,
        ms: Date.now() - t0,
      });
      res.write(
        `data: ${JSON.stringify({
          error: `Coach timed out after ${Math.round(COACH_STREAM_TIMEOUT_MS / 1000)}s`,
          requestId: req.correlationId,
        })}\n\n`
      );
    } else {
      logError(req, 'coach_stream_error', err.message, {
        name: err.name,
        ms: Date.now() - t0,
        stack: err.stack && String(err.stack).slice(0, 800),
      });
      res.write(
        `data: ${JSON.stringify({ error: err.message, requestId: req.correlationId })}\n\n`
      );
    }
    res.write('data: [DONE]\n\n');
  }

  res.end();
});

/* ── Parse generated PPL plan from AI response ── */
function _parseGeneratedPlan(aiContent, defaultPlan) {
  try {
    // Try to extract JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate structure
      if (parsed.push && parsed.pull && parsed.legs) {
        return parsed;
      }
    }
  } catch (e) {
    logWarn(null, 'parse_generated_plan', 'JSON parse failed, using defaults', {
      message: e.message,
    });
  }
  // Fallback: return default plan
  return defaultPlan;
}

/* ── Build system prompt for PPL program generation ── */
function _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience) {
  const lines = [
    'You are an elite PPL (Push/Pull/Legs) strength & conditioning coach.',
    'Your task: Generate a personalized 3-day PPL program based on the athlete\'s data.',
    '',
    '## Output Format',
    'Return JSON only (no markdown, no explanations):',
    '{',
    '  "push": [',
    '    { "name": "Exercise Name", "sets": 4, "reps": 8, "weight": 80, "notes": "Optional cue" }',
    '  ],',
    '  "pull": [ ... ],',
    '  "legs": [ ... ]',
    '}',
    '',
    '## Programming Rules by Goal',
    '- **strength**: 3-6 reps, 4-6 sets, 85-95% 1RM, 3-5min rest',
    '- **hypertrophy**: 8-15 reps, 3-5 sets, 65-85% 1RM, 60-90sec rest',
    '- **endurance**: 15-25 reps, 2-4 sets, 50-65% 1RM, 30-60sec rest',
    '',
    '## Experience Adjustments',
    '- **beginner**: 4-6 exercises per day, focus on compounds, conservative weights',
    '- **intermediate**: 5-7 exercises per day, mix of compounds and accessories',
    '- **advanced**: 6-9 exercises per day, advanced techniques (drop sets, supersets)',
    '',
    '## Exercise Selection',
    '- Push: Chest (3-4), Shoulders (2-3), Triceps (2-3)',
    '- Pull: Back (4-5), Rear Delt (1-2), Biceps (2-3)',
    '- Legs: Quads (2-3), Hamstrings (2-3), Glutes (1-2), Calves (2-3), Core (1-2)',
    '',
    '## Athlete Data',
  ];

  if (workoutHistory.length) {
    lines.push(`\n**Training History:** ${workoutHistory.length} sessions logged`);

    // Analyze recent workouts
    const recentWorkouts = workoutHistory.slice(-5);
    const pushCount = recentWorkouts.filter(w => w.type === 'push').length;
    const pullCount = recentWorkouts.filter(w => w.type === 'pull').length;
    const legsCount = recentWorkouts.filter(w => w.type === 'legs').length;

    lines.push(`- Recent split: ${pushCount} Push, ${pullCount} Pull, ${legsCount} Legs`);

    // Find most frequent exercises
    const exerciseCount = {};
    recentWorkouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        exerciseCount[ex.name] = (exerciseCount[ex.name] || 0) + 1;
      });
    });

    const topExercises = Object.entries(exerciseCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count}x)`);

    if (topExercises.length) {
      lines.push(`- Frequent exercises: ${topExercises.join(', ')}`);
    }
  }

  if (oneRMs.length) {
    lines.push(`\n**Top 1RMs:** ${oneRMs.map(o => `${o.exercise} ${o.value}kg`).join(', ')}`);
  }

  lines.push(`\n**Goal:** ${goals}`);
  lines.push(`**Experience:** ${experience}`);

  return lines.join('\n');
}

/* ── Parse AI recommendations from response ── */
function _parseRecommendations(aiContent, defaultPlan) {
  try {
    // Try to extract JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Merge with default plan to ensure all fields exist
      return defaultPlan.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        recommendedWeight: parsed[ex.name] || ex.weight,
        reason: parsed.reasons?.[ex.name] || 'Standard progression',
      }));
    }
  } catch (e) {
    console.warn('[_parseRecommendations] JSON parse failed, using defaults');
  }
  // Fallback: return default plan with no changes
  return defaultPlan.map((ex) => ({
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    recommendedWeight: ex.weight,
    reason: 'Maintain current weight',
  }));
}

/* ── Build system prompt for recommendations ── */
function _buildRecommendationsPrompt(workout, fatigue, topLifts, history, nextSessionPlan) {
  const lines = [
    'You are an elite PPL strength & conditioning coach.',
    'Your task: Generate personalized weight recommendations for the next training session.',
    '',
    '## Output Format',
    'Return JSON only (no markdown, no explanations):',
    '{',
    '  "exerciseName": recommendedWeightInKg,',
    '  "reasons": { "exerciseName": "brief reason" }',
    '}',
    '',
    '## Rules',
    '- If last session had all sets completed with good form → +2.5kg progression',
    '- If same weight for 3+ sessions → suggest deload or technique work',
    '- If high fatigue (>60%) → maintain weight or -5% for recovery',
    '- If RPE was low (6-7) → +2.5-5kg progression',
    '- If RPE was high (9-10) → maintain weight',
    '- Consider muscle imbalances and suggest adjustments',
    '',
    '## Athlete Data',
  ];

  if (workout) {
    const { type, tonnage, duration, exercises } = workout;
    const completedSets = (exercises || []).reduce(
      (sum, ex) => sum + (ex.sets || []).filter((s) => s.done).length,
      0
    );
    lines.push(`\n**Last Session (${(type || '?').toUpperCase()}):**`);
    lines.push(`- Tonnage: ${Math.round(tonnage || 0)}kg`);
    lines.push(`- Duration: ${Math.round((duration || 0) / 60000)}min`);
    lines.push(`- Completed sets: ${completedSets}`);
    if (exercises?.length) {
      lines.push('- Exercises:');
      exercises.forEach((ex) => {
        const done = (ex.sets || []).filter((s) => s.done).length;
        const total = ex.sets?.length || 0;
        const avgWeight =
          ex.sets?.reduce((s, set) => s + (set.weight || 0), 0) / (total || 1);
        lines.push(`  - ${ex.name}: ${done}/${total} sets @ ~${Math.round(avgWeight)}kg`);
      });
    }
  }

  const fatiguedMuscles = Object.entries(fatigue)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 30);

  if (fatiguedMuscles.length) {
    lines.push(
      `\n**High Fatigue Muscles:** ${fatiguedMuscles.map(([m, v]) => `${m} ${v}%`).join(', ')}`
    );
  }

  if (topLifts.length) {
    lines.push(
      `\n**Top 1RMs:** ${topLifts.map((l) => `${l.exercise} ${l.oneRM}kg`).join(', ')}`
    );
  }

  if (history.length) {
    lines.push(`\n**Training History:** ${history.length} sessions in last 14 days`);
  }

  lines.push('\n**Next Session Plan:**');
  nextSessionPlan.forEach((ex) => {
    lines.push(`- ${ex.name}: ${ex.sets}×${ex.reps} @ ${ex.weight}kg`);
  });

  return lines.join('\n');
}

/* ── Build system prompt with athlete context ── */
function _buildSystemPrompt(workouts, fatigue, topLifts) {
  const lines = [
    'You are an elite PPL (Push/Pull/Legs) strength & conditioning coach with 15+ years of experience.',
    'Your name is Coach. You speak in a confident, motivating tone — like a real coach who cares about results.',
    '',
    '## Communication Rules',
    '- Use emojis to make responses visual and engaging (💪🔥📊🎯⚠️✅📈)',
    '- Structure every response clearly: use bold headers, bullet points, and short paragraphs',
    '- Keep responses concise but complete (3–6 sentences max)',
    '- Be data-driven: reference the athlete\'s actual numbers when available',
    '- Be specific and actionable — no generic advice',
    '',
    '## Coaching Behavior',
    '- When the athlete asks a vague question, ask 1–2 clarifying questions before answering',
    '- Proactively flag: overtraining risks, muscle imbalances, missed muscle groups, stale weights',
    '- Suggest progressive overload when lifts plateau (same weight 3+ sessions)',
    '- After answering, end with a focused follow-up question to keep the athlete thinking',
    '- Examples of good follow-ups:',
    '  "🤔 How does your sleep look this week?"',
    '  "📊 Want me to break down your volume per muscle group?"',
    '  "🎯 What\'s your target 1RM for bench this month?"',
    '',
    '## Athlete Data',
  ];

  if (workouts.length) {
    lines.push('\n**Recent Workouts:**');
    for (const w of workouts) {
      const typeLabel = (w.type || '?').toUpperCase();
      lines.push(
        `- ${typeLabel}: ${w.hoursAgo}h ago | ${w.tonnageKg}kg volume | ${w.durationMin}min`
      );
      if (w.exercises?.length) {
        const ex = w.exercises
          .slice(0, 3)
          .map((e) => `${e.name} (${e.sets} sets)`)
          .join(', ');
        const more = w.exercises.length > 3 ? ` +${w.exercises.length - 3} more` : '';
        lines.push(`  Exercises: ${ex}${more}`);
      }
    }
  } else {
    lines.push('\n**No workout history yet.**');
  }

  const fatiguedMuscles = Object.entries(fatigue)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 10);

  if (fatiguedMuscles.length) {
    lines.push(
      `\n**Muscle Fatigue (72h window):** ${fatiguedMuscles.map(([m, v]) => `${m} ${v}%`).join(', ')}`
    );
  }

  if (topLifts.length) {
    lines.push(
      `\n**Top Estimated 1RMs:** ${topLifts.map((l) => `${l.exercise} ${l.oneRM}kg`).join(', ')}`
    );
  }

  return lines.join('\n');
}

module.exports = router;
module.exports._validateCoachPayload = _validateCoachPayload;
