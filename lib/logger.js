// lib/logger.js
import nodeCrypto from 'node:crypto';

const MAX_REQ_ID_LEN = 128;
const SENSITIVE_KEYS = new Set(['weight', 'height', 'bmi', 'password', 'token', 'authorization', 'cookie']);

export function correlationMiddleware(req, res, next) {
  const fromClient = req.get('x-request-id');
  const id = fromClient && String(fromClient).trim().slice(0, MAX_REQ_ID_LEN) || nodeCrypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

function piiReplacer(key, value) {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return '[REDACTED]';
  }
  return value;
}

function _base(req, level, event, message, meta) {
  const line = {
    level,
    ts: new Date().toISOString(),
    correlationId: req?.correlationId || null,
    event,
    message,
    ...(meta || {})
  };
  
  // V8 C++ accelerated serialization. No JS deep copies.
  const serialized = JSON.stringify(line, piiReplacer);
  
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export function logInfo(req, event, message, meta) { _base(req, 'info', event, message, meta); }
export function logWarn(req, event, message, meta) { _base(req, 'warn', event, message, meta); }
export function logError(req, event, message, meta) { _base(req, 'error', event, message, meta); }
