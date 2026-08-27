/**
 * Guard for the agent rule set (card AGENT-2).
 *
 * The rules two different tools read are not documentation: an executor writes
 * code by them. When a rule names an artifact that no longer exists, the
 * executor produces code that fails the gate and the blame lands on the wrong
 * side. That is not hypothetical — the retired `.cursorrules`
 * (`docs/_archive/cursorrules-2026-08-25.md`) sent its reader to `DESIGN.md`,
 * killed a month earlier, and told it to call `bsEsc()`, which the codebase
 * never had.
 *
 * So the check is mechanical, about *shape* rather than a blacklist of names:
 * every file path a rule mentions must exist in the repo, and every function it
 * names must be findable in the source. A rule that rots now turns the suite
 * red instead of turning the next executor's work red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Rule files both agents read. Adapters included — that is the point. */
const RULE_FILES = [
  'CLAUDE.md',
  'GEMINI.md',
  '.claude/rules/architecture.md',
  '.claude/rules/design.md',
  '.claude/rules/security.md',
  '.cursor/rules/000-core.mdc',
  '.cursor/rules/architecture.mdc',
  '.cursor/rules/design.mdc',
  '.cursor/rules/security-auditor.mdc',
];

/** Extensions that make a backticked token a claim about a file in this repo. */
const PATH_EXT = /\.(js|mjs|cjs|md|mdc|json|css|html|yml|yaml)$/;

/**
 * Tokens that look like repo paths but are not: package names, remote refs,
 * upstream files. Kept short on purpose — a long allowlist is how a guard dies.
 */
const NOT_REPO_PATHS = new Set([
  'origin/main',
  '@anthropic-ai/sdk',
  '@google/genai',
  'package.json',
  'package-lock.json',
]);

/** Callables that belong to the language or the browser, not to this codebase. */
const BUILTIN_CALLS = new Set(['import', 'require', 'fetch', 'structuredClone', 'queueMicrotask']);

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean);

const trackedSet = new Set(tracked);

/** `js/**` and `css/*.css` are legitimate ways to name a path in a rule. */
function globMatches(pattern, pool = tracked) {
  const body = pattern
    .split('**')
    .map((chunk) => chunk.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  const rx = new RegExp(`^${body}$`);
  return pool.some((f) => rx.test(f));
}

function pathExists(token) {
  if (token.endsWith('/')) return tracked.some((f) => f.startsWith(token));
  // Rules name files the short way (`shell.js`, `HANDOFF_*.md`) far more often
  // than by full path, so a bare name is matched against basenames.
  const pool = token.includes('/') ? tracked : tracked.map((f) => path.posix.basename(f));
  if (token.includes('*')) return globMatches(token, pool);
  return pool.includes(token);
}

/** Backticked spans; a span may hold several words (`css/base.css :root`). */
function backticked(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

const rules = RULE_FILES.map((file) => ({
  file,
  text: readFileSync(path.join(REPO_ROOT, file), 'utf8'),
}));

test('agent rules: every rule file listed here exists', () => {
  const missing = RULE_FILES.filter((f) => !trackedSet.has(f));
  assert.deepEqual(
    missing,
    [],
    `Rule files are tracked, or this list is stale: ${missing.join(', ')}`
  );
});

test('agent rules: every file path named in the rules exists', () => {
  const broken = [];

  for (const { file, text } of rules) {
    for (const span of backticked(text)) {
      for (const word of span.split(/[\s,;]+/)) {
        const token = word.replace(/^[('"]+|[)'".,:]+$/g, '');
        if (!token || NOT_REPO_PATHS.has(token)) continue;
        if (!PATH_EXT.test(token) && !token.endsWith('/')) continue;
        // Paths outside the repo (`~/.gemini/...`) and placeholders (`<file>`)
        // are not claims this guard can check.
        if (/^[~<]/.test(token) || token.includes('<') || token.startsWith('http')) continue;
        if (pathExists(token)) continue;
        broken.push(`${file}: ${token}`);
      }
    }
  }

  assert.deepEqual(
    broken,
    [],
    `Rules point at files that do not exist — an executor sent there writes ` +
      `code against nothing:\n  ${broken.join('\n  ')}`
  );
});

test('agent rules: every function named in the rules is findable in the source', () => {
  const source = execFileSync(
    'git',
    ['grep', '-lI', '-e', '', '--', 'js/', 'lib/', 'routes/', 'scripts/', 'server.js', 'sw.js'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\n')
    .filter(Boolean);

  const haystack = source.map((f) => readFileSync(path.join(REPO_ROOT, f), 'utf8')).join('\n');

  const missing = [];
  for (const { file, text } of rules) {
    for (const span of backticked(text)) {
      for (const m of span.matchAll(/\b([A-Za-z_]\w*)\(/g)) {
        const name = m[1];
        if (BUILTIN_CALLS.has(name)) continue;
        if (new RegExp(`\\b${name}\\s*[(=]`).test(haystack)) continue;
        missing.push(`${file}: ${name}()`);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `Rules name functions the codebase does not have (this is the bsEsc() case):\n  ` +
      `${missing.join('\n  ')}`
  );
});

test('agent rules: the Cursor adapter stays a pointer, not a copy', () => {
  for (const file of RULE_FILES.filter((f) => f.startsWith('.cursor/'))) {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    const lines = text.split('\n').length;

    assert.ok(
      lines <= 60,
      `${file} is ${lines} lines. The adapter points at .claude/rules/*; a copy ` +
        `drifts from the canon on its first edit — that is exactly how ` +
        `.cursorrules died.`
    );
    assert.ok(
      /\.claude\/rules\/|CLAUDE\.md/.test(text),
      `${file} names no canonical rule file, so it is not a pointer.`
    );
  }
});

test('agent rules: no raw hex colours prescribed anywhere in the rules', () => {
  const offenders = [];

  for (const { file, text } of rules) {
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      // The design canon quotes brand hex once per token as documentation of
      // what the token resolves to; a rule that tells you to *type* hex is the
      // problem. Anything outside the canon is that.
      if (file === '.claude/rules/design.md') continue;
      offenders.push(`${file}: ${m[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Colours come from tokens in css/base.css :root. Rules that hand out raw ` +
      `hex teach the executor to break the design law:\n  ${offenders.join('\n  ')}`
  );
});

test('agent rules: rule files are UTF-8 without stray UTF-16 tails', () => {
  const broken = [];

  for (const file of RULE_FILES) {
    const bytes = readFileSync(path.join(REPO_ROOT, file));
    if (bytes.includes(0)) broken.push(file);
  }

  assert.deepEqual(
    broken,
    [],
    `NUL bytes mean a UTF-16LE chunk landed inside a UTF-8 file (PowerShell ` +
      `redirection does this). Half the rules become unreadable: ${broken.join(', ')}`
  );
});
