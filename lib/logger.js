'use strict';
const nodeCrypto = require('crypto');

const MAX_REQ_ID_LEN = 128;

/**
 * Attach a correlation id to every request (client may send X-Request-ID).
 * Always echo it back as X-Request-ID.
 */
function correlationMiddleware(req, res, next) {
  const fromClient = req.get('x-request-id');
  const id =
    fromClient && String(fromClient).trim().slice(0, MAX_REQ_ID_LEN) || nodeCrypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

function _base(req, level, event, message, meta) {
  const line = {
    level,
    ts: new Date().toISOString(),
    correlationId: req?.correlationId || null,
    event,
    message,
    ...meta,
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

function logInfo(req, event, message, meta) {
  _base(req, 'info', event, message, meta || {});
}

function logWarn(req, event, message, meta) {
  _base(req, 'warn', event, message, meta || {});
}

function logError(req, event, message, meta) {
  _base(req, 'error', event, message, meta || {});
}

module.exports = {
  correlationMiddleware,
  logInfo,
  logWarn,
  logError,
};
