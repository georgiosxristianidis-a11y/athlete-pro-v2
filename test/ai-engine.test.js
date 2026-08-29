import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_GEMINI_MODELS,
  DEFAULT_AI_ENGINE,
  DEFAULT_GEMINI_MODEL,
  resolveGeminiModel,
} from '../js/shared/ai-engine.js';

describe('ai-engine defaults', () => {
  test('unset engine is gemini', () => {
    assert.equal(DEFAULT_AI_ENGINE, 'gemini');
  });

  test('coach model is 3.6-flash unless env names an allowed preview', () => {
    assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.6-flash');
    assert.deepEqual(ALLOWED_GEMINI_MODELS, ['gemini-3.6-flash', 'gemini-3.1-pro-preview']);
    assert.equal(resolveGeminiModel(undefined), 'gemini-3.6-flash');
    assert.equal(resolveGeminiModel('gemini-3.1-pro-preview'), 'gemini-3.1-pro-preview');
    assert.equal(resolveGeminiModel('gemini-2.5-flash'), 'gemini-3.6-flash');
    assert.equal(resolveGeminiModel('gemini-3-flash'), 'gemini-3.6-flash');
  });
});
