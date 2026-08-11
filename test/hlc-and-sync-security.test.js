import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { hlcNow, hlcReceive, hlcCompare, resetHLCState } from '../js/shared/hlc.js';
import { lwwWins } from '../js/shared/lww.js';
import syncRouter from '../routes/sync.js';

async function makeRequest(app, method, path, body) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, body: data };
  } finally {
    server.close();
  }
}

describe('Hybrid Logical Clock (HLC) Engine', () => {
  beforeEach(() => {
    resetHLCState();
  });

  test('hlcNow generates valid timestamp object', () => {
    const ts = hlcNow('node-1');
    assert.equal(typeof ts.l, 'number');
    assert.equal(typeof ts.c, 'number');
    assert.equal(ts.node, 'node-1');
    assert.ok(ts.l > 0);
    assert.equal(ts.c, 0);
  });

  test('hlcNow increments counter on rapid same-millisecond calls', () => {
    const ts1 = hlcNow('node-1');
    const ts2 = hlcNow('node-1');
    if (ts1.l === ts2.l) {
      assert.equal(ts2.c, ts1.c + 1);
    } else {
      assert.ok(ts2.l > ts1.l);
    }
  });

  test('hlcReceive advances clock to succeed remote skewed timestamp', () => {
    const futurePhysical = Date.now() + 600000; // 10 minutes in future
    const remoteHlc = { l: futurePhysical, c: 5, node: 'remote-skewed' };

    const advanced = hlcReceive(remoteHlc, 'local-node');
    assert.ok(advanced.l >= futurePhysical);
    assert.ok(advanced.c > 5 || advanced.l > futurePhysical);

    const nextLocal = hlcNow('local-node');
    assert.ok(hlcCompare(nextLocal, remoteHlc) > 0);
  });

  test('hlcCompare compares physical time, then counter, then node', () => {
    const a = { l: 100, c: 0, node: 'node-a' };
    const b = { l: 200, c: 0, node: 'node-a' };
    assert.ok(hlcCompare(a, b) < 0);
    assert.ok(hlcCompare(b, a) > 0);

    const c1 = { l: 100, c: 1, node: 'node-a' };
    const c2 = { l: 100, c: 2, node: 'node-a' };
    assert.ok(hlcCompare(c1, c2) < 0);
    assert.ok(hlcCompare(c2, c1) > 0);

    const n1 = { l: 100, c: 1, node: 'node-a' };
    const n2 = { l: 100, c: 1, node: 'node-b' };
    assert.ok(hlcCompare(n1, n2) < 0);
    assert.ok(hlcCompare(n2, n1) > 0);

    const eq = { l: 100, c: 1, node: 'node-a' };
    assert.equal(hlcCompare(eq, { ...eq }), 0);
  });

  test('Clock Skew Data Loss Resolution scenario', () => {
    // Device A (skewed +10 min) writes record R1
    const deviceAHlc = { l: Date.now() + 600000, c: 0, node: 'device-a-skewed' };
    const recordA = { id: 'rec-1', title: 'Device A Write', hlc: deviceAHlc, deviceId: 'device-a-skewed' };

    // Device B receives record A and advances its clock state via hlcReceive
    hlcReceive(recordA.hlc, 'device-b-normal');

    // Device B subsequently edits record R1
    const deviceBHlc = hlcNow('device-b-normal');
    const recordB = { id: 'rec-1', title: 'Device B Update', hlc: deviceBHlc, deviceId: 'device-b-normal' };

    // Assert Device B's write strictly wins over Device A's skewed write
    assert.ok(hlcCompare(recordB.hlc, recordA.hlc) > 0);
    assert.equal(lwwWins(recordB, recordA), true);
  });
});

describe('Backend Sync API Security & Zod Validation', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', syncRouter);

  test('POST /api/sync/push rejects non-object / invalid payloads with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', { invalidPayload: true });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
    assert.ok(Array.isArray(res.body.details));
  });

  test('POST /api/sync/push rejects unknown store names with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', { maliciousStore: [] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('POST /api/sync/push rejects non-array store records with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', { workouts: 'not an array' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('POST /api/sync/push accepts valid payload format with HTTP 200', async () => {
    const hlc = hlcNow('test-device');
    const res = await makeRequest(app, 'POST', '/api/sync/push', {
      workouts: [
        { id: 'w-101', type: 'push', timestamp: Date.now(), hlc, deviceId: 'test-device' }
      ]
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.merged, 'number');
  });
});
