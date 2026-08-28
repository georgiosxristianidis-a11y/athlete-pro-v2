/**
 * LAUNCH-7: e2e must run in WebKit as well as Chromium. The chromium project
 * stays; webkit is a second project, not a rename. CI must install both
 * browsers — a chromium-only Playwright cache is a silent miss.
 *
 * Reads files as text on purpose: importing playwright.config.js loads
 * `@playwright/test` into the unit runner and collides when local
 * node_modules drift from the lockfile.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pwConfig = readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
const ciYml = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');

test('LAUNCH-7: chromium project remains', () => {
  assert.match(pwConfig, /name:\s*'chromium'/);
  assert.match(pwConfig, /devices\['Pixel 7'\]/);
});

test('LAUNCH-7: webkit project exists alongside chromium', () => {
  assert.match(pwConfig, /name:\s*'webkit'/);
  assert.match(pwConfig, /devices\['iPhone 13'\]/);
});

test('LAUNCH-7: webkit is added, not a rename of chromium', () => {
  const chromium = [...pwConfig.matchAll(/name:\s*'chromium'/g)];
  const webkit = [...pwConfig.matchAll(/name:\s*'webkit'/g)];
  assert.equal(chromium.length, 1);
  assert.equal(webkit.length, 1);
});

test('LAUNCH-7: CI installs chromium and webkit, not chromium alone', () => {
  assert.match(ciYml, /playwright install --with-deps chromium webkit/);
  assert.match(ciYml, /playwright install-deps chromium webkit/);
  assert.equal(
    [...ciYml.matchAll(/playwright install --with-deps chromium(?! webkit)/g)].length,
    0,
    'chromium-only install would skip webkit on a fresh runner'
  );
});

test('LAUNCH-7: Playwright cache key names both browsers', () => {
  assert.match(ciYml, /chromium-webkit/);
});
