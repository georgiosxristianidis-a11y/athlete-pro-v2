import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { coachSchema } from '../routes/coach.js';

const validMsg = { role: 'user', content: 'Hello coach' };

function parse(body) {
  return coachSchema.safeParse(body);
}

describe('coachSchema — body shape', () => {
  test('null body → rejected', () => {
    assert.equal(parse(null).success, false);
  });

  test('array body → rejected', () => {
    assert.equal(parse([validMsg]).success, false);
  });

  test('string body → rejected', () => {
    assert.equal(parse('hello').success, false);
  });

  test('missing messages field → rejected', () => {
    assert.equal(parse({}).success, false);
  });

  test('messages not an array → rejected', () => {
    assert.equal(parse({ messages: 'hi' }).success, false);
  });

  test('empty messages array → rejected', () => {
    assert.equal(parse({ messages: [] }).success, false);
  });

  test('more than 40 messages → rejected', () => {
    const messages = Array.from({ length: 41 }, () => validMsg);
    assert.equal(parse({ messages }).success, false);
  });

  test('exactly 40 messages → accepted', () => {
    const messages = Array.from({ length: 40 }, () => validMsg);
    assert.equal(parse({ messages }).success, true);
  });
});

describe('coachSchema — message items', () => {
  test('non-object message → rejected', () => {
    assert.equal(parse({ messages: ['hi'] }).success, false);
  });

  test('null message → rejected', () => {
    assert.equal(parse({ messages: [null] }).success, false);
  });

  test('invalid role → rejected', () => {
    const r = parse({ messages: [{ role: 'system', content: 'x' }] });
    assert.equal(r.success, false);
  });

  test('assistant role → accepted', () => {
    const r = parse({ messages: [{ role: 'assistant', content: 'x' }] });
    assert.equal(r.success, true);
  });

  test('non-string content → rejected', () => {
    const r = parse({ messages: [{ role: 'user', content: 42 }] });
    assert.equal(r.success, false);
  });

  test('empty content → rejected', () => {
    const r = parse({ messages: [{ role: 'user', content: '' }] });
    assert.equal(r.success, false);
  });

  test('content over 12000 chars → rejected', () => {
    const r = parse({ messages: [{ role: 'user', content: 'a'.repeat(12001) }] });
    assert.equal(r.success, false);
  });

  test('content exactly 12000 chars → accepted', () => {
    const r = parse({ messages: [{ role: 'user', content: 'a'.repeat(12000) }] });
    assert.equal(r.success, true);
  });

  test('bad message deep in array → rejected', () => {
    const r = parse({ messages: [validMsg, validMsg, { role: 'user', content: '' }] });
    assert.equal(r.success, false);
  });
});

describe('coachSchema — context fields and defaults', () => {
  test('minimal valid payload → accepted with defaults', () => {
    const r = parse({ messages: [validMsg] });
    assert.equal(r.success, true);
    assert.deepEqual(r.data.workouts, []);
    assert.deepEqual(r.data.topLifts, []);
    assert.deepEqual(r.data.images, []);
    assert.equal(r.data.engine, 'anthropic');
  });

  test('full valid payload → accepted', () => {
    const r = parse({
      messages: [validMsg],
      workouts: [{ type: 'push' }],
      fatigue: { chest: 40 },
      topLifts: [{ exercise: 'Bench', oneRM: 100 }],
      engine: 'gemini',
      customKey: 'k',
    });
    assert.equal(r.success, true);
    assert.equal(r.data.engine, 'gemini');
  });

  test('unknown extra fields are stripped, not fatal', () => {
    const r = parse({ messages: [validMsg], evil: 'payload' });
    assert.equal(r.success, true);
    assert.equal('evil' in r.data, false);
  });
});
