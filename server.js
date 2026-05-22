'use strict';
require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const compression = require('compression');
const path       = require('path');
const { correlationMiddleware, logWarn } = require('./lib/logger');

const app = express();

// ── Security headers (helmet defaults: X-Frame-Options, X-Content-Type-Options, etc.)
// CSP and COEP disabled — PWA service worker requires relaxed policy; revisit with nonces
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ── gzip/brotli compression for all text responses
app.use(compression());

app.use(correlationMiddleware);
app.use(express.json({ limit: '100kb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logWarn(req, 'json_parse_error', 'Invalid JSON body', { type: err.type });
    return res.status(400).json({
      error: 'Invalid JSON body',
      requestId: req.correlationId,
    });
  }
  next(err);
});
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML entry: always revalidate — never serve a stale app shell
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      // JS/CSS: allow conditional GET (304 Not Modified) on repeat visits
      // SW precache handles offline; this cuts re-download cost when SW revalidates
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.use('/api', require('./routes/coach'));
app.use('/api', require('./routes/integrations'));

function startServer(port = process.env.PORT || 3000) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      if (port !== 0) console.log(`\n  Athlete Pro  →  http://localhost:${server.address().port}\n`);
      resolve(server);
    });
  });
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}
