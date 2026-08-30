/**
 * Voice HUD replaces the center ERROR/status log pill on s-intel.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const view = fs.readFileSync(path.join(ROOT, 'js', 'intel.view.js'), 'utf8');
const settings = fs.readFileSync(path.join(ROOT, 'js', 'ai-settings.view.js'), 'utf8');

describe('intel voice HUD markup', () => {
  test('load() mounts active voice pill, not streaming status pill', () => {
    const start = view.indexOf('async function load()');
    const end = view.indexOf('function renderLogs()');
    const body = view.slice(start, end);
    assert.match(body, /intel-voice-hud/);
    assert.match(body, /intel-voice-hud-label/);
    assert.match(body, /intel:replayVoice/);
    assert.equal(body.includes('intel-logs-status-pill'), false);
    assert.equal(body.includes('data-action="intel:toggleLogs"'), false);
  });

  test('debug logs moved to AI settings sheet', () => {
    assert.match(settings, /intel-settings-debug/);
    assert.match(settings, /id="intel-logs-container"/);
    assert.match(settings, /import\('\.\/intel\.view\.js'\)\)\.renderIntelLogs\(\)/);
  });

  test('speakText and replayVoice are wired', () => {
    assert.match(view, /async function speakText/);
    assert.match(view, /function replayVoice/);
    assert.match(view, /fetch\('\/api\/coach\/tts'/);
  });
});
