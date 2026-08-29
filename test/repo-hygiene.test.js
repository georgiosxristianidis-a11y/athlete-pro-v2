/**
 * Guard for repository hygiene (card H-4).
 *
 * Cleanup H-1 removed 4222 files that were never product: a vendored 40 MB
 * third-party repo, nine one-off debug scripts and a pile of artifacts. None of
 * that arrived in one bad commit — it accreted, because nothing failed when it
 * appeared. These tests are that missing instrument: they watch the repo
 * surface, which the orphan-module scans never covered (they only follow
 * imports inside js/, and everything above rotted outside of it).
 *
 * The rules are deliberately about *shape*, not about named files, so a future
 * `fix_escape2.js` is caught without anyone updating a blacklist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Entry points and configs — the only executable code allowed at the root. */
const ROOT_CODE_ALLOWED = new Set([
  'server.js',
  'sw.js',
  'eslint.config.js',
  'playwright.config.js',
]);

/**
 * Docs a newcomer (human or agent) is expected to open first. GEMINI.md is here
 * for a mechanical reason, not an editorial one: the Gemini CLI loads it only
 * from the project root, exactly like CLAUDE.md. Everything else lives under
 * docs/, handoffs under docs/handoff/ (card H-3).
 */
const ROOT_DOCS_ALLOWED = new Set([
  'README.md',
  'CLAUDE.md',
  'GEMINI.md',
  'NEXT_SESSION.md',
  'CHANGELOG.md',
]);

/**
 * Ceiling on tracked files. 404 today; the headroom absorbs normal growth but
 * not a vendored tree (the one removed here was 4190 files on its own).
 *
 * Raised to 450 in its own PR on purpose. It had been sitting one file above
 * the count (400 → 401 in a9b0d5b, inside the very PR that added the 401st
 * file), so every branch that added anything had to touch this line — and a
 * ceiling moved by the work it measures stops being a decision anyone makes.
 * Headroom is ~11%: still an order of magnitude below the vendored tree this
 * number exists to catch.
 */
const MAX_TRACKED_FILES = 450;

/** Binaries belong in assets/ (and only there). */
const MAX_FILE_BYTES = 1024 * 1024;

/**
 * CLAUDE.md is the thing every agent reads first — bloat there is bloat
 * everyone pays for, every session. Rule stated in CLAUDE.md itself: past
 * this, move detail to docs/RULES.md / .claude/rules/*.md and leave a
 * one-line pointer.
 */
const MAX_CLAUDE_MD_LINES = 200;

/** Tracked paths, POSIX-separated, exactly as git records them. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

const files = trackedFiles();
const rootFiles = files.filter((f) => !f.includes('/'));

test('hygiene: no stray code at the repo root', () => {
  const strays = rootFiles
    .filter((f) => /\.(js|cjs|mjs|ts)$/.test(f))
    .filter((f) => !ROOT_CODE_ALLOWED.has(f));

  assert.deepEqual(
    strays,
    [],
    `Root is for entry points and configs only. Move tooling to scripts/, ` +
      `delete one-off debug files: ${strays.join(', ')}`
  );
});

test('hygiene: no new docs at the repo root', () => {
  const strays = rootFiles
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !ROOT_DOCS_ALLOWED.has(f));

  assert.deepEqual(
    strays,
    [],
    `New docs go under docs/ (handoffs under docs/handoff/), not the root: ` +
      `${strays.join(', ')}`
  );
});

test('hygiene: tracked file count stays under the ceiling', () => {
  assert.ok(
    files.length <= MAX_TRACKED_FILES,
    `${files.length} tracked files, ceiling is ${MAX_TRACKED_FILES}. ` +
      `A jump like this usually means a dependency or vendored tree got ` +
      `committed instead of ignored.`
  );
});

test('hygiene: CLAUDE.md stays under the line ceiling', () => {
  const lines = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8').split('\n').length;

  assert.ok(
    lines <= MAX_CLAUDE_MD_LINES,
    `CLAUDE.md is ${lines} lines, ceiling is ${MAX_CLAUDE_MD_LINES}. ` +
      `Move detail to docs/RULES.md / .claude/rules/*.md and leave a one-line pointer.`
  );
});

test('hygiene: no large tracked files outside assets/', () => {
  const heavy = [];
  for (const f of files) {
    if (f.startsWith('assets/')) continue;

    let size;
    try {
      size = statSync(path.join(REPO_ROOT, f)).size;
    } catch {
      // Tracked but absent from the working tree (sparse checkout, case
      // collision on Windows) — nothing to weigh.
      continue;
    }
    if (size > MAX_FILE_BYTES) heavy.push(`${f} (${Math.round(size / 1024)} KB)`);
  }

  assert.deepEqual(
    heavy,
    [],
    `Files over 1 MB belong in assets/ (or nowhere): ${heavy.join(', ')}`
  );
});
