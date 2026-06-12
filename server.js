'use strict';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { correlationMiddleware, logWarn } from './lib/logger.js';

import coachRouter from './routes/coach.js';
import integrationsRouter from './routes/integrations.js';
import { errorMiddleware } from './lib/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-hashes'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"], // Required for onclick handlers in templates
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      connectSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://api.anthropic.com",
        "https://*.supabase.co",
        "https://*.firebaseio.com",
        "https://*.googleapis.com",
        "https://generativelanguage.googleapis.com",
        "https://fonts.gstatic.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      workerSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── gzip/brotli compression for all text responses
app.use(compression());

// Handle favicon.ico explicitly
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'icons', 'icon-192.png')));

// ── Global API Rate Limiter
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' })
});

// ── Strict CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://127.0.0.1:3000'];
app.use(cors({
  origin: function(origin, callback) {
    // Same-origin module scripts DO send an Origin header — throwing here
    // turns every asset into a 500 on any non-whitelisted host/port
    // (LAN phone testing, alt ports). callback(null, false) simply omits
    // CORS headers: same-origin keeps working, foreign origins are blocked
    // by the browser itself.
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  credentials: true
}));

app.use(correlationMiddleware);
app.use(express.json({ limit: '100kb' }));
app.use('/api/', globalApiLimiter);

// ── API Routes (Prioritized)
app.use('/api/coach', coachRouter);
app.use('/api', integrationsRouter);

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
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── Global Error Handling
app.use(errorMiddleware);

export function startServer(port = process.env.PORT || 3000) {
  // Localhost by default; expose to LAN only on explicit request
  // (phone field testing: npm run dev:lan or HOST=0.0.0.0)
  const host = process.env.HOST || (process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1');
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      const p = server.address().port;
      if (port !== 0) console.log(`\n  Athlete Pro  →  http://localhost:${p}\n`);
      if (host === '0.0.0.0') {
        import('node:os').then((os) => {
          for (const ifaces of Object.values(os.networkInterfaces())) {
            for (const iface of ifaces || []) {
              if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`  LAN (phone)  →  http://${iface.address}:${p}\n`);
              }
            }
          }
        });
      }
      resolve(server);
    });
  });
}

// Node.js ESM equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export default app;
