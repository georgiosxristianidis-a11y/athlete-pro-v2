'use strict';
import { logError } from './logger.js';

/**
 * Global error handler middleware.
 * Ensures consistent JSON responses for all server errors.
 */
export function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  logError(req, 'server_error', message, {
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(status).json({
    error: message,
    requestId: req.correlationId,
    code: err.code || 'INTERNAL_ERROR'
  });
}

/**
 * Helper to wrap async route handlers and catch errors.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
