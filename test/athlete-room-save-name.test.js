// @ts-check
// F-1 AR-SAVE-CRASH — test-guard remainder (HANDOFF_gym_grade.md).
// The dynamic-import crash itself is fixed (1.25.12) and covered by
// test/import-guard.test.js (static guard on all import()s in js/shared/).
// This file covers the two pieces still open: saveName() writes all three
// fields without throwing, and the write order is updateProfile() BEFORE
// the 'athlete-name' Settings write (so a rejected write can't leave name
// persisted with dob/sex missing — the original AR-SAVE-CRASH symptom).
//
// Uses the real DB (fake-indexeddb) + real profile.store.js, not mocks:
// same pattern as test/db-soft-delete.test.js. A hand-rolled DOM only for
// the few elements saveName() actually touches (see test/rest-timer-pip.test.js
// for the same minimal-stub approach).

import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const _els = new Map();
function makeEl(id, initial = {}) {
  const el = {
    id,
    value: '',
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    ...initial,
  };
  _els.set(id, el);
  return el;
}

// events.js / utils.js wire up document/window listeners at import time —
// globals must exist before athlete-room.js (and its imports) are loaded.
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  body: { style: {} },
  getElementById: (id) => _els.get(id) || null,
};
Object.defineProperty(globalThis, 'window', {
  value: {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    Toast: { show() {} },
  },
  writable: true,
  configurable: true,
});

const { DB } = await import('../js/db.js');
const { loadProfile } = await import('../js/profile.store.js');
const { AthleteRoom } = await import('../js/shared/athlete-room.js');

function fillEditor({ name, sex, dobY, dobM, dobD }) {
  makeEl('athlete-room');
  makeEl('ar-tab-content');
  makeEl('ar-name-editor');
  makeEl('ar-name-input', { value: name });
  makeEl('ar-sex-input', { value: sex });
  makeEl('ar-dob-y', { value: dobY });
  makeEl('ar-dob-m', { value: dobM });
  makeEl('ar-dob-d', { value: dobD });
}

before(async () => { await DB.clearAll(); });
afterEach(async () => { await DB.clearAll(); });

describe('AthleteRoom.saveName() — F-1 test-guard remainder', () => {
  test('writes name, dob and sex without throwing', async () => {
    fillEditor({ name: 'Georgios', sex: 'f', dobY: '1990', dobM: '05', dobD: '20' });

    await AthleteRoom.open();
    await assert.doesNotReject(() => AthleteRoom.saveName());

    const profile = await loadProfile();
    assert.equal(profile.name, 'Georgios');
    assert.equal(profile.dob, '1990-05-20');
    assert.equal(profile.sex, 'f');
  });

  test('empty name: does not throw, dob/sex still persist', async () => {
    fillEditor({ name: '', sex: 'm', dobY: '1985', dobM: '01', dobD: '01' });

    await AthleteRoom.open();
    await assert.doesNotReject(() => AthleteRoom.saveName());

    const profile = await loadProfile();
    assert.equal(profile.name, '');
    assert.equal(profile.dob, '1985-01-01');
    assert.equal(profile.sex, 'm');
  });

  test('write order: updateProfile (profile.dob) lands before the athlete-name Settings write', async (t) => {
    fillEditor({ name: 'Order Check', sex: 'm', dobY: '2000', dobM: '06', dobD: '15' });
    await AthleteRoom.open();

    const setSpy = t.mock.method(DB.Settings, 'set');
    await AthleteRoom.saveName();

    const order = setSpy.mock.calls.map((c) => c.arguments[0]);
    const dobIdx = order.indexOf('profile.dob');
    const nameSettingIdx = order.indexOf('athlete-name');
    assert.notEqual(dobIdx, -1, `expected a 'profile.dob' write, got: ${order.join(', ')}`);
    assert.notEqual(nameSettingIdx, -1, `expected an 'athlete-name' write, got: ${order.join(', ')}`);
    assert.ok(
      dobIdx < nameSettingIdx,
      `updateProfile() must be called before the 'athlete-name' write (regression class: partial write if the later call rejects) — got order: ${order.join(', ')}`
    );
  });
});
