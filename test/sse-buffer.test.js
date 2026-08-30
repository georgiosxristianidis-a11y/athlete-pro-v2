import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendSseChunk, parseSseDataLine } from '../js/shared/sse.js';

describe('appendSseChunk — split frames', () => {
  test('a line split across two TCP chunks is reassembled', () => {
    const first = appendSseChunk('', 'data: {"text":"hel');
    assert.deepEqual(first.lines, []);
    assert.equal(first.buffer, 'data: {"text":"hel');

    const second = appendSseChunk(first.buffer, 'lo"}\n');
    assert.equal(second.buffer, '');
    assert.equal(second.lines.length, 1);
    assert.deepEqual(parseSseDataLine(second.lines[0]), { text: 'hello' });
  });

  test('complete line in one chunk leaves an empty buffer', () => {
    const out = appendSseChunk('', 'data: {"text":"ok"}\n');
    assert.equal(out.buffer, '');
    assert.deepEqual(parseSseDataLine(out.lines[0]), { text: 'ok' });
  });
});

describe('parseSseDataLine', () => {
  test('[DONE] ends the stream', () => {
    assert.deepEqual(parseSseDataLine('data: [DONE]'), { done: true });
  });

  test('mid-stream error is not silent', () => {
    assert.deepEqual(parseSseDataLine('data: {"error":"AI_TIMEOUT"}'), {
      error: 'AI_TIMEOUT',
      requestId: undefined,
    });
  });

  test('non-data lines are ignored', () => {
    assert.equal(parseSseDataLine(': keep-alive'), null);
    assert.equal(parseSseDataLine(''), null);
  });

  test('broken JSON on a complete line does not throw', () => {
    assert.equal(parseSseDataLine('data: {not json'), null);
  });
});
