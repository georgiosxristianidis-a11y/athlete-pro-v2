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

/* Карточка VOICE-1. Сырое `customKey: await DB.Settings.get('gemini-key')`
   отправляло в тело null, когда ключ не сохранён, а ttsSchema принимает
   строку — запрос умирал 400-м, не дойдя до серверного ключа. Значение
   обязано схлопываться в undefined: JSON.stringify выбросит поле сам. */
test('TTS never sends a raw null customKey — no key means no field', () => {
  const line = tts.split('\n').find((l) => l.includes('customKey:'));
  assert.ok(line, 'поле customKey исчезло из тела запроса TTS');
  assert.doesNotMatch(
    line,
    /customKey:\s*await/,
    'сырое чтение ключа прямо в теле — вернулся null → 400 на пустом gemini-key'
  );
  assert.match(
    line,
    /undefined/,
    'отсутствующий ключ обязан становиться undefined, иначе схема режет запрос'
  );
});

test('P.A.N.D.A. Core coach requests go through safeFetch kind=ai, not raw fetch', () => {
  assert.match(
    SRC,
    /import\s*\{[^}]*\bsafeFetch\b[^}]*\}\s*from\s*['"]\.\/privacy\.store\.js['"]/,
    'intel.view.js must import safeFetch — raw fetch bypasses the AI privacy gate'
  );
  assert.equal(
    /(?<!safe)fetch\(\s*['"`]\/api\/coach/.test(SRC),
    false,
    'raw fetch(/api/coach…) leaks workouts after the user turns AI off'
  );
  const calls = SRC.split('safeFetch(').slice(1);
  assert.equal(calls.length, 4, 'chat, tts, weekly, biometrics — each one safeFetch');
  const paths = [
    '/api/coach',
    '/api/coach/tts',
    '/api/coach/weekly-report',
    '/api/coach/biometrics-scan',
  ];
  for (const path of paths) {
    const hit = calls.find((c) => c.includes(`'${path}'`) || c.includes(`"${path}"`));
    assert.ok(hit, `${path} must go through safeFetch`);
    assert.match(hit, /['"]ai['"]/, `${path} must pass kind 'ai'`);
  }
});

test('P.A.N.D.A. Core SSE uses the carry-buffer parser, not per-chunk split', () => {
  assert.match(SRC, /appendSseChunk/);
  assert.match(SRC, /parseSseDataLine/);
  const submit = SRC.slice(
    SRC.indexOf('async function submit'),
    SRC.indexOf('function _clearImage')
  );
  assert.equal(
    submit.includes("chunk.split('\\n')"),
    false,
    'naive per-chunk split вернулся — разорванный SSE-кадр снова теряет текст'
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
