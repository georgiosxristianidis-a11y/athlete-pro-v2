'use strict';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { correlationMiddleware, logWarn } from './lib/logger.js';

import coachRouter from './routes/coach.js';
import integrationsRouter from './routes/integrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline may be needed for some vanilla patterns, revisit with nonces
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://*.supabase.co"],
      connectSrc: [
        "'self'",
        "https://api.anthropic.com",
        "https://*.supabase.co",
        "https://*.firebaseio.com",
        "https://*.googleapis.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

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

app.use(express.static(__dirname, {
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

app.use('/api', coachRouter);
app.use('/api', integrationsRouter);

export function startServer(port = process.env.PORT || 3000) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      if (port !== 0) console.log(`\n  Athlete Pro  →  http://localhost:${server.address().port}\n`);
      resolve(server);
    });
  });
}

// Node.js ESM equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export default app;
