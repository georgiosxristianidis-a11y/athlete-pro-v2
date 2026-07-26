/**
 * Guard for the service-worker precache budget (card F-7).
 *
 * Measured on prod 1.25.11: install pulled 4.15 MB / 119 entries, of which
 * 3.11 MB was panda video — fetched in the background over the gym's LTE
 * before the mascot had ever been rendered (it lives behind the 'fab-video'
 * flag, off by default). ~6 s on 6 Mbps, ~22 s on a congested cell, and
 * invisible to FCP/LCP/TBT because it happens after `load`.
 *
 * The fix (media → runtime cache) is one line in scripts/build-sw.mjs, which
 * is exactly why it needs a guard: nothing would fail if a future asset drop
 * put 3 MB back into ASSETS. This test is the instrument.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');

/** Cellular budget: the whole precache must stay well under a megabyte and a half. */
const PRECACHE_BUDGET_BYTES = 1.5 * 1024 * 1024;

const MEDIA_EXT = /\.(?:mp4|webm|m4a|mp3|ogg|mov)$/i;

/** Parse the generated ASSETS manifest out of sw.js. */
function readAssets() {
  const block = /const ASSETS = \[([\s\S]*?)\];/.exec(SW_SRC);
  assert.ok(block, 'sw.js has no ASSETS array');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Evaluate sw.js in a stubbed worker global so the fetch/caching helpers can be
 * unit-tested. The SW registers listeners at load time, so `self` must exist.
 */
function loadSw() {
  const puts = [];
  const context = {
    console,
    URL, Request, Response, Headers, Blob, fetch,
    self: {
      addEventListener() {},
      location: new URL('https://athlete.pro/sw.js'),
      skipWaiting() {},
      clients: { claim() {} },
    },
    clients: {},
    caches: {
      _puts: puts,
      async open() {
        return { put: (req, res) => { puts.push({ req, res }); }, add() {} };
      },
      async match() { return undefined; },
      async keys() { return []; },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${SW_SRC}\n;globalThis.__sw = { cacheWholeMedia, mediaCacheFirst, MEDIA_RE };`, context);
  return { api: context.__sw, puts, context };
}

test('precache stays under the cellular budget', () => {
  const assets = readAssets();
  let total = 0;
  const missing = [];
  for (const webPath of assets) {
    const abs = path.join(REPO_ROOT, webPath);
    if (!fs.existsSync(abs)) { missing.push(webPath); continue; }
    total += fs.statSync(abs).size;
  }
  assert.deepEqual(missing, [], 'ASSETS lists files that do not exist — run npm run build:sw');
  assert.ok(
    total <= PRECACHE_BUDGET_BYTES,
    `precache is ${(total / 1024 / 1024).toFixed(2)} MB, budget is 1.50 MB ` +
    '(card F-7 — heavy assets belong in the runtime cache, not in ASSETS)'
  );
});

test('no media in the precache, poster still there', () => {
  const assets = readAssets();
  const media = assets.filter((f) => MEDIA_EXT.test(f));
  assert.deepEqual(media, [], 'video/audio must be runtime-cached, not precached (F-7)');
  assert.ok(
    assets.includes('/assets/panda-poster.jpg'),
    'the poster frame stays precached — it is what shows before the video loads'
  );
});

test('build-sw and sw.js agree on what counts as media', () => {
  const build = fs.readFileSync(path.join(REPO_ROOT, 'scripts/build-sw.mjs'), 'utf8');
  const inBuild = /const MEDIA_RE = (\/.+\/i);/.exec(build);
  const inSw = /const MEDIA_RE = (\/.+\/i);/.exec(SW_SRC);
  assert.ok(inBuild && inSw, 'MEDIA_RE missing on one side');
  assert.equal(
    inSw[1], inBuild[1],
    'the exclusion list and the runtime-cache route drifted apart: an extension ' +
    'excluded from ASSETS but not routed to mediaCacheFirst would never be cached at all'
  );
});

test('media routing is wired into the fetch handler', () => {
  assert.match(SW_SRC, /mediaCacheFirst\(e\.request, cleanReq\)/);
});

test('a whole-file 206 is stored as a replayable 200', async () => {
  const { api, puts } = loadSw();
  const body = new Uint8Array(64).fill(7);
  const res = new Response(body, {
    status: 206,
    headers: { 'content-range': `bytes 0-63/64`, 'content-type': 'video/mp4' },
  });
  api.cacheWholeMedia(res, new Request('https://athlete.pro/assets/panda-voice.mp4'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(puts.length, 1, '206 covering the whole file must be cached');
  assert.equal(puts[0].res.status, 200, 'stored copy must be a plain 200 — a 206 is unusable as a cache hit');
  assert.equal(puts[0].res.headers.get('content-range'), null);
  assert.equal((await puts[0].res.arrayBuffer()).byteLength, 64);
});

test('a genuinely partial 206 is not cached', async () => {
  const { api, puts } = loadSw();
  const res = new Response(new Uint8Array(16), {
    status: 206,
    headers: { 'content-range': 'bytes 0-15/64' },
  });
  api.cacheWholeMedia(res, new Request('https://athlete.pro/assets/panda-voice.mp4'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(puts.length, 0, 'caching 16 of 64 bytes would break playback offline');
});
