import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

import { lwwWins } from '../js/shared/lww.js';

let db;
before(async () => {
  // db.js is importable under Node: crypto Worker is lazy, IDB opens on demand
  db = await import('../js/db.js');
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId — decentralized record ids', () => {
  test('produces RFC4122 v4 UUIDs', () => {
    assert.match(db.newId(), UUID_RE);
  });

  test('1000 ids are unique', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(db.newId());
    assert.equal(ids.size, 1000);
  });
});

describe('getDeviceId — stable installation identity', () => {
  test('non-empty and stable across calls', () => {
    const a = db.getDeviceId();
    const b = db.getDeviceId();
    assert.ok(a.length > 0);
    assert.equal(a, b);
  });
});

describe('withMeta — CRDT stamping', () => {
  test('assigns UUID id when missing', () => {
    const rec = db.withMeta({ type: 'push' });
    assert.match(String(rec.id), UUID_RE);
  });

  test('preserves legacy integer id', () => {
    const rec = db.withMeta({ id: 42, type: 'pull' });
    assert.equal(rec.id, 42);
  });

  test('preserves existing UUID id', () => {
    const id = db.newId();
    const rec = db.withMeta({ id });
    assert.equal(rec.id, id);
  });

  test('stamps updatedAt and deviceId', () => {
    const before = Date.now();
    const rec = db.withMeta({});
    assert.ok(rec.updatedAt >= before);
    assert.equal(rec.deviceId, db.getDeviceId());
  });

  test('refreshes updatedAt on rewrite (LWW requirement)', async () => {
    const rec = db.withMeta({});
    const first = rec.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    db.withMeta(rec);
    assert.ok(rec.updatedAt > first);
  });
});

describe('lwwWins — two-device conflict resolution', () => {
  const A = { updatedAt: 100, deviceId: 'device-a' };
  const B = { updatedAt: 200, deviceId: 'device-b' };

  test('newer local wins', () => {
    assert.equal(lwwWins(B, A), true);
  });

  test('newer remote wins', () => {
    assert.equal(lwwWins(A, B), false);
  });

  test('equal timestamps → deviceId tiebreak is deterministic', () => {
    const x = { updatedAt: 500, deviceId: 'device-a' };
    const y = { updatedAt: 500, deviceId: 'device-b' };
    assert.equal(lwwWins(x, y), !lwwWins(y, x));
  });

  test('both replicas agree on the same winner (no split-brain)', () => {
    const x = { updatedAt: 500, deviceId: 'device-a' };
    const y = { updatedAt: 500, deviceId: 'device-b' };
    // Device X asks: does my local x beat remote y? Device Y asks the mirror.
    const xThinksXWins = lwwWins(x, y);
    const yThinksYWins = lwwWins(y, x);
    assert.equal(xThinksXWins !== yThinksYWins, true);
  });

  test('falls back to timestamp field for legacy records', () => {
    const legacy = { timestamp: 300, deviceId: 'old' };
    const fresh = { updatedAt: 400, deviceId: 'new' };
    assert.equal(lwwWins(fresh, legacy), true);
    assert.equal(lwwWins(legacy, fresh), false);
  });

  test('identical meta → local does not win (stable, idempotent sync)', () => {
    const same = { updatedAt: 500, deviceId: 'device-a' };
    assert.equal(lwwWins(same, { ...same }), false);
  });
});

describe('two-device merge scenario (queue semantics)', () => {
  test('concurrent edits of same record converge to single winner', () => {
    const recordId = db.newId();
    const deviceA = { id: recordId, weight: 100, updatedAt: 1000, deviceId: 'aaa' };
    const deviceB = { id: recordId, weight: 105, updatedAt: 1000, deviceId: 'bbb' };

    const winnerOnA = lwwWins(deviceA, deviceB) ? deviceA : deviceB;
    const winnerOnB = lwwWins(deviceB, deviceA) ? deviceB : deviceA;
    assert.deepEqual(winnerOnA, winnerOnB);
    assert.equal(winnerOnA.weight, 105); // 'bbb' > 'aaa'
  });
});
