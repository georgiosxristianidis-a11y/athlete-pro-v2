/**
 * Guard for the anti-stale cache policy in server.js (card O-1).
 *
 * The 304-freeze bug shipped twice (1.24.1, 1.25.4): a mtime+size ETag on code
 * collides across releases when the byte size doesn't change ('1.24.1' →
 * '1.25.4' is 35 B either way), so a returning client revalidates, gets 304 and
 * runs stale code forever. These tests pin the policy, not the implementation:
 *   - code (.js/.css)  → no validators at all + no-cache
 *   - app shell (html) → no validators + no-store (incl. SPA fallback)
 *   - fonts (.woff2)   → immutable long max-age (renamed, never edited in place)
 *   - media (/assets)  → honest ETag + max-age, conditional request gives 304
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startServer } from '../server.js';

/**
 * Raw http.request instead of fetch on purpose: undici drops author-supplied
 * conditional headers, so `fetch` can never observe a 304 here.
 */
function request(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Boots the app on an ephemeral port, runs `fn(get)`, always closes. */
async function withServer(fn) {
  const server = await startServer(0);
  const { port } = server.address();
  const get = (p, headers) => request(port, p, headers);
  try {
    return await fn(get);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertNoValidators(res, label) {
  assert.equal(res.headers.etag, undefined, `${label}: ETag must be absent`);
  assert.equal(
    res.headers['last-modified'],
    undefined,
    `${label}: Last-Modified must be absent`
  );
}

test('cache: code (.js/.css) is served without validators and no-cache', async () => {
  await withServer(async (get) => {
    for (const p of ['/js/version.js', '/css/base.css']) {
      const res = await get(p);
      assert.equal(res.status, 200, `${p}: expected 200`);
      assertNoValidators(res, p);
      assert.match(
        res.headers['cache-control'] ?? '',
        /no-cache/,
        `${p}: Cache-Control must contain no-cache`
      );
    }
  });
});

test('cache: conditional request for code never answers 304', async () => {
  await withServer(async (get) => {
    // Replay whatever validators the server handed out — that is exactly what a
    // returning browser does, and the step where the field bug bit: version.js
    // is byte-identical in size across releases, so the mtime+size ETag matched
    // and the phone got 304 + stale code. Fabricated fallbacks keep the request
    // conditional even when (correctly) no validator came back.
    const first = await get('/js/version.js');
    const conditional = {
      'If-None-Match': first.headers.etag ?? 'W/"23-18f0a1b2c3d"',
      'If-Modified-Since':
        first.headers['last-modified'] ?? 'Tue, 09 Oct 2018 00:00:00 GMT',
    };
    const res = await get('/js/version.js', conditional);
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0, 'body must not be empty');
  });
});

test('cache: app shell is no-store without validators', async () => {
  await withServer(async (get) => {
    for (const p of ['/', '/index.html']) {
      const res = await get(p);
      assert.equal(res.status, 200, `${p}: expected 200`);
      assertNoValidators(res, p);
      assert.match(
        res.headers['cache-control'] ?? '',
        /no-store/,
        `${p}: Cache-Control must contain no-store`
      );
    }
  });
});

test('cache: SPA deep-link fallback carries the same shell rules', async () => {
  await withServer(async (get) => {
    const res = await get('/some/deep/link');
    assert.equal(res.status, 200);
    assertNoValidators(res, '/some/deep/link');
    assert.match(res.headers['cache-control'] ?? '', /no-store/);

    // On Vercel every page load enters through this route, so replay the
    // conditional request here too — a 304 on the fallback is the freeze bug.
    const conditional = {
      'If-None-Match': res.headers.etag ?? 'W/"23-18f0a1b2c3d"',
      'If-Modified-Since':
        res.headers['last-modified'] ?? 'Tue, 09 Oct 2018 00:00:00 GMT',
    };
    const replay = await get('/some/deep/link', conditional);
    assert.equal(replay.status, 200, 'fallback must never answer 304');
    assert.ok(replay.body.length > 0, 'body must not be empty');
  });
});

test('cache: fonts are immutable long-lived', async () => {
  await withServer(async (get) => {
    const res = await get('/fonts/manrope-latin.woff2');
    assert.equal(res.status, 200);
    const cc = res.headers['cache-control'] ?? '';
    assert.match(cc, /immutable/);
    assert.match(cc, /max-age=\d{7,}/, 'fonts need a long max-age');
  });
});

test('cache: /assets keeps a validator + max-age and answers 304', async () => {
  await withServer(async (get) => {
    const res = await get('/assets/panda-poster.jpg');
    assert.equal(res.status, 200);

    const etag = res.headers.etag;
    assert.ok(etag, '/assets must keep an ETag (avoids re-downloading media)');
    assert.match(
      res.headers['cache-control'] ?? '',
      /max-age=[1-9]\d*/,
      '/assets needs a non-zero max-age'
    );

    const revalidated = await get('/assets/panda-poster.jpg', {
      'If-None-Match': etag,
    });
    assert.equal(revalidated.status, 304, 'conditional /assets must give 304');
  });
});
