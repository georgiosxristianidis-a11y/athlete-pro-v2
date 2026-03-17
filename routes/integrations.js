'use strict';
const express = require('express');
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
  res.json({
    configured: true,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId,
    appId: process.env.FIREBASE_APP_ID,
  });
});

module.exports = router;
