import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiStatus, hasServerCoach, probeAiStatus } from '../js/shared/ai-status.js';

describe('classifyAiStatus', () => {
  test('200 with keys is server', () => {
    const out = classifyAiStatus(200, { gemini: false, anthropic: true });
    assert.deepEqual(out, { gemini: false, anthropic: true, source: 'server' });
    assert.equal(hasServerCoach(out), true);
  });

  test('200 with both false is server, not ready', () => {
    const out = classifyAiStatus(200, { gemini: false, anthropic: false });
    assert.equal(out.source, 'server');
    assert.equal(hasServerCoach(out), false);
  });

  test('SW airgap 503 is airgap, not offline', () => {
    const out = classifyAiStatus(503, { error: 'air-gapped: network blocked', code: 'airgap' });
    assert.equal(out.source, 'airgap');
    assert.equal(hasServerCoach(out), false);
  });

  test('plain 503 without airgap code is offline', () => {
    const out = classifyAiStatus(503, { error: 'network error' });
    assert.equal(out.source, 'offline');
  });

  test('PrivacyBlockedError airgap from safeFetch', () => {
    const err = new Error('Network blocked in air-gapped mode');
    err.name = 'PrivacyBlockedError';
    // @ts-ignore
    err.code = 'airgap';
    assert.equal(classifyAiStatus(null, null, err).source, 'airgap');
  });

  test('PrivacyBlockedError ai-off', () => {
    const err = new Error('AI Coach is disabled');
    err.name = 'PrivacyBlockedError';
    // @ts-ignore
    err.code = 'ai-off';
    assert.equal(classifyAiStatus(null, null, err).source, 'ai-off');
  });

  test('generic throw is offline', () => {
    assert.equal(classifyAiStatus(null, null, new Error('Failed to fetch')).source, 'offline');
  });
});

describe('probeAiStatus', () => {
  test('reads json from a 200 response', async () => {
    const out = await probeAiStatus(
      async () =>
        new Response(JSON.stringify({ gemini: true, anthropic: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    assert.deepEqual(out, { gemini: true, anthropic: false, source: 'server' });
  });

  test('does not throw on airgap 503', async () => {
    const out = await probeAiStatus(
      async () =>
        new Response(JSON.stringify({ error: 'air-gapped: network blocked', code: 'airgap' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    assert.equal(out.source, 'airgap');
  });

  test('maps fetcher throw to offline, no console path', async () => {
    const out = await probeAiStatus(async () => {
      throw new Error('Failed to fetch');
    });
    assert.equal(out.source, 'offline');
  });
});
