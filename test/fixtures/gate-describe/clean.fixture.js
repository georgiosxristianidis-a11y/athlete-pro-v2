// Фикстура GATE-DESCRIBE: чистая сюита — обёртка обязана дать exit 0.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('clean', () => {
  it('passes', () => {
    assert.equal(1 + 1, 2);
  });
});
