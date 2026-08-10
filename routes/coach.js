'use strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { AIOrchestrator } from '../lib/aiOrchestrator.js';
import { logInfo, logWarn } from '../lib/logger.js';
import { asyncHandler } from '../lib/errors.js';
import { z } from 'zod';

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

const generatePlanSchema = z.object({
  workoutHistory: z.array(z.any()).optional().default([]),
  oneRMs: z.array(z.any()).optional().default([]),
  goals: z.string().optional().default('strength'),
  experience: z.string().optional().default('intermediate'),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().nullable().optional(),
  language: z.string().optional().default('en')
});

/* ── POST /generate-plan ── */
router.post('/generate-plan', apiLimiter, asyncHandler(async (req, res) => {
  const parseResult = generatePlanSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });
  
  const {
    workoutHistory,
    oneRMs,
    goals,
    experience,
    engine,
    language
  } = parseResult.data;

  logInfo(req, 'plan_generation_started', `Generating plan for ${goals}`);

  const DEFAULT_PLAN = {
    push: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 80, notes: '' }],
    pull: [{ name: 'Deadlift', sets: 4, reps: 5, weight: 120, notes: '' }],
    legs: [{ name: 'Squat', sets: 4, reps: 6, weight: 100, notes: '' }]
  };

  const system = _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience, language);
  let content;
  try {
    content = await AIOrchestrator.generateJSON({
      system,
      prompt: 'Generate a highly personalized 3-day PPL rotation. Return JSON only.',
      engine
    }, req);
  } catch (err) {
    // Offline-first contract: degrade to default plan instead of erroring
    logWarn(req, 'plan_generation_fallback', err.message, { code: err.code });
    return res.json({
      success: true,
      plan: DEFAULT_PLAN,
      generated: true,
      note: 'Default plan — AI unavailable'
    });
  }

  const plan = _parseGeneratedPlan(content, DEFAULT_PLAN);
  res.json({ success: true, plan, generated: true, aiNotes: content });
}));

const recommendationsSchema = z.object({
  workout: z.any(), // Keeping it loose as it's a complex object
  fatigue: z.any().optional().default({}),
  topLifts: z.array(z.any()).optional().default([]),
  nextSessionPlan: z.array(z.any()).min(1, 'nextSessionPlan is required'),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().nullable().optional()
});

/* ── POST /recommendations ── */
router.post('/recommendations', apiLimiter, asyncHandler(async (req, res) => {
  const parseResult = recommendationsSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });
  
  const { workout, fatigue, topLifts, nextSessionPlan, engine } = parseResult.data;
  
  const system = _buildRecommendationsPrompt(workout, fatigue, topLifts, nextSessionPlan);
  let content;
  try {
    content = await AIOrchestrator.generateJSON({
      system,
      prompt: 'Generate weight recommendations for the next session. Return JSON only.',
      engine
    }, req);
  } catch (err) {
    // Offline-first contract: maintain current weights instead of erroring
    logWarn(req, 'recommendations_fallback', err.message, { code: err.code });
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
      warning: 'AI recommendations unavailable'
    });
  }

  const recommendations = _parseRecommendations(content, nextSessionPlan);
  res.json({ success: true, recommendations, aiNotes: content });
}));

const COACH_MAX_MESSAGES = 40;
const COACH_MAX_CONTENT_LEN = 12000;
// Idle keep-alive: proxies (nginx/Vercel) drop silent connections while the model thinks.
const SSE_HEARTBEAT_MS = Number(process.env.COACH_SSE_HEARTBEAT_MS) || 15000;

const coachMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(COACH_MAX_CONTENT_LEN),
});

export const coachSchema = z.object({
  workouts: z.array(z.any()).optional().default([]),
  fatigue: z.any().optional().default({}),
  topLifts: z.array(z.any()).optional().default([]),
  messages: z.array(coachMessageSchema).min(1).max(COACH_MAX_MESSAGES),
  images: z.array(z.any()).optional().default([]),
  profile: z.any().optional().default({}),
  longTermStats: z.any().optional().default({}),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().nullable().optional(),
  language: z.string().optional().default('en'),
  tone: z.number().min(0).max(100).optional().default(50)
});

/* ── POST / (Main Coach SSE) ── */
router.post('/', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = coachSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  let { 
    workouts, 
    fatigue, 
    topLifts, 
    messages, 
    images, 
    profile, 
    longTermStats, 
    engine, 
    customKey,
    language,
    tone
  } = parseResult.data;

  // Final sanitization to prevent Gemini 400 errors
  if (!Array.isArray(workouts)) workouts = [];
  if (typeof fatigue !== 'object' || fatigue === null) fatigue = {};
  if (!Array.isArray(topLifts)) topLifts = [];
  if (!Array.isArray(images)) images = [];

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering so chunks flush immediately

  const system = _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats, language, tone);

  // Track client disconnect so we never write to a dead socket.
  let clientGone = false;
  res.on('close', () => { clientGone = true; });
  const canWrite = () => !clientGone && !res.writableEnded;

  const heartbeat = setInterval(() => {
    if (canWrite()) res.write(': ping\n\n');
  }, SSE_HEARTBEAT_MS);

  try {
    await AIOrchestrator.streamResponse({
      system,
      messages,
      images,
      engine,
      customKey,
      onChunk: (text) => { if (canWrite()) res.write(`data: ${JSON.stringify({ text })}\n\n`); }
    }, req);

    if (canWrite()) res.write('data: [DONE]\n\n');
  } catch (err) {
    if (res.headersSent) {
      // Mid-stream failure: headers already flushed, so a JSON error is impossible.
      // Emit a structured SSE error frame the client can render instead of a silent drop.
      logWarn(req, 'coach_stream_failed', err.message, { code: err.code });
      if (canWrite()) {
        res.write(`data: ${JSON.stringify({ error: err.message || 'AI stream failed', code: err.code || 'STREAM_ERROR' })}\n\n`);
      }
    } else {
      // Failed before the first byte (e.g. missing API key): drop the staged stream
      // headers so errorMiddleware can respond as clean application/json.
      res.removeHeader('Content-Type');
      res.removeHeader('X-Accel-Buffering');
      throw err;
    }
  } finally {
    clearInterval(heartbeat);
    // Only close here in streaming mode; the rethrow path leaves the response
    // open so errorMiddleware can still send a JSON error (e.g. missing API key).
    if (res.headersSent && !res.writableEnded) res.end();
  }
}));

const ttsSchema = z.object({
  text: z.string().min(1, 'text is required'),
  customKey: z.string().nullable().optional(),
  language: z.string().optional().default('en'),
  voice: z.string().optional().default('Fenrir')
});

/* ── POST /tts (Gemini 2.5 Flash Preview TTS) ── */
router.post('/tts', apiLimiter, asyncHandler(async (req, res) => {
  const parseResult = ttsSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { text, customKey, voice, language } = parseResult.data;

  const { gemini } = await import('../lib/geminiClient.js');
  const apiKey = customKey || gemini.apiKey;
  
  if (!apiKey || apiKey === 'dummy-key') {
    logWarn(req, 'tts_failed', 'GOOGLE_GENERATIVE_AI_API_KEY is not configured, triggering fallback.');
    return res.json({ fallback: true, error: 'API key missing' });
  }

  try {
    const ttsPrompt = language === 'ru' 
      ? `Прочитай этот текст выразительно и естественно: ${text}`
      : `Speak this exactly, with natural tone: ${text}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: ttsPrompt }] }],
      generationConfig: { 
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } 
      },
      model: "gemini-2.5-flash-preview-tts"
    })
  });

    if (!response.ok) {
      const errText = await response.text();
      logWarn(req, 'tts_failed', `TTS API error: ${errText}`);
      return res.json({ fallback: true, error: 'TTS Generation failed' });
    }

    const result = await response.json();
    const pcmData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!pcmData) {
      return res.json({ fallback: true, error: 'No audio data returned' });
    }

    res.json({ success: true, audioBase64: pcmData });
  } catch (err) {
    logWarn(req, 'tts_failed', `TTS exception: ${err.message}`);
    return res.json({ fallback: true, error: 'TTS Exception' });
  }
}));

const weeklyReportSchema = z.object({
  workouts: z.array(z.any()).optional().default([]),
  profile: z.any().optional().default({}),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().nullable().optional(),
  language: z.string().optional().default('en')
});

/* ── POST /weekly-report ── */
router.post('/weekly-report', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = weeklyReportSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { workouts, profile, engine, customKey, language } = parseResult.data;

  logInfo(req, 'weekly_report_started', `Generating weekly report`);

  const system = `You are "Athlete Pro Analyst", an elite sports data scientist.
Analyze the user's past 7 days of workouts.
LANGUAGE REQUIREMENT: ALL string values in the JSON (summary, pros, cons) MUST BE IN ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}.
Return ONLY JSON with this exact schema:
{
  "score": <number 0-100 representing overall performance and consistency>,
  "summary": "<string, 2-3 sentences in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'} of harsh but motivating feedback>",
  "pros": ["<string in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}>", "<string>"],
  "cons": ["<string in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}>", "<string>"]
}
If no workouts exist, set score to 0 and encourage them to start in ${language === 'ru' ? 'Russian' : 'English'}.`;

  const prompt = `Workouts (Last 7 Days): ${JSON.stringify(workouts)}
Profile: ${JSON.stringify(profile)}`;

  const content = await AIOrchestrator.generateJSON({
    system,
    prompt,
    engine,
    customKey
  }, req);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const report = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 0, summary: "Data unreadable. Push harder.", pros: [], cons: [] };
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse AI report' });
  }
}));

/* ── POST /analyze-latest ── */
router.post('/analyze-latest', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = weeklyReportSchema.safeParse(req.body); // reuse schema since it takes workouts & profile
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { workouts, profile, engine, customKey, language } = parseResult.data;
  logInfo(req, 'analyze_latest_started', `Analyzing latest workout`);

  const system = `You are "Athlete Pro Analyst", an elite sports data scientist.
Analyze the user's LATEST workout from the array.
LANGUAGE REQUIREMENT: ALL string values MUST BE IN ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}.
Return ONLY JSON with this exact schema:
{
  "readinessScore": <number 0-100 based on fatigue and performance>,
  "mainSuccess": "<string, 1 sentence in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'} focusing on what went well>",
  "mainWeakness": "<string, 1 sentence in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'} focusing on the biggest leak>",
  "advice": "<string, actionable advice for the next session in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}>"
}
If no workouts exist, return defaults and encourage starting.`;

  const prompt = `Workouts: ${JSON.stringify(workouts)}\nProfile: ${JSON.stringify(profile)}`;

  const content = await AIOrchestrator.generateJSON({ system, prompt, engine, customKey }, req);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const report = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!report) throw new Error("Unreadable");
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse AI analysis' });
  }
}));

/* ── POST /biometrics-scan ── */
router.post('/biometrics-scan', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = weeklyReportSchema.safeParse(req.body); 
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { workouts, profile, engine, customKey, language } = parseResult.data;
  logInfo(req, 'biometrics_scan_started', `Running biometrics scan`);

  const system = `You are "Athlete Pro Medical AI".
Run a biometrics check based on recent training volume and user profile.
LANGUAGE REQUIREMENT: ALL string values MUST BE IN ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}.
Return ONLY JSON with this exact schema:
{
  "cnsFatigue": <number 0-100, estimate Central Nervous System fatigue>,
  "muscleDamage": <number 0-100, estimate structural muscle damage>,
  "injuryRisk": "<Low|Medium|High>",
  "summary": "<string, 2 sentences in ${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'} analyzing overall biometric state>"
}`;

  const prompt = `Workouts: ${JSON.stringify(workouts)}\nProfile: ${JSON.stringify(profile)}`;

  const content = await AIOrchestrator.generateJSON({ system, prompt, engine, customKey }, req);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const report = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!report) throw new Error("Unreadable");
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse AI biometrics' });
  }
}));

// ── Private Prompt Helpers ───────────────────────────────────────────────────

function _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats, language, tone) {
  let toneInstruction = "Adopt a neutral, professional, and balanced coaching tone.";
  if (tone < 30) toneInstruction = "Adopt an empathetic, supportive, and restorative tone like a caring physical therapist. Focus on recovery and positive reinforcement.";
  if (tone > 70) toneInstruction = "Adopt a hardcore, ruthless, David Goggins-style drill sergeant tone with zero excuses and absolute discipline. Use harsh truths.";

  return `You are "Athlete Pro Coach", an elite AI strength & conditioning expert powered by Gemini.
If asked what model you are, state that you are Gemini operating via Google AI Studio API.

[PERSONA / TONE]
${toneInstruction}

[CONTEXT]
- History (last 5): ${JSON.stringify(workouts.slice(0, 5))}
- Current Fatigue: ${JSON.stringify(fatigue)}
- 1RMs: ${JSON.stringify(topLifts)}
- User Profile: ${JSON.stringify(profile)}
- Current Goal: ${profile.goal || 'General Health'}

[CRITICAL RULES]
1. ZERO FLUFF: Be concise. Give exact numbers.
2. SLEEP: Assume the user sleeps 7 hours on average. You may ask if needed.
3. GREETINGS: If the user simply says "hi" or "привет", respond exactly with: "${language === 'ru' ? 'Привет, нужен план?' : 'Hi, need a plan?'}".
4. LANGUAGE: You MUST automatically detect the language of the user's prompt (Russian or English) and reply in the EXACT SAME LANGUAGE. All JSON string values (like 'goal') and all textual advice MUST be in that detected language.
5. HUMAN DELIVERY: Write your responses as if you are speaking them aloud. Use natural conversational fillers (e.g. "Hmm...", "Let's see...", "Хм...", "Так...") and use ellipses (...) to create dramatic pauses before important numbers or advice.
6. MACRO #gym: If the user types EXACTLY or contains "#gym", you MUST output a raw JSON widget block ANYWHERE in your response, followed by a short textual advice.
JSON FORMAT MUST BE EXACTLY:
{"_widget": "readiness", "index": 82, "recovery": 77, "acwr": 88, "sleep": 64, "monotony": 95, "density": 93, "cns": 48, "goal": "${language === 'ru' ? 'Лёгкая / техническая' : 'Light / Technical'}"}
(Calculate these values from 0-100 based on fatigue, history, and rest days. Goal must be a short string in ${language === 'ru' ? 'Russian' : 'English'}).
6. ULTRA-TRUTH: You must explicitly ask yourself and include in your answer: "${language === 'ru' ? 'Что я не учёл. Какие нестандартные риски и идеи я не заметил, но которые могут перевернуть стратегию?' : 'What did I miss? What non-standard risks and ideas did I overlook that could flip the strategy?'}"

[WORKFLOW]
Before answering, use <thinking> tags to calculate the metrics. If #gym is requested, output the JSON block, then output your surgical advice.`;
}

function _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience, language) {
  return `You are an elite PPL programmer.
Experience: ${experience}
Goal: ${goals}
1RMs: ${JSON.stringify(oneRMs)}

Generate a 3-day PPL rotation (Push, Pull, Legs) in valid JSON.
Fields: name, sets, reps, weight, notes.
LANGUAGE: Write notes and exercise names in ${language === 'ru' ? 'Russian' : 'English'}.`;
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
