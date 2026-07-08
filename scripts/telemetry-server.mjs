/* ════════════════════════════════════════════════════════
   telemetry-server.mjs — Mobile Field Testing helper
   Standalone static server + phone log collector.
   Usage:
     node scripts/telemetry-server.mjs          # localhost only
     node scripts/telemetry-server.mjs --lan    # expose to local network
   Never replaces server.js — debug tool only.
   ════════════════════════════════════════════════════════ */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
// Fixed port for stable phone URLs (e.g. http://<host>.local:3000). Falls back
// to an OS-assigned ephemeral port when PORT is unset.
const PORT = Number(process.env.PORT) || 0;
const LOG_FILE = path.join(ROOT, 'telemetry.log');
const MAX_BODY = 64 * 1024;

/* Build identity of the tree this server actually serves. Field checks failed
   silently before: the LAN server kept serving an old worktree while a fix
   landed on another branch with the same VERSION string — the phone had no way
   to tell. Refreshed with a short TTL so a rebase/checkout under a
   long-running server shows up within seconds — but асинхронно: `git status`
   takes seconds on Windows worktrees and execSync per request would freeze the
   whole event loop (observed: /__build hung >10s and starved static files). */
const BUILD_TTL = 10_000;
let _build = null;
let _buildAt = 0;
let _refreshing = false;

function _git(args, cb) {
  execFile('git', args, { cwd: ROOT, encoding: 'utf8' }, (err, out) => cb(err ? null : String(out).trim()));
}

function refreshBuildInfo() {
  if (_refreshing) return;
  _refreshing = true;
  _git(['rev-parse', '--abbrev-ref', 'HEAD'], (branch) => {
    _git(['rev-parse', '--short', 'HEAD'], (hash) => {
      _git(['status', '--porcelain', '-uno'], (st) => {
        _build = {
          branch: branch || 'unknown',
          hash: hash || 'unknown',
          dirty: st !== null && st !== '',
          root: ROOT,
        };
        _buildAt = Date.now();
        _refreshing = false;
      });
    });
  });
}

/* Serves the last known value immediately; a stale one kicks off a background
   refresh (stale-while-revalidate). Startup seeds it synchronously so the
   banner and first request are already correct. */
function buildInfo() {
  if (!_build || Date.now() - _buildAt > BUILD_TTL) refreshBuildInfo();
  return _build || { branch: 'unknown', hash: 'pending', dirty: false, root: ROOT };
}

try {
  const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  _build = {
    branch: run('git rev-parse --abbrev-ref HEAD'),
    hash: run('git rev-parse --short HEAD'),
    dirty: run('git status --porcelain -uno') !== '',
    root: ROOT,
  };
  _buildAt = Date.now();
} catch { /* non-git checkout — endpoint reports unknown */ }

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', LAN ? '*' : 'http://localhost');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Field stand must never serve stale bytes: without validators the browser
  // heuristically caches JS/CSS and a «fixed» build keeps running old code on
  // the phone — the exact failure mode this server exists to prevent.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/telemetry' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const level = String(data.level).slice(0, 16).replace(/[^\w-]/g, '');
        const message = String(data.message).slice(0, 2000).replace(/[\r\n]/g, ' ');
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [${level}] ${message}\n`);
        console.log(`[PHONE] ${level}: ${message}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  if (req.url === '/__build') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildInfo()));
    return;
  }

  if (req.url === '/api/ai-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ gemini: false, anthropic: false }));
    return;
  }

  // Static files — resolved path must stay inside project root
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.resolve(ROOT, '.' + (urlPath === '/' ? '/index.html' : urlPath));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  const b = buildInfo();
  console.log('\n==============================================');
  console.log('Athlete Pro Telemetry Server (field testing)');
  console.log(`   Build:   ${b.branch}@${b.hash}${b.dirty ? ' (dirty)' : ''}`);
  console.log(`   Root:    ${b.root}`);
  console.log(`   Local:   http://localhost:${port}`);
  if (LAN) {
    import('os').then((os) => {
      const interfaces = os.networkInterfaces();
      let localIp = '127.0.0.1';
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) localIp = iface.address;
        }
      }
      console.log(`   Network: http://${localIp}:${port}`);
      console.log('   Logs:    telemetry.log');
      console.log('==============================================\n');
    });
  } else {
    console.log('   (localhost only — pass --lan for phone testing)');
    console.log('==============================================\n');
  }
});
