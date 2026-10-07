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

// CI-CACHE (07.10): ключ от хеша всего локфайла бился каждым бампом версии
// приложения (`"version"` в package-lock.json) — каждый релизный PR качал
// браузеры заново, а без таймаута зависшая загрузка висела до 6 ч (дефолт
// GitHub). Комментарии YAML вырезаются: гард не должен зеленеть на тексте.
const ciCode = ciYml
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/** Блок шага `- name: <name>` до следующего шага. */
function stepBlock(name) {
  const start = ciCode.indexOf(`- name: ${name}`);
  assert.ok(start >= 0, `в ci.yml нет шага «${name}»`);
  const next = ciCode.indexOf('\n      - name:', start + 1);
  return ciCode.slice(start, next === -1 ? undefined : next);
}

test('CI-CACHE: ключ кеша браузеров — версия playwright-core, не хеш всего локфайла', () => {
  const key = (stepBlock('Cache Playwright browsers').match(/key:\s*(.+)/) || [])[1] || '';
  assert.doesNotMatch(key, /hashFiles\('package-lock\.json'\)/,
    'бамп версии приложения меняет локфайл и бьёт кеш браузеров каждым релизным PR');
  assert.match(key, /steps\.pw-version\.outputs\.version/);
  assert.doesNotMatch(key, /\d+\.\d+\.\d+/,
    'версия, вписанная руками, переживает бамп Playwright и даёт hit со старыми браузерами');
  assert.match(stepBlock('Playwright version'), /node_modules\/playwright-core\/package\.json/);
});

test('CI-CACHE: установка браузеров и e2e-задача ограничены по времени', () => {
  assert.match(stepBlock('Install Playwright browsers'), /timeout-minutes:\s*\d+/);
  assert.match(stepBlock('Install Playwright OS dependencies'), /timeout-minutes:\s*\d+/);
  const e2eJob = ciCode.slice(ciCode.indexOf('\n  e2e:'));
  assert.match(e2eJob.split('\n    steps:')[0], /timeout-minutes:\s*\d+/,
    'без таймаута задачи зависший шаг держит чек до 6 часов');
});
