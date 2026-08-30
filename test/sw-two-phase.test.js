/**
 * Guard for the two-phase precache (card PRECACHE-1).
 *
 * The sibling guard (test/sw-media-budget.test.js) weighs the two manifests and
 * greps the wiring. Neither answers the question that actually matters in the
 * gym on cellular: *what does `install` download?* A one-word edit —
 * `precache(cache, ASSETS.concat(ASSETS_WARM))` — keeps both manifests, both
 * budgets and every regex green while putting the whole 1.5 MB back into the
 * install phase.
 *
 * So this file runs the real handlers. sw.js is evaluated in a stubbed worker
 * global that records every `cache.add`, the `install` and `activate` listeners
 * are fired, and the recorded URLs are compared with the manifests. The last
 * test doctors the source to prove the check goes red — the code and its guard
 * arrive in the same branch, so an assertion that cannot fail would be worth
 * nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');

const listOf = (src, name) => {
  const block = new RegExp(String.raw`const ${name} = \[([\s\S]*?)\];`).exec(src);
  assert.ok(block, `sw.js has no ${name}`);
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

/**
 * Evaluate sw.js with a recording Cache Storage and collected listeners.
 * `stored` doubles as the cache contents, so the warm phase's skip-what-is-
 * already-there path behaves as it would in a browser.
 */
function runSw(src = SW_SRC) {
  const added = [];
  const stored = new Set();
  const listeners = {};
  const cache = {
    add: async (url) => {
      added.push(url);
      stored.add(url);
    },
    match: async (url) => (stored.has(url) ? { ok: true } : undefined),
    put: async () => {},
  };
  const context = {
    console: { warn() {}, log() {} },
    URL,
    Request,
    Response,
    Headers,
    Blob,
    fetch,
    self: {
      addEventListener: (type, fn) => {
        (listeners[type] ||= []).push(fn);
      },
      location: new URL('https://athlete.pro/sw.js'),
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => ['athlete-pro-stale'],
      delete: async () => true,
      match: async () => undefined,
    },
  };
  vm.createContext(context);
  vm.runInContext(src, context);

  const fire = async (type) => {
    const pending = [];
    for (const fn of listeners[type] || []) fn({ waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
    // The warm phase is deliberately detached from activate's waitUntil, so give
    // its microtasks and timers a turn before reading the recording.
    await new Promise((r) => setTimeout(r, 50));
  };

  return { added, fire, listeners };
}

const BOOT = listOf(SW_SRC, 'ASSETS');
const WARM = listOf(SW_SRC, 'ASSETS_WARM');

test('install downloads the boot closure and nothing else', async () => {
  const sw = runSw();
  await sw.fire('install');
  assert.deepEqual(
    [...sw.added].sort(),
    [...BOOT].sort(),
    'the install phase must fetch exactly ASSETS — this is the number the ' +
      'cellular budget in test/sw-media-budget.test.js is measuring (PRECACHE-1)'
  );
  const leaked = sw.added.filter((u) => WARM.includes(u));
  assert.deepEqual(leaked, [], 'warm assets must not ride along with the install');
});

test('activate warms the rest — offline coverage stays complete', async () => {
  const sw = runSw();
  await sw.fire('install');
  const afterInstall = sw.added.length;
  await sw.fire('activate');
  const warmed = sw.added.slice(afterInstall);
  assert.deepEqual(
    [...warmed].sort(),
    [...WARM].sort(),
    'everything outside the boot closure must still reach the cache — otherwise ' +
      'the split traded install traffic for a blank screen offline'
  );
});

test('the warm phase does not re-download the boot closure', async () => {
  const sw = runSw();
  await sw.fire('install');
  await sw.fire('activate');
  const counts = sw.added.reduce((acc, u) => ({ ...acc, [u]: (acc[u] || 0) + 1 }), {});
  const twice = Object.entries(counts)
    .filter(([, n]) => n > 1)
    .map(([u]) => u);
  assert.deepEqual(twice, [], 'an asset fetched in both phases is paid for twice');
});

/**
 * Baseline: the guard above has to actually go red. The two regressions worth
 * fearing are reproduced on a doctored copy in memory — the real sw.js is never
 * touched, so the check cannot pass by accident.
 */
test('the guard fails if install swallows the warm list, or the warm phase dies', async () => {
  const greedy = SW_SRC.replace(
    'precache(cache, ASSETS)',
    'precache(cache, ASSETS.concat(ASSETS_WARM))'
  );
  assert.notEqual(greedy, SW_SRC, 'baseline lost its anchor — install wiring was renamed');
  const swGreedy = runSw(greedy);
  await swGreedy.fire('install');
  assert.notDeepEqual(
    [...swGreedy.added].sort(),
    [...BOOT].sort(),
    'install pulling the whole offline set must be caught'
  );

  const dead = SW_SRC.replace(/\.then\(\(\)\s*=>\s*\{\s*warmCache\(\);\s*\}\)/, '');
  assert.notEqual(dead, SW_SRC, 'baseline lost its anchor — warm wiring was renamed');
  const swDead = runSw(dead);
  await swDead.fire('install');
  const before = swDead.added.length;
  await swDead.fire('activate');
  assert.equal(
    swDead.added.length,
    before,
    'a warm phase that never starts must be caught — offline would be broken'
  );
});
