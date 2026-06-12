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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const LOG_FILE = path.join(ROOT, 'telemetry.log');
const MAX_BODY = 64 * 1024;

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

server.listen(0, HOST, () => {
  const { port } = server.address();
  console.log('\n==============================================');
  console.log('Athlete Pro Telemetry Server (field testing)');
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
