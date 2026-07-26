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

// Trust the first proxy hop (Vercel/Nginx) so express-rate-limit keys on the
// real client IP from X-Forwarded-For, not the shared balancer IP.
app.set('trust proxy', 1);

// ── Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'none'"], // CSP Phase 2: all inline on* migrated to event-delegation (js/events.js)
      styleSrc: ["'self'", "'unsafe-inline'"], // fonts self-hosted in /fonts — no Google origins
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      connectSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://api.anthropic.com",
        "https://*.supabase.co",
        "https://*.firebaseio.com",
        "https://*.googleapis.com",
        "https://generativelanguage.googleapis.com"
      ],
      fontSrc: ["'self'"],
      workerSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      // Required for http:// LAN access from the phone: helmet's default
      // upgrade-insecure-requests forces https on subresources and breaks
      // every asset load on http://192.168.x.x:3001.
      upgradeInsecureRequests: null,
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
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3000', 'http://127.0.0.1:3000'];
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

// Media keeps a real cache policy. The blanket `etag:false` below targets
// CODE, where a byte-size-identical edit is routine ('1.24.1' → '1.25.4') and
// makes the mtime+size ETag lie. Binaries don't change size in place, so their
// ETag stays honest — keep it, paired with a short max-age. Without this mount
// media falls through to the default `public, max-age=0` with no validator,
// i.e. panda-voice.mp4 (327 KB) is re-downloaded in full on every HTTP-cache
// miss instead of answering 304. Staleness is bounded by max-age; the SW busts
// its own copy via CACHE_NAME.
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  etag: true,
  lastModified: false,
  maxAge: '1h',
}));

app.use(express.static(__dirname, {
  // Vercel normalizes bundled-file mtimes to a constant (Oct 2018), so
  // Last-Modified lies and the mtime+size weak ETag COLLIDES across releases
  // for any file whose byte size didn't change (version.js is always 35 B:
  // '1.24.1' → '1.25.4'). A returning client revalidates → 304 → runs stale
  // code forever (field case: phone stuck on 1.24.1 while prod served 1.25.4).
  // No validators + no-cache ⇒ the browser must fetch the full fresh body.
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.endsWith('.woff2')) {
      // Self-hosted fonts never change in place (renamed if replaced)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// SPA deep-link fallback: any non-API GET that didn't match a static file
// returns index.html so direct URLs / client-side nav resolve. Sits after
// express.static (real files win) and before the error middleware. On Vercel
// every request is routed to this function, so this also serves the app shell.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  // Same anti-stale rules as the static route: the app shell must never be
  // cached (no-store) and must not carry Vercel's lying mtime validator.
  res.sendFile(path.join(__dirname, 'index.html'), {
    etag: false,
    lastModified: false,
    headers: { 'Cache-Control': 'no-store' },
  });
});

// ── Global Error Handling
app.use(errorMiddleware);

/**
 * Port resolution (keeps your phone testing and Claude's preview on separate
 * ports so they never collide):
 *   PORT env  →  `--port=N` / `--port N` CLI arg  →  3000 (default).
 * Your `npm run dev` / `npm run dev:lan` → 3000 (phone). Claude's preview
 * launches with `--port=3001`.
 */
function resolvePort() {
  if (process.env.PORT) return Number(process.env.PORT);
  const i = process.argv.findIndex(a => a === '--port' || a.startsWith('--port='));
  if (i !== -1) {
    const v = process.argv[i].includes('=') ? process.argv[i].split('=')[1] : process.argv[i + 1];
    if (v && !Number.isNaN(Number(v))) return Number(v);
  }
  return 3000;
}

export function startServer(port = resolvePort()) {
  // LAN by default — phone field testing is the daily workflow
  // (http://192.168.x.x:3000). Set HOST=127.0.0.1 to restrict to localhost.
  const host = process.env.HOST || '0.0.0.0';
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
