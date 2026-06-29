import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server.js';
import { AIOrchestrator } from '../lib/aiOrchestrator.js';

let server, baseUrl;
const realStream = AIOrchestrator.streamResponse;

before(async () => {
  server = await startServer(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

// Restore the orchestrator after every test so stubs never leak across cases.
afterEach(() => { AIOrchestrator.streamResponse = realStream; });

function postCoach(body) {
  return fetch(`${baseUrl}/api/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { messages: [{ role: 'user', content: 'How should I train today?' }] };

describe('POST /api/coach — SSE happy path', () => {
  test('streams chunks then a [DONE] frame', async () => {
    AIOrchestrator.streamResponse = async ({ onChunk }) => {
      onChunk('Squat ');
      onChunk('heavy.');
    };

    const res = await postCoach(validBody);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    const text = await res.text();
    assert.match(text, /data: \{"text":"Squat "\}/);
    assert.match(text, /data: \{"text":"heavy\."\}/);
    assert.match(text, /data: \[DONE\]/);
  });
});

describe('POST /api/coach — mid-stream failure hardening', () => {
  test('error after first chunk → SSE error frame, no silent drop, no [DONE]', async () => {
    AIOrchestrator.streamResponse = async ({ onChunk }) => {
      onChunk('partial ');
      const err = new Error('upstream exploded');
      err.code = 'AI_TIMEOUT';
      throw err;
    };

    const res = await postCoach(validBody);
    // Headers already flushed as a stream, so the status stays 200.
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    const text = await res.text();
    assert.match(text, /data: \{"text":"partial "\}/);
    const errorFrame = text.match(/data: (\{"error".*\})/);
    assert.ok(errorFrame, 'expected a structured SSE error frame');
    const parsed = JSON.parse(errorFrame[1]);
    assert.equal(parsed.error, 'upstream exploded');
    assert.equal(parsed.code, 'AI_TIMEOUT');
    assert.doesNotMatch(text, /\[DONE\]/);
  });
});

describe('POST /api/coach — pre-stream failure keeps JSON 500 contract', () => {
  test('error before first byte → 500 JSON, not a broken stream', async () => {
    AIOrchestrator.streamResponse = async () => {
      const err = new Error('ANTHROPIC_API_KEY not set in .env');
      err.status = 500;
      err.code = 'NO_API_KEY';
      throw err;
    };

    const res = await postCoach(validBody);
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const body = await res.json();
    assert.equal(body.code, 'NO_API_KEY');
    assert.ok(body.error.includes('ANTHROPIC_API_KEY'));
  });
});
