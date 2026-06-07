'use strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import anthropic from '../lib/anthropicClient.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { record } from '../lib/tokenUsage.js';
import { logInfo, logWarn, logError } from '../lib/logger.js';

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');

const COACH_STREAM_TIMEOUT_MS = Number(process.env.COACH_STREAM_TIMEOUT_MS) || 120000;
const PLAN_TIMEOUT_MS         = Number(process.env.PLAN_TIMEOUT_MS)         || 30000;
const COACH_MAX_MESSAGES      = 40;
const COACH_MAX_CONTENT_LEN   = 12000;

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

/**
 * @param {unknown} body
 */
export function _validateCoachPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 400, error: 'Body must be a JSON object' };
  }
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, code: 400, error: 'messages array is required' };
  }
  return { ok: true };
}

/* ── POST /generate-plan ── */
router.post('/generate-plan', apiLimiter, async (req, res) => {
  const {
    workoutHistory = [],
    oneRMs = [],
    goals = 'strength',
    experience = 'intermediate',
    engine = 'anthropic'
  } = req.body;

  const DEFAULT_PLAN = {
    push: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 80, notes: '' }],
    pull: [{ name: 'Deadlift', sets: 4, reps: 5, weight: 120, notes: '' }],
    legs: [{ name: 'Squat', sets: 4, reps: 6, weight: 100, notes: '' }]
  };

  const isGemini = engine === 'gemini';
  const apiKey = isGemini ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !workoutHistory.length) {
    return res.json({ success: true, plan: DEFAULT_PLAN, generated: true });
  }

  try {
    const system = _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience);
    let content = '';

    if (isGemini) {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const result = await model.generateContent(`${system}\n\nGenerate a personalized PPL program. Return JSON only.`);
      content = result.response.text();
    } else {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: 'Generate a personalized PPL program. Return JSON only.' }]
      });
      content = response.content[0]?.text || '';
    }

    const plan = _parseGeneratedPlan(content, DEFAULT_PLAN);
    res.json({ success: true, plan, generated: true, aiNotes: content });
  } catch (err) {
    res.json({ success: true, plan: DEFAULT_PLAN, generated: true });
  }
});

/* ── POST /recommendations ── */
router.post('/recommendations', apiLimiter, async (req, res) => {
  const { workout, fatigue = {}, topLifts = [], history = [], nextSessionPlan = [], engine = 'anthropic' } = req.body;
  
  const isGemini = engine === 'gemini';
  const apiKey = isGemini ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'AI API key not set' });

  try {
    const system = _buildRecommendationsPrompt(workout, fatigue, topLifts, history, nextSessionPlan);
    let content = '';

    if (isGemini) {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(`${system}\n\nGenerate weight recommendations. Return JSON only.`);
      content = result.response.text();
    } else {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: 'Generate weight recommendations. Return JSON only.' }],
      });
      content = response.content[0]?.text || '';
    }

    const recommendations = _parseRecommendations(content, nextSessionPlan);
    res.json({ success: true, recommendations, aiNotes: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /coach ── */
router.post('/coach', coachLimiter, async (req, res) => {
  const validation = _validateCoachPayload(req.body);
  if (!validation.ok) return res.status(validation.code).json({ error: validation.error });

  let { workouts = [], fatigue = {}, topLifts = [], messages, profile = {}, longTermStats = {}, engine = 'anthropic' } = req.body;

  const isGemini = engine === 'gemini';
  const apiKey = isGemini ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'AI API key not set' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const system = _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats);

    if (isGemini) {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const chat = model.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        })),
        systemInstruction: system
      });
      const result = await chat.sendMessageStream(messages[messages.length-1].content);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    } else {
      const stream = anthropic.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 900,
        system,
        messages,
      });
      stream.on('text', (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`));
      await stream.finalMessage();
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

function _parseGeneratedPlan(aiContent, defaultPlan) {
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return defaultPlan;
}

function _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience) {
  return `Goal: ${goals}, Experience: ${experience}. History: ${workoutHistory.length} sessions.`;
}

function _parseRecommendations(aiContent, defaultPlan) {
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return defaultPlan.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        recommendedWeight: parsed[ex.name] || ex.weight,
        reason: parsed.reasons?.[ex.name] || 'Standard progression',
      }));
    }
  } catch (e) {}
  return defaultPlan.map(ex => ({ ...ex, recommendedWeight: ex.weight, reason: 'Maintain' }));
}

function _buildRecommendationsPrompt(workout, fatigue, topLifts, history, nextSessionPlan) {
  return `Recommend weights for next session.`;
}

function _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats) {
  return `You are a coach. Context: ${workouts.length} workouts, ${Object.keys(fatigue).length} fatigued muscles.`;
}

export default router;
