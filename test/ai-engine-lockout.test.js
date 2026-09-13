// @ts-check
/**
 * Guard for card AI-1: the Anthropic engine toggle must be unselectable
 * whenever no key exists anywhere (server env or local BYOK) — until
 * 2026-09-13 the toggle was always clickable, so a user could pick the
 * engine that is guaranteed to answer 500 NO_API_KEY on the very next
 * coach request. Decision (Gio, 2026-09-10): no key → close from the UI
 * side, don't fake a key.
 *
 * View-layer guard follows the source-regex convention from
 * test/intel-engine-wiring.test.js — js/ai-settings.view.js imports
 * events.js, which touches `document` at module load and cannot be
 * imported under plain node --test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'ai-settings.view.js'), 'utf8');

test('renderEngineAndKey disables the Anthropic button when fabKeyState is missing', () => {
  assert.match(
    SRC,
    /const anthropicNoKey = fabKeyState\(serverStatus, hasLocalAnthropic, 'anthropic'\) === 'missing';/,
    'initial render must gate the button on the same verdict as the FAB dot'
  );
  const btnMarkup = SRC.slice(SRC.indexOf('engine-toggle-grid'), SRC.indexOf('engine-toggle-btn gemini-active'));
  assert.match(
    btnMarkup,
    /\$\{anthropicNoKey \? `disabled/,
    'Anthropic button markup must carry a disabled branch — a clickable button with no key reaches 500'
  );
});

test('patchAiStatus re-syncs the disabled flag after the async probe resolves', () => {
  const patch = SRC.slice(SRC.indexOf('export async function patchAiStatus'), SRC.indexOf('export function renderEngineAndKey'));
  assert.match(
    patch,
    /getElementById\('engine-btn-anthropic'\)/,
    'patchAiStatus must reach the button by id, not just the status dot'
  );
  assert.match(
    patch,
    /anthropicBtn\.disabled = noKey;/,
    'probe result must flip .disabled — initial render runs before the network answers'
  );
});

test('the disabled verdict is fabKeyState, not a hand-rolled duplicate', () => {
  const uses = SRC.match(/fabKeyState\(/g) || [];
  assert.equal(
    uses.length,
    2,
    'exactly two call sites expected (initial render + probe patch) — a third means logic drifted apart'
  );
});
