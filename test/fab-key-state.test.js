// @ts-check
/**
 * Guard: FAB key indicator follows probeAiStatus, not local BYOK (card PC-2).
 *
 * Until 2026-08-30 js/claude.view.js treated Gemini as "no key" unless
 * Settings held gemini-key, and Claude as always-on. Prod has a server
 * Gemini key and no Anthropic key — so the dot lied both ways.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fabGlowClass, fabKeyState } from '../js/ai-settings.store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const serverGemini = { gemini: true, anthropic: false, source: 'server' };
const serverNone = { gemini: false, anthropic: false, source: 'server' };
const airgap = { gemini: false, anthropic: false, source: 'airgap' };
const aiOff = { gemini: false, anthropic: false, source: 'ai-off' };
const offline = { gemini: false, anthropic: false, source: 'offline' };

describe('fabKeyState', () => {
  test('Cloud + server Gemini + empty BYOK → active (false-red fix)', () => {
    assert.equal(fabKeyState(serverGemini, false, 'gemini'), 'active');
    assert.equal(fabGlowClass('active', 'gemini'), '');
  });

  test('Claude without server or local key → missing (false-green fix)', () => {
    assert.equal(fabKeyState(serverGemini, false, 'anthropic'), 'missing');
    assert.equal(fabGlowClass('missing', 'anthropic'), 'ai-glow-error');
  });

  test('airgap and ai-off are their own state, not a red missing key', () => {
    assert.equal(fabKeyState(airgap, false, 'gemini'), 'airgap');
    assert.equal(fabKeyState(aiOff, false, 'gemini'), 'airgap');
    assert.equal(fabGlowClass('airgap', 'gemini'), '');
  });

  test('local BYOK on a live probe → active even if that engine is not on the server', () => {
    assert.equal(fabKeyState(serverGemini, true, 'anthropic'), 'active');
    assert.equal(fabGlowClass('active', 'anthropic'), 'ai-glow-selection');
  });

  test('local key while probe is offline → ready', () => {
    assert.equal(fabKeyState(offline, true, 'gemini'), 'ready');
    assert.equal(fabGlowClass('ready', 'gemini'), '');
  });

  test('offline / empty server and no local key → missing', () => {
    assert.equal(fabKeyState(offline, false, 'gemini'), 'missing');
    assert.equal(fabKeyState(serverNone, false, 'gemini'), 'missing');
  });
});

test('claude.view.js does not read gemini-key — probeAiStatus is the source of truth', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'claude.view.js'), 'utf8');
  assert.equal(
    src.includes("'gemini-key'") || src.includes('"gemini-key"'),
    false,
    'чтение gemini-key в FAB — серверный ключ снова невидим'
  );
});

test('.ai-indicator.ready and .airgap are real rules in base.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'base.css'), 'utf8');
  assert.match(
    css,
    /\.ai-indicator\.ready\s*\{/,
    '.ready class has no rule — the dot is invisible'
  );
  assert.match(css, /\.ai-indicator\.airgap\s*\{/, '.airgap class has no rule');
});
