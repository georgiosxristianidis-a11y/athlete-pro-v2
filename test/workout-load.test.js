// @ts-check
/**
 * A4 — Workout.load: no debug logs, one stale-session timer, cleared on leave.
 *
 * Source-level: workout.view.js pulls the DOM barrel and cannot run in node.
 * The leak was a bare setInterval inside load(), re-armed on every Nav.go('s-train').
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'workout.view.js'), 'utf8');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CODE = stripComments(SRC);

describe('A4: Workout.load stale-session timer', () => {
  test('нет console.log', () => {
    assert.doesNotMatch(CODE, /\bconsole\.log\s*\(/);
  });

  test('интервал пишется в модульный слот и не стартует повторно', () => {
    assert.match(CODE, /_staleTimer\s*=\s*setInterval\s*\(/);
    assert.match(CODE, /if\s*\(_staleTimer\)\s*return/);
    assert.match(CODE, /load\(\)\s*\{[\s\S]*_startStaleCleanup\(\)/);
  });

  test('таймер снимается при уходе с Train через listenerGroup', () => {
    assert.match(CODE, /clearInterval\(_staleTimer\)/);
    assert.match(CODE, /listenerGroup\s*\(/);
    assert.match(CODE, /ap-nav-change/);
    assert.match(CODE, /id\s*!==\s*['"]s-train['"]/);
    assert.doesNotMatch(CODE, /\bwindow\.addEventListener\s*\(/);
  });
});
