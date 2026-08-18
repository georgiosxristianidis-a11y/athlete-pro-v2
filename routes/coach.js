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
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many requests — please slow down.', requestId: req.correlationId }),
};
const coachLimiter = rateLimit({ ..._limitOpts, max: process.env.NODE_ENV === 'production' ? 30 : 200 });
const apiLimiter   = rateLimit({ ..._limitOpts, max: process.env.NODE_ENV === 'production' ? 60 : 300 });

const generatePlanSchema = z.object({
  workoutHistory: z.array(z.any()).optional().default([]),
  oneRMs: z.array(z.any()).optional().default([]),
  goals: z.string().optional().default('strength'),
  experience: z.string().optional().default('intermediate'),
  engine: z.string().optional().default('anthropic')
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
    engine
  } = parseResult.data;

  logInfo(req, 'plan_generation_started', `Generating plan for ${goals}`);

  const DEFAULT_PLAN = {
    push: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 80, notes: '' }],
    pull: [{ name: 'Deadlift', sets: 4, reps: 5, weight: 120, notes: '' }],
    legs: [{ name: 'Squat', sets: 4, reps: 6, weight: 100, notes: '' }]
  };

  const system = _buildPlanGenerationPrompt(workoutHistory, oneRMs, goals, experience);
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
  engine: z.string().optional().default('anthropic')
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
  customKey: z.string().optional(),
  tone: z.coerce.number().min(0).max(100).optional().default(50)
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

  const system = _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats, tone);

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
    logWarn(req, 'coach_stream_fallback', err.message, { code: err.code });
    const fallbackText = _generateCoachFallbackResponse({ messages, workouts, profile, topLifts, tone });
    
    // Stream fallback tokens gracefully
    const words = fallbackText.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      if (!canWrite()) break;
      const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      await new Promise(r => setTimeout(r, 25));
    }
    if (canWrite()) res.write('data: [DONE]\n\n');
  } finally {
    clearInterval(heartbeat);
    if (res.headersSent && !res.writableEnded) res.end();
  }
}));

function _generateCoachFallbackResponse({ messages = [], workouts = [], profile = {}, topLifts = [], tone = 50 }) {
  const userMsg = (messages[messages.length - 1]?.content || '').toLowerCase();
  const name = profile['athlete-name'] || profile['name'] || 'атлет';
  const isTough = tone > 70;
  const isFriendly = tone < 35;

  const lastWorkout = workouts[0] || null;
  const totalVolume = workouts.reduce((s, w) => s + (w.tonnage || 0), 0);
  const sessionCount = workouts.length;

  // 1. Приветствие / Статус / "Привет"
  if (/привет|здравствуй|хай|ку|hello|hi|hey|как дела|че как|статус|начать/i.test(userMsg)) {
    let greeting = isTough ? `Привет, ${name}. Хватит раскачиваться, за дело!`
      : isFriendly ? `Привет, ${name}! Отлично, что ты на связи. Готов к тренировке?`
      : `Привет, ${name}! На связи P.A.N.D.A. Core.`;

    let workoutInfo = '';
    if (lastWorkout) {
      const wDate = lastWorkout.date || 'недавно';
      const wName = lastWorkout.title || lastWorkout.name || 'Тренировка';
      const wTonnage = (lastWorkout.tonnage || 0).toLocaleString();
      const exCount = (lastWorkout.exercises || []).length;
      workoutInfo = `\n\n**Твоя крайняя сессия:** ${wName} (${wDate})\n- Тоннаж: **${wTonnage} кг**\n- Упражнений выполнено: **${exCount}**\n- Суммарный объем за последние тренировки: **${totalVolume.toLocaleString()} кг** (${sessionCount} сессий).`;
    } else {
      workoutInfo = `\n\nВ базе пока нет завершенных сессий. Отличный момент, чтобы зафиксировать первую!`;
    }

    let action = isTough
      ? `\n\nНужен план на сегодня? Жми **GENERATE** в модулях или напиши целевую мышечную группу.`
      : `\n\nНужен план тренировки или разбор формы? Нажми **GENERATE** для построения сессии или задай вопрос по нагрузке.`;

    return greeting + workoutInfo + action;
  }

  // 2. Запрос плана / "План", "Тренировка", "Грудь", "Спина", "Ноги"
  if (/план|тренировк|составь|дай|сделай|жим|присед|тяга|грудь|ноги|спин|руки|плечи/i.test(userMsg)) {
    let focus = 'Push (Грудь / Плечи / Трицепс)';
    if (/спин|тяг|бицепс|pull/i.test(userMsg)) focus = 'Pull (Спина / Бицепс / Задняя дельта)';
    else if (/ног|присед|квадр|бицепс бедра|legs/i.test(userMsg)) focus = 'Legs (Квадрицепс / Бицепс бедра / Икры)';

    return `Принято! Составил для тебя боевой план на сегодня.

**Фокус сессии:** ${focus}
**Целевой протокол (RIR 1-2):**
1. Базовое движение: 4 подхода × 6-8 повторений (отдых 2.5-3 мин)
2. Вторичное компаундное: 3 подхода × 8-10 повторений (отдых 2 мин)
3. Изоляция / памп: 3 подхода × 12-15 повторений (отдых 90 сек)

Рекомендация: переходи в модуль **GENERATE** для добавления упражнений в активную сессию!`;
  }

  // 3. Анализ / Статистика / Форма / Питание / Восстановление
  if (/анализ|стат|прогресс|вес|питани|восстановлен|сон|болит|устал/i.test(userMsg)) {
    return `Анализирую биометрию и параметры восстановления:

- **Суммарный объем:** ${totalVolume.toLocaleString()} кг за ${sessionCount} сессий.
- **Готовность ЦНС:** Оптимально (зеленая зона).
- **Рекомендация по восстановлению:** держи норму белка (1.6–2.0 г/кг) и сон не менее 7.5 часов.

Для полного скрининга нажми кнопку **BIOMETRICS** или **SUMMARY**.`;
  }

  // 4. Универсальный ответ коуча
  return `Понял тебя. 

Текущий тоннаж по истории: **${totalVolume.toLocaleString()} кг** (${sessionCount} сессий).

Рекомендация коуча:
- Для генерации тренировки нажми **GENERATE**.
- Для полного отчета за неделю используй **SUMMARY**.
- Для скрининга готовности ЦНС запусти **BIOMETRICS**.

Какой параметр разберем подробнее?`;
}

const ttsSchema = z.object({
  text: z.string().min(1, 'text is required'),
  voice: z.enum(['Fenrir', 'Charon', 'Aoede', 'Puck']).optional().default('Fenrir'),
  tone: z.enum(['tough', 'analytical', 'motivational', 'friendly']).optional().default('tough'),
  speed: z.number().optional().default(1.0),
  customKey: z.string().optional()
});

/* ── POST /tts (Gemini 2.5 Flash Preview TTS с кастомизацией тембра и интонации) ── */
router.post('/tts', apiLimiter, asyncHandler(async (req, res) => {
  const parseResult = ttsSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { text, voice, tone, customKey } = parseResult.data;

  const { gemini } = await import('../lib/geminiClient.js');
  const apiKey = customKey || gemini.apiKey;
  
  if (!apiKey || apiKey === 'dummy-key') {
    return res.status(500).json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY is not configured.' });
  }

  let styleInstruction = 'Скажи уверенным голосом тренера:';
  if (tone === 'tough') {
    styleInstruction = 'Скажи строго, отрывисто, с командной интонацией сурового главного тренера:';
  } else if (tone === 'analytical') {
    styleInstruction = 'Скажи спокойно, структурированно, с интонацией спортивного ученого и врача:';
  } else if (tone === 'motivational') {
    styleInstruction = 'Скажи вдохновляюще, с нарастающей мощной энергетикой:';
  } else if (tone === 'friendly') {
    styleInstruction = 'Скажи тепло, поддерживающе и с дружеским настроем:';
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${styleInstruction} ${text}` }] }],
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
    return res.status(response.status).json({ error: 'TTS Generation failed' });
  }

  const result = await response.json();
  const pcmData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!pcmData) {
    return res.status(500).json({ error: 'No audio data returned from Gemini' });
  }

  res.json({ success: true, audioBase64: pcmData, voice, tone });
}));

const weeklyReportSchema = z.object({
  workouts: z.array(z.any()).optional().default([]),
  stats: z.any().optional().default({}),
  profile: z.any().optional().default({}),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().optional()
});

/* ── POST /weekly-report ── */
router.post('/weekly-report', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = weeklyReportSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { workouts, stats, profile, engine, customKey } = parseResult.data;

  logInfo(req, 'weekly_report_started', `Generating weekly report`);

  const system = `You are "Athlete Pro Analyst", an elite sports scientist.
Анализируй прошедшие 7 дней тренировок и рассчитанную статистику.
Ответ — ТОЛЬКО валидный JSON строго по схеме (без markdown, без оберток):
{
  "score": <число 0-100, общая оценка производительности и дисциплины>,
  "summary": "<2-3 хлестких мотивирующих предложения на русском>",
  "pros": ["<победа 1>", "<победа 2>"],
  "cons": ["<утечка/ошибка 1>", "<утечка/ошибка 2>"],
  "nextWeekAction": "<конкретный фокус и задание на следующую неделю, 1-2 предложения>"
}
Все текстовые поля строго на русском языке.`;

  const prompt = `Workouts (Last 7 Days): ${JSON.stringify(workouts)}
Calculated Stats: ${JSON.stringify(stats)}
Profile: ${JSON.stringify(profile)}`;

  let content;
  try {
    content = await AIOrchestrator.generateJSON({
      system,
      prompt,
      engine,
      customKey
    }, req);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const report = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!report) throw new Error('Empty weekly report JSON');
    res.json({ success: true, report });
  } catch (err) {
    logWarn(req, 'weekly_report_fallback', err.message);
    const totalTonnage = stats?.weeklyVolume || 0;
    const sessionCount = stats?.sessionCount || workouts.length;
    res.json({
      success: true,
      report: {
        score: Math.min(100, Math.max(50, sessionCount * 25)),
        summary: `За неделю зафиксировано ${sessionCount} сессий с суммарным тоннажем ${totalTonnage.toLocaleString()} кг. Нагрузка находится в рабочем диапазоне.`,
        pros: [
          `Суммарный тоннаж недели: ${totalTonnage.toLocaleString()} кг`,
          `Выполнено сессий: ${sessionCount}`
        ],
        cons: [
          sessionCount < 3 ? "Менее 3 сессий в неделю — рекомендуется увеличить частоту" : "Следите за длительностью отдыха между подходами"
        ],
        nextWeekAction: "Сохранить прогрессивную перегрузку и добавить +2.5% к рабочим весам в ключевых движениях."
      }
    });
  }
}));

const analyzeSessionSchema = z.object({
  currentWorkout: z.any(),
  previousWorkout: z.any().optional().nullable(),
  profile: z.any().optional().default({}),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().optional()
});

/* ── POST /analyze-session ── */
router.post('/analyze-session', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = analyzeSessionSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { currentWorkout, previousWorkout, profile, engine, customKey } = parseResult.data;

  logInfo(req, 'session_analysis_started', `Analyzing workout ${currentWorkout?.id || 'unknown'}`);

  const system = `You are "Athlete Pro Lead Coach".
Проведи глубокий разбор завершенной тренировки в сравнении с предыдущей сессией того же типа.
Ответ — ТОЛЬКО валидный JSON строго по схеме (без markdown):
{
  "tonnage": <число, общий тоннаж кг>,
  "effectiveSets": <число, подходы с RIR<=2 или RPE>=8>,
  "avgRpe": <число, средний RPE, напр 8.2>,
  "fatigueDrop": <число %, падение производительности к концу тренировки>,
  "progressions": [
    { "exercise": "<название>", "weight": <вес кг>, "delta": "<+2.5кг / 0кг / -2.5кг>", "status": "<PR|Progress|Maintain|Drop>" }
  ],
  "summary": "<2 предложения: разбор главного успеха и ошибки>",
  "recommendation": "<конкретная рекомендация к следующей ротации>",
  "targetPlan": [
    { "name": "<название упражнения>", "weight": <рекомендованный вес кг>, "sets": <кол-во>, "reps": <кол-во> }
  ]
}
Все текстовые поля строго на русском языке.`;

  const prompt = `Current Workout: ${JSON.stringify(currentWorkout)}
Previous Workout: ${JSON.stringify(previousWorkout)}
Profile: ${JSON.stringify(profile)}`;

  let content;
  try {
    content = await AIOrchestrator.generateJSON({ system, prompt, engine, customKey }, req);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!analysis) throw new Error('Empty analysis JSON');
    res.json({ success: true, analysis });
  } catch (err) {
    logWarn(req, 'analyze_session_fallback', err.message);
    const fallbackTonnage = currentWorkout?.tonnage || 0;
    res.json({
      success: true,
      analysis: {
        tonnage: fallbackTonnage,
        effectiveSets: (currentWorkout?.exercises || []).reduce((acc, e) => acc + (e.sets?.length || 0), 0),
        avgRpe: 8.0,
        fatigueDrop: 5.0,
        progressions: (currentWorkout?.exercises || []).map(e => ({
          exercise: e.name,
          weight: e.sets?.[0]?.weight || 0,
          delta: "0кг",
          status: "Maintain"
        })),
        summary: "Тренировка зафиксирована. Нагрузка удержана в рабочем диапазоне.",
        recommendation: "Сохранить текущие рабочие веса на следующую ротацию.",
        targetPlan: (currentWorkout?.exercises || []).map(e => ({
          name: e.name,
          weight: e.sets?.[0]?.weight || 0,
          sets: e.sets?.length || 3,
          reps: e.sets?.[0]?.reps || 8
        }))
      }
    });
  }
}));

const biometricsScanSchema = z.object({
  workouts: z.array(z.any()).optional().default([]),
  profile: z.any().optional().default({}),
  engine: z.string().optional().default('anthropic'),
  customKey: z.string().optional()
});

/* ── POST /biometrics-scan ──
 * Отчёт для радара HUD-3: cnsFatigue / muscleDamage / summary из истории и профиля.
 * Fallback вместо 500: сеть/ключ мертвы → нули + пометка, чтобы UI не показывал пустой оверлей. */
router.post('/biometrics-scan', coachLimiter, asyncHandler(async (req, res) => {
  const parseResult = biometricsScanSchema.safeParse(req.body);
  if (!parseResult.success) return res.status(400).json({ error: 'Invalid input schema', details: parseResult.error.issues });

  const { workouts, profile, engine, customKey } = parseResult.data;

  const system = `You are "Athlete Pro Medical AI", an elite sports scientist.
Оцени биометрическое состояние атлета по последней истории (10 тренировок) и профилю.
Ответ — ТОЛЬКО JSON строго по схеме, без markdown:
{
  "cnsFatigue": <0-100, усталость ЦНС>,
  "muscleDamage": <0-100, структурное повреждение мышц>,
  "acwr": <число с точкой, напр 1.15, соотношение острой/хронической нагрузки>,
  "injuryRisk": "<Low|Medium|High>",
  "prescription": "<рецепт интенсивности на сегодня: RPE Cap, совет по весам>",
  "summary": "<2 предложения по-русски, глубокий разбор состояния>"
}
Все текстовые поля строго на русском языке.`;

  const prompt = `Workouts (last 10): ${JSON.stringify(workouts)}
Profile: ${JSON.stringify(profile)}`;

  let content;
  try {
    content = await AIOrchestrator.generateJSON({ system, prompt, engine, customKey }, req);
  } catch (err) {
    logWarn(req, 'biometrics_scan_fallback', err.message, { code: err.code });
    return res.json({
      success: true,
      report: { cnsFatigue: 0, muscleDamage: 0, acwr: 1.0, injuryRisk: 'Low', prescription: 'Тренировка по плану', summary: 'Биометрия стабильна.' },
      warning: 'AI biometrics unavailable'
    });
  }

  const report = _parseBiometricsReport(content);
  res.json({ success: true, report });
}));

function _parseBiometricsReport(content) {
  const fallback = { cnsFatigue: 0, muscleDamage: 0, acwr: 1.0, injuryRisk: 'Low', prescription: 'Тренировка по плану', summary: '' };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    const raw = JSON.parse(jsonMatch[0]);
    const clamp = (n) => Math.max(0, Math.min(100, Number.isFinite(+n) ? Math.round(+n) : 0));
    const risk = ['Low', 'Medium', 'High'].includes(raw.injuryRisk) ? raw.injuryRisk : 'Low';
    return {
      cnsFatigue: clamp(raw.cnsFatigue),
      muscleDamage: clamp(raw.muscleDamage),
      acwr: Number(raw.acwr) || 1.0,
      injuryRisk: risk,
      prescription: typeof raw.prescription === 'string' ? raw.prescription.slice(0, 300) : 'Тренировка по плану',
      summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 500) : ''
    };
  } catch {
    return fallback;
  }
}

// ── Private Prompt Helpers ───────────────────────────────────────────────────

function _toneInstruction(tone) {
  // Слайдер настроек HUD-3: 0 = Психолог, 50 = Нейтрально, 100 = Гоггинс.
  if (tone < 30) return 'Тон: эмпатичный, поддерживающий, восстановительный. Как заботливый физиотерапевт — упор на восстановление и позитивное подкрепление.';
  if (tone > 70) return 'Тон: жёсткий, бескомпромиссный, в духе Дэвида Гоггинса. Ноль оправданий, абсолютная дисциплина, суровая правда.';
  return 'Тон: нейтральный, профессиональный, сбалансированный — как опытный тренер.';
}

function _buildSystemPrompt(workouts, fatigue, topLifts, profile, longTermStats, tone) {
  return `You are "Athlete Pro Coach", an elite AI strength & conditioning expert.

[PERSONA / TONE]
${_toneInstruction(tone)}

[CONTEXT]
- History (last 5): ${JSON.stringify(workouts.slice(0, 5))}
- Current Fatigue: ${JSON.stringify(fatigue)}
- 1RMs: ${JSON.stringify(topLifts)}
- User Profile: ${JSON.stringify(profile)}
- Current Goal: ${profile.goal || 'General Health'}

[CRITICAL RULES]
1. ZERO FLUFF: Be concise. Give exact numbers.
2. SLEEP: Assume the user sleeps 7 hours on average. You may ask if needed.
3. GREETINGS: If the user simply says "hi" or "привет", respond exactly with: "Привет, нужен план?".
4. LANGUAGE: YOU MUST SPEAK RUSSIAN ALWAYS. All JSON string values (like 'goal') and all textual advice MUST be in Russian.
5. MACRO #gym: If the user types EXACTLY or contains "#gym", you MUST output a raw JSON widget block ANYWHERE in your response, followed by a short textual advice.
JSON FORMAT MUST BE EXACTLY:
{"_widget": "readiness", "index": 82, "recovery": 77, "acwr": 88, "sleep": 64, "monotony": 95, "density": 93, "cns": 48, "goal": "Лёгкая / техническая"}
(Calculate these values from 0-100 based on fatigue, history, and rest days. Goal must be a short string in Russian).

[WORKFLOW]
Before answering, use <thinking> tags to calculate the metrics. If #gym is requested, output the JSON block, then output your surgical advice.`;
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
