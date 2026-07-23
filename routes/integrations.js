'use strict';
import express from 'express';
import { logInfo } from '../lib/logger.js';
const router = express.Router();

/* ── GET /supabase-status — proxy health check (avoids browser CORS) ── */
router.get('/supabase-status', async (req, res) => {
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

/* ── GET /firebase-config — expose Firebase config to the browser ── */
router.get('/firebase-config', (req, res) => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || projectId.includes('your-firebase')) {
    return res.json({ configured: false });
  }

  // Firebase client config is inherently public (shipped in every browser bundle);
  // real access control lives in Firebase Security Rules, not in hiding this response.
  res.json({
    configured: true,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId,
    appId: process.env.FIREBASE_APP_ID,
    env: process.env.NODE_ENV || 'production'
  });
});

/* ── GET /ai-status — check for server-side API keys ── */
router.get('/ai-status', (req, res) => {
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const hasGemini = !!geminiKey && !geminiKey.includes('your-') && geminiKey.length > 10;
  const hasAnthropic = !!anthropicKey && !anthropicKey.includes('your-') && anthropicKey.length > 10;

  logInfo(req, 'ai-status', 'API key availability checked', { gemini: hasGemini, anthropic: hasAnthropic });

  res.json({
    gemini: hasGemini,
    anthropic: hasAnthropic
  });
});

export default router;
