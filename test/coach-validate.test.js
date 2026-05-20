const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { _validateCoachPayload: validate } = require('../routes/coach');

const validMsg = { role: 'user', content: 'Hello coach' };

describe('_validateCoachPayload — body shape', () => {
  test('null body → body_type error', () => {
    const r = validate(null);
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'body_type');
    assert.equal(r.code, 400);
  });

  test('array body → body_type error', () => {
    const r = validate([validMsg]);
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'body_type');
  });

  test('string body → body_type error', () => {
    const r = validate('hello');
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'body_type');
  });

  test('missing messages field → messages_type error', () => {
    const r = validate({});
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'messages_type');
  });

  test('messages is not array → messages_type error', () => {
    const r = validate({ messages: 'hi' });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'messages_type');
  });
});

describe('_validateCoachPayload — messages array', () => {
  test('empty messages array → messages_empty error', () => {
    const r = validate({ messages: [] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'messages_empty');
  });

  test('too many messages → messages_limit error', () => {
    const msgs = Array.from({ length: 41 }, () => ({ ...validMsg }));
    const r = validate({ messages: msgs });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'messages_limit');
  });

  test('exactly 40 messages → ok', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x',
    }));
    const r = validate({ messages: msgs });
    assert.equal(r.ok, true);
  });
});

describe('_validateCoachPayload — message shape', () => {
  test('message is not object → message_shape error', () => {
    const r = validate({ messages: ['string'] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_shape');
  });

  test('message is array → message_shape error', () => {
    const r = validate({ messages: [[validMsg]] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_shape');
  });

  test('invalid role → message_role error', () => {
    const r = validate({ messages: [{ role: 'system', content: 'x' }] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_role');
  });

  test('missing role → message_role error', () => {
    const r = validate({ messages: [{ content: 'x' }] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_role');
  });

  test('content not a string → message_content_type error', () => {
    const r = validate({ messages: [{ role: 'user', content: 123 }] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_content_type');
  });

  test('empty content → message_content_length error', () => {
    const r = validate({ messages: [{ role: 'user', content: '' }] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_content_length');
  });

  test('content over 12000 chars → message_content_length error', () => {
    const r = validate({ messages: [{ role: 'user', content: 'x'.repeat(12001) }] });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_content_length');
  });

  test('content exactly 12000 chars → ok', () => {
    const r = validate({ messages: [{ role: 'user', content: 'x'.repeat(12000) }] });
    assert.equal(r.ok, true);
  });
});

describe('_validateCoachPayload — valid payloads', () => {
  test('single user message → ok', () => {
    const r = validate({ messages: [validMsg] });
    assert.equal(r.ok, true);
  });

  test('user + assistant turn → ok', () => {
    const r = validate({
      messages: [
        { role: 'user', content: 'How should I train?' },
        { role: 'assistant', content: 'Start with compounds.' },
      ],
    });
    assert.equal(r.ok, true);
  });

  test('error on second invalid message reports correct index', () => {
    const r = validate({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'robot', content: 'Hi' },
      ],
    });
    assert.equal(r.ok, false);
    assert.equal(r.detail, 'message_role');
    assert.ok(r.error.includes('messages[1]'));
  });
});
