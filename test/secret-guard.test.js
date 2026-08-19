/**
 * Guard against committing real API keys and secrets into the repository.
 *
 * Scans all tracked git files to prevent accidental commits of real credentials
 * (Google Gemini, Anthropic, OpenAI, Tailscale, private keys, sync dumps).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_TEST_PATHS = new Set([
  'test/perimeter-guard.test.js',
  'test/verify-key.test.js',
  'test/secret-guard.test.js',
  '.env.example',
]);

const SECRET_PATTERNS = [
  { name: 'Google API Key', regex: /AIzaSy[A-Za-z0-9_-]{33}/g },
  { name: 'Anthropic API Key', regex: /sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI API Key', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { name: 'Tailscale Auth Key', regex: /tskey-auth-[A-Za-z0-9_-]{10,}/g },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

test('security: no active API keys or private secrets in tracked files', () => {
  const files = trackedFiles();
  const violations = [];

  for (const f of files) {
    if (ALLOWED_TEST_PATHS.has(f)) continue;
    if (f.startsWith('assets/')) continue;

    let content;
    try {
      content = readFileSync(path.join(REPO_ROOT, f), 'utf8');
    } catch {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(content);
      if (match) {
        violations.push(`${f}: detected potential ${pattern.name} ("${match[0].slice(0, 10)}...")`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found credentials committed into tracked files. Move to .env and add to .gitignore:\n` +
      violations.join('\n')
  );
});

test('security: data/ and sync dumps must not be tracked', () => {
  const files = trackedFiles();
  const syncFiles = files.filter(
    (f) => f.startsWith('data/') || f.endsWith('.sync.json') || f === 'sync.json'
  );

  assert.deepEqual(
    syncFiles,
    [],
    `Local sync state or data dump must not be tracked in git: ${syncFiles.join(', ')}`
  );
});