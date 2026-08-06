/**
 * CSP has exactly one source of truth (helmet in server.js).
 *
 * The hole this closes: index.html carried a second, hand-written copy of the
 * policy in a <meta http-equiv>. Nothing in test/ mentioned CSP at all, so the
 * copy was free to rot — and it did. Phase 2 removed 'unsafe-inline' and set
 * script-src-attr to 'none' on the server; the meta kept both. Later work added
 * blob: to img-src/media-src on the server; the meta never heard about it.
 *
 * Why that is worse than a cosmetic duplicate: a browser given two policies
 * enforces BOTH, so the effective policy is their intersection — the narrower
 * copy always wins. The stale meta was therefore the live policy wherever it
 * was stricter, and it silently blocked `new Audio(blob:)` in the voice
 * synthesis path (js/intel.view.js). The failure was invisible: the call sits
 * inside a try/catch that logs 'Voice synthesis failed' and moves on.
 *
 * Reproduced in the browser before the fix — securitypolicyviolation fired with
 * effectiveDirective 'media-src', blockedURI 'blob', and an originalPolicy
 * carrying the meta's 'unsafe-inline' (absent from the server's).
 *
 * The header assertions read the real response from the real app rather than
 * re-parsing server.js: a second copy of the rules is exactly what went wrong
 * here, and it would drift the same way.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

describe('CSP: единственный источник — helmet, не мета', () => {
  test('index.html не несёт <meta http-equiv="Content-Security-Policy">', () => {
    const meta = /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?/i.test(INDEX_HTML);
    assert.equal(
      meta,
      false,
      'В index.html вернулась мета-CSP. Браузер применяет пересечение политик — ' +
        'вторая копия может только сузить действующую и однажды это уже молча ' +
        'сломало blob:-аудио. Политика живёт в helmet (server.js).',
    );
  });
});

describe('CSP: заголовок сервера отдаёт то, чем приложение реально пользуется', () => {
  let server, baseUrl;

  before(async () => {
    server = await startServer(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  /** Директивы CSP из заголовка: 'media-src' → ["'self'", 'blob:']. */
  async function directives() {
    const res = await fetch(`${baseUrl}/`);
    const header = res.headers.get('content-security-policy');
    assert.ok(header, 'сервер не отдал Content-Security-Policy — политики нет вообще');
    const map = new Map();
    for (const part of header.split(';')) {
      const [name, ...values] = part.trim().split(/\s+/);
      if (name) map.set(name.toLowerCase(), values);
    }
    return map;
  }

  test("media-src разрешает blob: — на нём висит голосовой синтез", async () => {
    const d = await directives();
    assert.ok(
      d.get('media-src')?.includes('blob:'),
      'js/intel.view.js отдаёт WAV в new Audio(URL.createObjectURL(...)) — без blob: он не заиграет',
    );
  });

  test('img-src разрешает blob:', async () => {
    const d = await directives();
    assert.ok(d.get('img-src')?.includes('blob:'), 'blob:-картинки заблокированы');
  });

  test("script-src-attr остаётся 'none' — завоевание Phase 2", async () => {
    const d = await directives();
    assert.deepEqual(
      d.get('script-src-attr'),
      ["'none'"],
      "инлайновые on*-атрибуты снова разрешены; они мигрировали в делегирование (js/events.js)",
    );
  });

  test("script-src не содержит 'unsafe-inline' — завоевание Phase 2", async () => {
    const d = await directives();
    assert.ok(
      !d.get('script-src')?.includes("'unsafe-inline'"),
      "'unsafe-inline' вернулся в script-src",
    );
  });
});
