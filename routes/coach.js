'use strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { AIOrchestrator } from '../lib/aiOrchestrator.js';
import { logInfo, logWarn } from '../lib/logger.js';
import { asyncHandler } from '../lib/errors.js';

const router = express.Router();

// ── Rate limiters ────────────────────────────────────────────────────────────
const _limitOpts = {
  windowMs: 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many requests — please slow down.', requestId: req.correlationId }),
};
const coachLimiter = rateLimit({ ..._limitOpts, max: 10 });
const apiLimiter   = rateLimit({ ..._limitOpts, max: 20 });

/* ── POST /generate-plan ── */
router.post('/generate-plan', apiLimiter, asyncHandler(async (req, res) => {
  const {
    workoutHistory = [],
    oneRMs = [],
    goals = 'strength',
    experience = 'intermediate',
    engine = 'anthropic'
  } = req.body;

  logInfo(req, 'plan_generation_started', `Generating plan for ${goals}`);

  const DEFAULT_PLAN = {
    push: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 80, notes: '' }],
    pull: [{ name: 'Deadlift', sets: 4, reps: 5, weight: 120, notes: '' }],
    legs: [{ name: 'Squat', sets: 4, reps: 6, weight: 100, notes: '' }]
  };

  const system = _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience);
  const content = await AIOrchestrator.generateJSON({
    system,
    prompt: 'Generate a highly personalized 3-day PPL rotation. Return JSON only.',
    engine
  }, req);

  const plan = _parseGeneratedPlan(content, DEFAULT_PLAN);
  res.json({ success: true, plan, generated: true, aiNotes: content });
}));

/* ── POST /recommendations ── */
router.post('/recommendations', apiLimiter, asyncHandler(async (req, res) => {
  const { workout, fatigue = {}, topLifts = [], nextSessionPlan = [], engine = 'anthropic' } = req.body;
  
  const system = _buildRecommendationsPrompt(workout, fatigue, topLifts, nextSessionPlan);
  const content = await AIOrchestrator.generateJSON({
    system,
    prompt: 'Generate weight recommendations for the next session. Return JSON only.',
    engine
  }, req);

  const recommendations = _parseRecommendations(content, nextSessionPlan);
  res.json({ success: true, recommendations, aiNotes: content });
}));

/* ── POST /coach ── */
router.post('/coach', coachLimiter, asyncHandler(async (req, res) => {
  const { workouts = [], fatigue = {}, topLifts = [], messages, profile = {}, longTermStats = {}, engine = 'anthropic' } = req.body;

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const system = _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats);

  await AIOrchestrator.streamResponse({
    system,
    messages,
    engine,
    onChunk: (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`)
  }, req);

  res.write('data: [DONE]\n\n');
  res.end();
}));

// ── Private Prompt Helpers ───────────────────────────────────────────────────

function _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats) {
  return `You are "Athlete Pro Coach", a premium AI strength & conditioning expert.
Context:
- History: ${JSON.stringify(workouts.slice(0, 5))}
- Fatigue: ${JSON.stringify(fatigue)}
- 1RMs: ${JSON.stringify(topLifts)}
- User Profile: ${JSON.stringify(profile)}

Rules:
1. Tone: Professional, analytical, but motivating.
2. Language: Match user language (Russian if Cyrillic detected).
3. Focus: Progressive overload and safety.
4. Strategy: Consider long-term trends if provided. Current goal: ${profile.goal || 'General Health'}.`;
}

function _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience) {
  return `You are an elite PPL programmer.
Experience: ${experience}
Goal: ${goals}
1RMs: ${JSON.stringify(oneRMs)}

Generate a 3-day PPL rotation (Push, Pull, Legs) in valid JSON.
Fields: name, sets, reps, weight, notes.`;
}

function _buildRecommendationsPrompt(workout, fatigue, topLifts, nextPlan) {
  return `Performance Analyst.
Last Workout: ${JSON.stringify(workout)}
Fatigue: ${JSON.stringify(fatigue)}
Plan: ${nextPlan.map(e => e.name).join(', ')}

Recommend weights and reasons in JSON format.`;
}

function _parseGeneratedPlan(content, fallback) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : fallback;
  } catch { return fallback; }
}

function _parseRecommendations(content, plan) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return plan.map(ex => ({ ...ex, recommendedWeight: ex.weight, reason: 'Maintain' }));
    
    const parsed = JSON.parse(jsonMatch[0]);
    return plan.map(ex => ({
      ...ex,
      recommendedWeight: parsed[ex.name] || ex.weight,
      reason: parsed.reasons?.[ex.name] || 'Standard progression'
    }));
  } catch {
    return plan.map(ex => ({ ...ex, recommendedWeight: ex.weight, reason: 'Maintain' }));
  }
}

export default router;
