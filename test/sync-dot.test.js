import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveDotState } from '../js/shared/sync-dot.js';

const base = { mode: 'cloud', online: true, syncStatus: 'idle', cloudConfigured: true };

test('airgap mode hides the dot regardless of everything else', () => {
  assert.equal(deriveDotState({ ...base, mode: 'airgap' }), 'airgap');
  assert.equal(deriveDotState({ mode: 'airgap', online: false, syncStatus: 'syncing', cloudConfigured: false }), 'airgap');
});

test('offline when navigator is offline', () => {
  assert.equal(deriveDotState({ ...base, online: false }), 'offline');
});

test('offline when sync reports offline even if navigator online', () => {
  assert.equal(deriveDotState({ ...base, syncStatus: 'offline' }), 'offline');
});

test('connectivity loss outranks syncing/error', () => {
  assert.equal(deriveDotState({ ...base, online: false, syncStatus: 'syncing' }), 'offline');
  assert.equal(deriveDotState({ ...base, online: false, syncStatus: 'error' }), 'offline');
});

test('syncing while online', () => {
  assert.equal(deriveDotState({ ...base, syncStatus: 'syncing' }), 'syncing');
});

test('error while online', () => {
  assert.equal(deriveDotState({ ...base, syncStatus: 'error' }), 'error');
});

test('no-cloud when permitted but Supabase not configured', () => {
  assert.equal(deriveDotState({ ...base, cloudConfigured: false }), 'no-cloud');
  // anon mode behaves like cloud for the dot
  assert.equal(deriveDotState({ ...base, mode: 'anon', cloudConfigured: false }), 'no-cloud');
});

test('synced: cloud configured, online, idle', () => {
  assert.equal(deriveDotState(base), 'synced');
  assert.equal(deriveDotState({ ...base, mode: 'anon' }), 'synced');
  assert.equal(deriveDotState({ ...base, syncStatus: 'idle' }), 'synced');
});
