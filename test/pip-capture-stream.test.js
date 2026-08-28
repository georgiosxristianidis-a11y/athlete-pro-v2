/**
 * LAUNCH-7: Dynamic Island boots PiP unconditionally. WebKit without
 * canvas.captureStream used to throw on first paint. Guard must sit
 * before the call — a later catch would still hit pageerror on boot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'js/features/pip.js'), 'utf8');

test('LAUNCH-7: PiP.init feature-detects captureStream before calling it', () => {
  const guardAt = src.indexOf("typeof _canvas.captureStream !== 'function'");
  const callAt = src.indexOf('_canvas.captureStream(5)');
  assert.ok(guardAt !== -1, 'missing captureStream feature detect');
  assert.ok(callAt !== -1, 'captureStream call missing — Chromium path gone?');
  assert.ok(guardAt < callAt, 'feature detect must run before captureStream(5)');
});
