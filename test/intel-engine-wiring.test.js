// @ts-check
/**
 * Guard: P.A.N.D.A. Core text requests follow the selected engine (card PC-1).
 *
 * Until 2026-08-29 the sheet's Claude/Gemini toggle was a dummy — chat, weekly
 * summary and biometrics all sent engine:'gemini' and read only gemini-key.
 * TTS stays on Gemini on purpose (routes/coach.js is pinned to gemini-tts).
 * This file keeps the wiring from sliding back to those three literals.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'intel.view.js'), 'utf8');

const ttsStart = SRC.indexOf('async function speakText');
const ttsEnd = SRC.indexOf('function pcmToWav');
assert.ok(ttsStart !== -1 && ttsEnd > ttsStart, 'speakText / pcmToWav anchors missing');
const tts = SRC.slice(ttsStart, ttsEnd);
const rest = SRC.slice(0, ttsStart) + SRC.slice(ttsEnd);

test("intel.view.js has no literal engine: 'gemini' — requests go through aiAuth()", () => {
  assert.equal(
    /engine:\s*['"]gemini['"]/.test(SRC),
    false,
    'литерал engine: gemini вернулся — выбранный движок снова не действует'
  );
});

test("gemini-key is read only inside TTS — text requests use the selected engine's key", () => {
  assert.match(
    tts,
    /gemini-key/,
    'TTS обязан читать gemini-key: routes/coach.js прошит на gemini-tts'
  );
  assert.equal(
    rest.includes("'gemini-key'") || rest.includes('"gemini-key"'),
    false,
    'чтение gemini-key вне speakText — снова игнорируется ключ выбранного движка'
  );
});
