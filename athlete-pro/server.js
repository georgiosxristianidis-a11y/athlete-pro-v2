/* ════════════════════════════════════════════════════════
   server.js — Athlete Pro backend
   Serves static files + proxies Claude API calls via SSE
   ════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ── GET /api/supabase-status — proxy health check (avoids browser CORS) ── */
app.get('/api/supabase-status', async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url.includes('your-project')) {
    return res.json({ available: false, reason: 'not_configured' });
  }

  const start = Date.now();
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    res.json({
      available: true,
      status: r.status,
      latencyMs: Date.now() - start,
      url: url.replace(/^https?:\/\//, '').split('.')[0] + '.supabase.co',
    });
  } catch (err) {
    res.json({
      available: false,
      reason: err.name === 'TimeoutError' ? 'timeout' : err.message,
      latencyMs: Date.now() - start,
    });
  }
});

/* ── GET /api/firebase-config — expose Firebase config to the browser ── */
app.get('/api/firebase-config', (req, res) => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || projectId.includes('your-firebase')) {
    return res.json({ configured: false });
  }
  res.json({
    configured: true,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId,
    appId: process.env.FIREBASE_APP_ID,
  });
});

/* ── POST /api/coach — stream a coaching response ── */
app.post('/api/coach', async (req, res) => {
  const { workouts = [], fatigue = {}, topLifts = [], messages = [] } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });
  }

  if (!messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const system = _buildSystemPrompt(workouts, fatigue, topLifts);

    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 400,
      system,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();

    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('[/api/coach]', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }

  res.end();
});

/* ── Build system prompt with athlete context ── */
function _buildSystemPrompt(workouts, fatigue, topLifts) {
  const lines = [
    'You are an expert PPL (Push/Pull/Legs) strength and conditioning coach.',
    'Give direct, data-driven advice. Keep responses to 2–4 sentences. Be specific and actionable.',
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

function startServer(port = process.env.PORT || 3000) {
  return app.listen(port, () => {
    console.log(`\n  Athlete Pro  →  http://localhost:${port}\n`);
  });
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}
