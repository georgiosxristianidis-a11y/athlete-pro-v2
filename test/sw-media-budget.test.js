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
import { collectAssets } from '../scripts/build-sw.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');

/**
 * Cellular budget for the INSTALL phase (card PRECACHE-1). Until 2026-08-21 this
 * was one budget for the whole offline set — 1.55 MB with 2.4 KB of headroom,
 * so three kilobytes of SEO meta in <head> went red for reasons unrelated to the
 * question the gate asks. The precache is two-phase now: `install` takes only
 * the boot closure, the rest warms after `activate`.
 *
 * The ceiling therefore went DOWN, not up: 1.55 → 0.75 MB against 0.65 MB in
 * use. Headroom is ~100 KB and it belongs to boot-path growth alone — a new
 * screen's CSS/JS lands in the warm phase and cannot spend it.
 */
const INSTALL_BUDGET_BYTES = 0.75 * 1024 * 1024;

/**
 * The warm phase answers a different question — offline completeness, not the
 * cost of installing over a cell — so its ceiling is deliberately loose. It
 * exists so a multi-megabyte asset drop still meets a red test somewhere.
 */
const OFFLINE_BUDGET_BYTES = 2 * 1024 * 1024;

const MEDIA_EXT = /\.(?:mp4|webm|m4a|mp3|ogg|mov)$/i;

/** Parse one of the generated manifests out of sw.js. */
function readList(name) {
  const block = new RegExp(String.raw`const ${name} = \[([\s\S]*?)\];`).exec(SW_SRC);
  assert.ok(block, `sw.js has no ${name} array`);
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const readAssets = () => readList('ASSETS');
const readWarm = () => readList('ASSETS_WARM');

/** Total size on disk, asserting every listed path exists. */
function sizeOf(paths) {
  let total = 0;
  const missing = [];
  for (const webPath of paths) {
    const abs = path.join(REPO_ROOT, webPath);
    if (!fs.existsSync(abs)) { missing.push(webPath); continue; }
    total += fs.statSync(abs).size;
  }
  assert.deepEqual(missing, [], 'manifest lists files that do not exist — run npm run build:sw');
  return total;
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
  vm.runInContext(`${SW_SRC}\n;globalThis.__sw = { cacheWholeMedia, mediaCacheFirst, MEDIA_RE, precache };`, context);
  return { api: context.__sw, puts, context };
}

test('the install phase stays under the cellular budget', () => {
  const total = sizeOf(readAssets());
  assert.ok(
    total <= INSTALL_BUDGET_BYTES,
    `install phase is ${(total / 1024 / 1024).toFixed(2)} MB, budget is ` +
    `${(INSTALL_BUDGET_BYTES / 1024 / 1024).toFixed(2)} MB (cards F-7 · PRECACHE-1 — ` +
    'anything outside the boot closure belongs in ASSETS_WARM, not in ASSETS)'
  );
});

test('the whole offline set stays under its own ceiling', () => {
  const total = sizeOf([...readAssets(), ...readWarm()]);
  assert.ok(
    total <= OFFLINE_BUDGET_BYTES,
    `offline set is ${(total / 1024 / 1024).toFixed(2)} MB, ceiling is ` +
    `${(OFFLINE_BUDGET_BYTES / 1024 / 1024).toFixed(2)} MB — heavy assets belong ` +
    'in the runtime cache, not in either manifest (F-7)'
  );
});

/**
 * The split must be a partition, not a filter. A file that fell out of both
 * lists is the silent failure mode of PRECACHE-1: everything works online and
 * the screen is blank in the gym's basement.
 */
test('boot and warm partition the manifest — no overlap, nothing dropped', () => {
  const boot = readAssets();
  const warm = readWarm();
  const overlap = boot.filter((f) => warm.includes(f));
  assert.deepEqual(overlap, [], 'an asset in both phases would be fetched twice');

  const declared = new Set([...boot, ...warm]);
  const built = new Set(collectAssets(REPO_ROOT));
  assert.deepEqual(
    [...built].filter((f) => !declared.has(f)), [],
    'asset on disk missing from BOTH phases — it would never be cached, and the ' +
    'app would go blank offline. Run npm run build:sw'
  );
  assert.deepEqual([...declared].filter((f) => !built.has(f)), [], 'phantom asset in a manifest');
});

test('the boot closure actually boots — entry, styles, fonts', () => {
  const boot = readAssets();
  for (const must of [
    '/index.html', '/js/boot.js', '/js/app.js', '/js/theme-boot.js',
    '/css/base.css', '/css/dashboard.css', '/fonts/manrope-latin.woff2', '/icons/icon-64.png',
  ]) {
    assert.ok(boot.includes(must), `${must} must ride in the install phase — without it the cold offline start is broken`);
  }
});

test('no media in either phase, poster still precached', () => {
  const all = [...readAssets(), ...readWarm()];
  const media = all.filter((f) => MEDIA_EXT.test(f));
  assert.deepEqual(media, [], 'video/audio must be runtime-cached, not precached (F-7)');
  assert.ok(
    all.includes('/assets/panda-poster.jpg'),
    'the poster frame stays precached — it is what shows before the video loads'
  );
});

/**
 * Wiring, not intent: the warm list is dead weight unless something fetches it,
 * and holding `activate` open until it finishes would delay
 * navigator.serviceWorker.ready (js/privacy.store.js posts the privacy mode
 * through it). Both halves are asserted.
 */
test('the warm phase is wired and does not block activation', () => {
  assert.match(SW_SRC, /precache\(cache, ASSETS_WARM/, 'ASSETS_WARM is never fetched');
  assert.match(SW_SRC, /self\.clients\.claim\(\)[\s\S]*?warmCache\(\)/, 'warm phase must start after claim');
  assert.doesNotMatch(
    SW_SRC, /waitUntil\(\s*warmCache\(\)/,
    'awaiting the warm phase in waitUntil would keep the worker in `activating`'
  );
  assert.match(SW_SRC, /const ASSETS_WARM = \[/, 'sw.js has no ASSETS_WARM manifest');
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

/**
 * The warm phase restarts from scratch whenever the browser kills an idle
 * worker mid-warm. Without the skip it would re-download everything already in
 * the cache — the exact cellular cost PRECACHE-1 set out to remove.
 */
test('the warm phase skips what is already cached, install does not', async () => {
  const { api } = loadSw();
  const cached = new Set(['/css/intel.css']);
  const added = [];
  const cache = {
    match: async (url) => (cached.has(url) ? new Response('x') : undefined),
    add: async (url) => { added.push(url); cached.add(url); },
  };

  await api.precache(cache, ['/css/intel.css', '/css/journal.css'], 2, true);
  assert.deepEqual(added, ['/css/journal.css'], 'a cached entry must not be re-fetched');

  added.length = 0;
  await api.precache(cache, ['/css/intel.css'], 2);
  assert.deepEqual(added, ['/css/intel.css'], 'install phase still refreshes unconditionally');
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
