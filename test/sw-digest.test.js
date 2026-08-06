/**
 * Guard for the reproducibility of CACHE_NAME's digest across platforms.
 *
 * The bug: build-sw.mjs hashed raw bytes off disk. With core.autocrlf=true and
 * no .gitattributes rule for *.css / *.js / *.html, the same commit lives as
 * CRLF on Windows and LF on Linux/CI, so `npm run build:sw` produced two
 * different digests for identical content (measured 2026-08-06: a4e8351e vs
 * 8ee4c365). Harmless for the SW, but it made sw.js a phantom-diff generator in
 * a repo three agents work at once.
 *
 * These tests are the instrument: they pin the invariant (text normalized,
 * binaries untouched) and catch the drift mode — a new text extension entering
 * the precache without entering TEXT_ASSET_RE, which silently reopens the bug.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDigest, bytesForHash, TEXT_ASSET_RE } from '../scripts/sw-digest.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');

/** Binary bytes that happen to contain CR LF — normalizing them would corrupt the file. */
const BINARY_BYTES = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x0d, 0x0a, 0x00, 0xff]);

/** A fake checkout: same content, one with LF line endings, one with CRLF. */
function fakeCheckout(eol) {
  const files = {
    'index.html': `<!doctype html>${eol}<title>a</title>${eol}`,
    'css/base.css': `:root {${eol}  --x: 1;${eol}}${eol}`,
    'js/app.js': `const a = 1;${eol}export default a;${eol}`,
    'fonts/manrope-latin.woff2': BINARY_BYTES,
  };
  const read = (p) => {
    const v = files[p.replace(/\\/g, '/')];
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8');
  };
  return { assets: Object.keys(files).map((f) => `/${f}`), read };
}

test('digest is identical on a CRLF and an LF checkout', () => {
  const lf = fakeCheckout('\n');
  const crlf = fakeCheckout('\r\n');
  assert.equal(
    computeDigest(crlf.assets, crlf.read),
    computeDigest(lf.assets, lf.read),
    'CACHE_NAME must be a hash of the content, not of the platform: Windows (CRLF) ' +
    'and CI (LF) have to agree, or every build:sw leaves a phantom diff in sw.js'
  );
});

test('digest still changes when the content actually changes', () => {
  const { assets, read } = fakeCheckout('\n');
  const edited = (p) => (p.endsWith('app.js') ? Buffer.from('const a = 2;\n', 'utf8') : read(p));
  assert.notEqual(
    computeDigest(assets, edited),
    computeDigest(assets, read),
    'normalization must not flatten real edits — that is the whole point of the auto-bump'
  );
});

test('binary assets are hashed byte-for-byte', () => {
  const out = bytesForHash('/fonts/manrope-latin.woff2', BINARY_BYTES);
  assert.deepEqual(out, BINARY_BYTES, '0D 0A inside a woff2 is data, not a line break');
  for (const ext of ['.png', '.ico', '.jpg', '.woff2']) {
    assert.equal(TEXT_ASSET_RE.test(`/a${ext}`), false, `${ext} must not be normalized`);
  }
});

test('every text asset in the precache is covered by TEXT_ASSET_RE', () => {
  const block = /const ASSETS = \[([\s\S]*?)\];/.exec(SW_SRC);
  assert.ok(block, 'sw.js has no ASSETS array');
  const assets = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const BINARY_EXT = /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|ico|webp|avif|mp4|webm|m4a|mp3|ogg|mov|pdf|zip)$/i;
  const uncovered = [...new Set(
    assets.filter((f) => !TEXT_ASSET_RE.test(f) && !BINARY_EXT.test(f)).map((f) => path.extname(f) || f)
  )];

  assert.deepEqual(
    uncovered, [],
    'an extension the precache carries is neither known-text nor known-binary. If it is text, ' +
    'add it to TEXT_ASSET_RE in scripts/sw-digest.mjs — otherwise its CRLF leaks into the ' +
    'digest again and Windows/CI diverge. If it is binary, add it to BINARY_EXT here.'
  );
});
