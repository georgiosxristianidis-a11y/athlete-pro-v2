/**
 * Guard against a stale sw.js (card O-8).
 *
 * The hole, before this file existed: `grep -rln CACHE_NAME test/` was empty.
 * The string was known to exactly two places — scripts/build-sw.mjs (generates
 * it) and scripts/smoke-prod.mjs (compares prod against the *local* sw.js).
 * Nothing checked that sw.js matches the assets it claims to precache.
 *
 * Why it could not surface on its own — the textbook "a green gate answers only
 * its own question": forget `npm run build:sw` after touching an asset, sw.js
 * goes stale, `npm test` stays green (nobody asks), the PR merges, it deploys.
 * The prod smoke compares prod with the local sw.js — both stale in the same
 * way — so it reports "совпал" and is green too. The user meets it offline,
 * several releases later, looking like a random cache bug.
 *
 * The check rebuilds the manifest with build-sw.mjs's own exported logic (not a
 * second copy of the rules — that copy would drift and start lying green) and
 * asserts the file on disk is what the builder would write.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAssets, digestFor, renderSw } from '../scripts/build-sw.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_PATH = path.join(REPO_ROOT, 'sw.js');
const SW_SRC = fs.readFileSync(SW_PATH, 'utf8');

/**
 * Line endings are not part of the answer. core.autocrlf hands out a CRLF
 * working copy on Windows while the builder joins the ASSETS block with LF —
 * comparing raw would fail on a perfectly in-sync Windows checkout.
 */
const norm = (s) => s.replace(/\r\n/g, '\n');

const assets = collectAssets(REPO_ROOT);
const digest = digestFor(assets, REPO_ROOT);

/** The ASSETS manifest as sw.js currently declares it. */
function declaredAssets() {
  const block = /const ASSETS = \[([\s\S]*?)\];/.exec(SW_SRC);
  assert.ok(block, 'sw.js has no ASSETS array');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const STALE = 'sw.js разошёлся с содержимым репозитория — прогони `npm run build:sw` ' +
  'и закоммить sw.js вместе с правкой ассетов';

test('sw.js lists exactly the assets on disk', () => {
  const declared = declaredAssets();
  const added = assets.filter((f) => !declared.includes(f));
  const gone = declared.filter((f) => !assets.includes(f));
  assert.deepEqual({ added, gone }, { added: [], gone: [] }, STALE);
});

test('CACHE_NAME carries the digest of the current manifest', () => {
  const declared = /const CACHE_NAME = '([^']+)';/.exec(SW_SRC);
  assert.ok(declared, 'sw.js has no CACHE_NAME');
  assert.equal(
    declared[1].replace(/^.*-/, ''), digest,
    `${STALE}. Дайджест платформо-независим (scripts/sw-digest.mjs), так что ` +
    'расхождение здесь — не разница ОС, а именно протухший sw.js'
  );
});

test('sw.js is byte-identical to what build:sw would write', () => {
  assert.equal(
    norm(renderSw(SW_SRC, assets, digest)), norm(SW_SRC),
    `${STALE} (полное сравнение сгенерированной части)`
  );
});

/**
 * Baseline: the assertions above have to actually go red. Both failure modes are
 * reproduced on a doctored copy in memory — the real sw.js is never touched, so
 * the guard cannot pass by accident on a repo that happens to be in sync.
 */
test('the guard fails on a stale CACHE_NAME and on a stale manifest', () => {
  const staleHash = SW_SRC.replace(/const CACHE_NAME = '([^']+)';/, "const CACHE_NAME = 'athlete-pro-v120-deadbeef';");
  assert.notEqual(
    /const CACHE_NAME = '([^']+)';/.exec(staleHash)[1].replace(/^.*-/, ''), digest,
    'подложенный протухший хеш обязан расходиться с пересчитанным'
  );
  assert.notEqual(norm(renderSw(staleHash, assets, digest)), norm(staleHash));

  const staleAssets = SW_SRC.replace(/const ASSETS = \[[\s\S]*?\];/, "const ASSETS = [\n  '/index.html'\n];");
  assert.notEqual(
    norm(renderSw(staleAssets, assets, digest)), norm(staleAssets),
    'потерянный из манифеста ассет обязан ловиться полным сравнением'
  );
});
