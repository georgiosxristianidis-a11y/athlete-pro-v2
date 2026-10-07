/**
 * Guard for SW-CACHE — warm start without the network, flag 'sw-cache-first'.
 *
 * Runs the real sw.js handlers in a stubbed worker global (same approach as
 * test/sw-two-phase.test.js) with an in-memory Cache Storage that persists
 * between "worker lives", and counts every network fetch. What it pins:
 *   - flag ON  → code comes from CACHE_NAME, zero fetches;
 *   - flag OFF / never posted → network-first exactly as before;
 *   - localhost → network-first even with the flag ON (dev sees edits);
 *   - the flag survives `activate` and a worker restart (it lives on disk,
 *     outside the version cache that activate prunes);
 *   - posting OFF after ON is a working kill switch;
 *   - a `cache: 'no-store'` request (the version poll in js/app.js) still
 *     reaches the network — otherwise the update safety net goes blind.
 * The last test runs the same scenario against a doctored copy without the
 * flag path, so the assertions are proven able to go red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
const CACHE_NAME = /const CACHE_NAME = '([^']+)'/.exec(SW_SRC)[1];

const PROD = 'https://athlete.pro';
const DEV = 'http://localhost:3000';

/** Cache Storage that outlives one worker instance — the browser's disk. */
function makeDisk(origin) {
  const stores = new Map();
  const keyOf = (req) => new URL(typeof req === 'string' ? req : req.url, origin).href;
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => m.get(keyOf(req))?.clone(),
      put: async (req, res) => { m.set(keyOf(req), res); },
      add: async (url) => { m.set(keyOf(url), new Response('warm')); },
    };
  };
  return {
    stores,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      match: async (req) => {
        for (const m of stores.values()) {
          const hit = m.get(keyOf(req));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  };
}

/** One worker life: evaluate sw.js against `disk`, count network fetches. */
function boot(disk, origin, src = SW_SRC) {
  const listeners = {};
  const net = [];
  const context = {
    console: { warn() {}, log() {} },
    URL, Request, Response, Headers, Blob,
    fetch: async (req) => {
      net.push(typeof req === 'string' ? req : req.url);
      return new Response('network', { status: 200, headers: { 'content-type': 'text/javascript' } });
    },
    self: {
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      location: new URL(origin + '/sw.js'),
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
    caches: disk.caches,
  };
  vm.createContext(context);
  vm.runInContext(src, context);

  const fireExtendable = async (type, extra = {}) => {
    const pending = [];
    for (const fn of listeners[type] || []) fn({ ...extra, waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  };
  const get = async (pathname, init) => {
    let out;
    for (const fn of listeners.fetch || []) {
      fn({ request: new Request(origin + pathname, init), respondWith: (p) => { out = p; } });
    }
    const res = await out;
    return res.text();
  };
  return {
    net,
    get,
    post: (data) => fireExtendable('message', { data }),
    activate: () => fireExtendable('activate'),
  };
}

/** Disk with the current version already precached — a returning visitor. */
async function warmDisk(origin) {
  const disk = makeDisk(origin);
  const cache = await disk.caches.open(CACHE_NAME);
  await cache.put('/js/app.js', new Response('cached'));
  await cache.put('/index.html', new Response('cached-html'));
  return disk;
}

const codeFetches = (net) => net.filter((u) => /\.(?:js|css|html)$|\/$/.test(new URL(u).pathname));

test('flag ON: code is served from CACHE_NAME without touching the network', async () => {
  const sw = boot(await warmDisk(PROD), PROD);
  await sw.post({ type: 'sw-cache-first', on: true });
  assert.equal(await sw.get('/js/app.js'), 'cached');
  assert.equal(await sw.get('/'), 'cached-html', 'the document comes from the cache too');
  assert.deepEqual(codeFetches(sw.net), [], 'warm start with the flag ON must not fetch code');
});

test('flag ON, cache miss: falls through to the network', async () => {
  const sw = boot(await warmDisk(PROD), PROD);
  await sw.post({ type: 'sw-cache-first', on: true });
  assert.equal(await sw.get('/js/not-precached.js'), 'network');
});

test('flag ON: the no-store version poll still reaches the network', async () => {
  const disk = await warmDisk(PROD);
  await (await disk.caches.open(CACHE_NAME)).put('/js/version.js', new Response('old-version'));
  const sw = boot(disk, PROD);
  await sw.post({ type: 'sw-cache-first', on: true });
  assert.equal(
    await sw.get('/js/version.js?uc=1', { cache: 'no-store' }), 'network',
    'a cached version.js blinds the update poll — the safety net against a stuck SW'
  );
});

test('flag never posted: network-first exactly as before', async () => {
  const sw = boot(await warmDisk(PROD), PROD);
  assert.equal(await sw.get('/js/app.js'), 'network');
  assert.equal(codeFetches(sw.net).length, 1);
});

test('localhost stays network-first even with the flag ON', async () => {
  const sw = boot(await warmDisk(DEV), DEV);
  await sw.post({ type: 'sw-cache-first', on: true });
  assert.equal(await sw.get('/js/app.js'), 'network', 'dev must see edits without build:sw');
});

test('the flag survives activate and a worker restart', async () => {
  const disk = await warmDisk(PROD);
  const first = boot(disk, PROD);
  await first.post({ type: 'sw-cache-first', on: true });
  await first.activate();
  // A new worker life on the same disk — no message has been posted yet.
  const second = boot(disk, PROD);
  await second.activate();
  assert.equal(await second.get('/js/app.js'), 'cached', 'flag lost on activate — reset on every deploy');
  assert.deepEqual(codeFetches(second.net), []);
});

test('posting OFF after ON is a working kill switch', async () => {
  const disk = await warmDisk(PROD);
  const sw = boot(disk, PROD);
  await sw.post({ type: 'sw-cache-first', on: true });
  await sw.post({ type: 'sw-cache-first', on: false });
  assert.equal(await sw.get('/js/app.js'), 'network');
  const restarted = boot(disk, PROD);
  assert.equal(await restarted.get('/js/app.js'), 'network', 'OFF must persist across restarts too');
});

test('baseline: without the flag path the guard goes red', async () => {
  const doctored = SW_SRC.replace(
    'isCode ? codeResponse(e.request, cleanReq, dest)',
    'isCode ? networkFirst(e.request, cleanReq, dest)'
  );
  assert.notEqual(doctored, SW_SRC, 'baseline lost its anchor — code routing was renamed');
  const sw = boot(await warmDisk(PROD), PROD, doctored);
  await sw.post({ type: 'sw-cache-first', on: true });
  assert.equal(await sw.get('/js/app.js'), 'network', 'the old network-first path must be detectable');

  const pruning = SW_SRC.replace('k !== CACHE_NAME && k !== SETTINGS_CACHE', 'k !== CACHE_NAME');
  assert.notEqual(pruning, SW_SRC, 'baseline lost its anchor — activate filter was renamed');
  const disk = await warmDisk(PROD);
  const a = boot(disk, PROD, pruning);
  await a.post({ type: 'sw-cache-first', on: true });
  await a.activate();
  const b = boot(disk, PROD, pruning);
  assert.equal(await b.get('/js/app.js'), 'network', 'a flag wiped by activate must be detectable');
});
