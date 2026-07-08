import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage + window stubs so the store runs under node --test.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let lastEvent = null;
globalThis.window = {
  dispatchEvent: (e) => { lastEvent = e; return true; },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const { getIslandProfile, setIslandProfile, ISLAND_PROFILES } =
  await import('../js/island-profile.store.js');

describe('island-profile.store', () => {
  beforeEach(() => { store.clear(); lastEvent = null; });

  test('defaults to minimal when unset', () => {
    assert.equal(getIslandProfile(), 'minimal');
  });

  test('persists a valid profile', () => {
    setIslandProfile('apple');
    assert.equal(store.get('ap-island-profile'), 'apple');
    assert.equal(getIslandProfile(), 'apple');
  });

  test('round-trips both known profiles', () => {
    for (const p of ISLAND_PROFILES) {
      setIslandProfile(p);
      assert.equal(getIslandProfile(), p);
    }
  });

  test('rejects an unknown profile (no write, no event)', () => {
    setIslandProfile('bogus');
    assert.equal(store.has('ap-island-profile'), false);
    assert.equal(lastEvent, null);
    assert.equal(getIslandProfile(), 'minimal');
  });

  test('falls back to minimal for a corrupted stored value', () => {
    store.set('ap-island-profile', 'garbage');
    assert.equal(getIslandProfile(), 'minimal');
  });

  test('emits ap-island-profile on a valid change', () => {
    setIslandProfile('apple');
    assert.equal(lastEvent?.type, 'ap-island-profile');
    assert.equal(lastEvent?.detail?.profile, 'apple');
  });
});
