'use strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
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

/* ── POST /verify-key — живая проверка BYOK-ключа ────────────────────────────
   Формат ключа («начинается на sk-ant-») не отвечает на вопрос «коннект есть?»:
   отозванный, просроченный и опечатанный в середине ключ выглядят валидно и
   молча падают 401 на первом же запросе коуча — уже внутри диалога.

   Проверка идёт через прокси, а не из браузера: правило «ключи только через
   backend» + прямой вызов Anthropic из фронта требует
   anthropic-dangerous-direct-browser-access и палит ключ в CORS-преflight.
   Берём самые дешёвые ручки провайдеров (список моделей) — ноль токенов.

   Ключ не логируется и не хранится: приходит в теле, уходит в провайдера,
   умирает вместе с запросом. Наружу — только вердикт. */
const verifyKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ ok: false, reason: 'rate_limited', requestId: req.correlationId }),
});

const verifyKeySchema = z.object({
  engine: z.enum(['anthropic', 'gemini']),
  key: z.string().min(8).max(400),
});

const VERIFY_TIMEOUT_MS = 8000;

/**
 * Классификация ответа провайдера. Вынесена из хендлера и покрыта тестом,
 * потому что HTTP-код сам по себе на вопрос «ключ плохой?» не отвечает:
 * Anthropic на мёртвый ключ даёт 401, а Google — 400 INVALID_ARGUMENT с
 * `reason: API_KEY_INVALID` в теле. Мапить по коду = показывать «нет связи»
 * там, где связь есть, а ключ не принят (ровно этот баг ловили на Gemini).
 * Отдельный случай — 403 SERVICE_DISABLED: ключ живой, но Generative Language
 * API не включён в проекте, и чинится это не заменой ключа.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function classifyKeyCheck(status, body) {
  // 429 — ключ принят, но упёрся в лимит. Это коннект, ограничение временное.
  if (status === 429) return { ok: true, reason: 'rate_limited' };
  if (status >= 200 && status < 300) return { ok: true };

  const err = (body && body.error) || {};
  const details = Array.isArray(err.details) ? err.details : [];
  const reason = String(
    details.find((d) => d && d.reason)?.reason || err.status || err.type || ''
  ).toUpperCase();
  const message = String(err.message || '');

  if (reason.includes('SERVICE_DISABLED') || /has not been used in project|is disabled/i.test(message)) {
    return { ok: false, reason: 'api_disabled' };
  }
  if (
    status === 401 || status === 403 ||
    reason.includes('API_KEY_INVALID') || reason.includes('PERMISSION_DENIED') ||
    reason.includes('AUTHENTICATION_ERROR') ||
    /api key not valid|invalid x-api-key/i.test(message)
  ) {
    return { ok: false, reason: 'invalid_key' };
  }
  return { ok: false, reason: 'upstream_error' };
}

router.post('/verify-key', verifyKeyLimiter, async (req, res) => {
  const parsed = verifyKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, reason: 'bad_request' });

  const { engine, key } = parsed.data;
  const trimmed = key.trim();

  const url = engine === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'
    : 'https://api.anthropic.com/v1/models?limit=1';
  const headers = engine === 'gemini'
    ? { 'x-goog-api-key': trimmed }
    : { 'x-api-key': trimmed, 'anthropic-version': '2023-06-01' };

  const start = Date.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    const latencyMs = Date.now() - start;

    if (r.ok) {
      logInfo(req, 'verify_key', 'BYOK key verified', { engine, ok: true, latencyMs });
      return res.json({ ok: true, engine, latencyMs });
    }

    // Тело читаем всегда: вердикт живёт в нём, а не только в HTTP-коде.
    const body = await r.json().catch(() => null);
    const verdict = classifyKeyCheck(r.status, body);

    logInfo(req, 'verify_key', verdict.ok ? 'BYOK key accepted with limit' : 'BYOK key rejected',
      { engine, status: r.status, reason: verdict.reason, latencyMs });
    return res.json({ ...verdict, engine, status: r.status, latencyMs });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timeout' : 'network';
    logInfo(req, 'verify_key', 'BYOK key check failed', { engine, reason });
    return res.json({ ok: false, engine, reason, latencyMs: Date.now() - start });
  }
});

export default router;
