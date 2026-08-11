import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { hlcNow, hlcReceive, hlcCompare, resetHLCState } from '../js/shared/hlc.js';
import { lwwWins } from '../js/shared/lww.js';
import syncRouter from '../routes/sync.js';

// Helper to make HTTP requests against express instance matching server.js middleware configuration
async function makeRequest(app, method, path, body, rawBody = null, contentType = 'application/json') {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const headers = {};
    if (contentType) headers['Content-Type'] = contentType;
    
    let payload = undefined;
    if (rawBody !== null) {
      payload = rawBody;
    } else if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: payload
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, body: data };
  } finally {
    server.close();
  }
}

describe('Challenger 1 Stress Verification: HLC Engine Monotonicity', () => {
  let originalDateNow;

  beforeEach(() => {
    resetHLCState();
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
    resetHLCState();
  });

  test('HLC Monotonicity under Clock Skew +1 Hour (Forward Jump)', () => {
    let mockTime = 1700000000000;
    Date.now = () => mockTime;

    const t1 = hlcNow('node-a');
    assert.equal(t1.l, 1700000000000);
    assert.equal(t1.c, 0);

    // Forward jump by 1 hour (3600000 ms)
    mockTime += 3600000;
    const t2 = hlcNow('node-a');
    assert.equal(t2.l, 1700000000000 + 3600000);
    assert.equal(t2.c, 0);
    assert.ok(hlcCompare(t2, t1) > 0, 't2 must strictly succeed t1 after +1h jump');

    // Rapid writes at new skewed time
    const t3 = hlcNow('node-a');
    assert.equal(t3.l, t2.l);
    assert.equal(t3.c, 1);
    assert.ok(hlcCompare(t3, t2) > 0, 't3 counter increment must succeed t2');
  });

  test('HLC Monotonicity under Clock Skew -1 Hour (Backward Jump / NTP Correction)', () => {
    let mockTime = 1700000000000;
    Date.now = () => mockTime;

    // Advanced state at time T
    const t1 = hlcNow('node-a');
    assert.equal(t1.l, 1700000000000);

    // Physical clock jumps BACKWARDS by 1 hour (3600000 ms)
    mockTime -= 3600000;
    assert.equal(Date.now(), 1700000000000 - 3600000);

    // Next write must NOT regress stateL; counter must increment
    const t2 = hlcNow('node-a');
    assert.equal(t2.l, 1700000000000, 'Physical clock regression must not cause stateL regression');
    assert.equal(t2.c, 1);
    assert.ok(hlcCompare(t2, t1) > 0, 't2 must strictly succeed t1 despite backward clock skew');

    // 100 consecutive writes while physical clock remains skewed in past
    let last = t2;
    for (let i = 0; i < 100; i++) {
      const next = hlcNow('node-a');
      assert.equal(next.l, 1700000000000);
      assert.equal(next.c, 2 + i);
      assert.ok(hlcCompare(next, last) > 0, `Write ${i} must be strictly monotonic`);
      last = next;
    }

    // Eventually physical clock advances past previous peak
    mockTime += 3600000 + 5000;
    const tRecovery = hlcNow('node-a');
    assert.equal(tRecovery.l, 1700000000000 + 5000);
    assert.equal(tRecovery.c, 0);
    assert.ok(hlcCompare(tRecovery, last) > 0, 'Recovery write past old peak must succeed all prior writes');
  });

  test('HLC Monotonicity under Frozen Physical Clock (Time Plateau)', () => {
    const freezeTime = 1700000000000;
    Date.now = () => freezeTime;

    let previous = hlcNow('node-a');
    assert.equal(previous.l, freezeTime);
    assert.equal(previous.c, 0);

    // Perform 1,000 rapid writes on a frozen clock
    for (let i = 1; i <= 1000; i++) {
      const current = hlcNow('node-a');
      assert.equal(current.l, freezeTime);
      assert.equal(current.c, i);
      assert.ok(hlcCompare(current, previous) > 0, `Iteration ${i} must strictly exceed previous timestamp`);
      previous = current;
    }
  });

  test('Multi-Node Interleaved Clock Skew Causality Chain', () => {
    let physicalTimeA = 100000;
    let physicalTimeB = 100000 + 3600000; // Node B skewed +1h
    let physicalTimeC = 100000 - 1800000; // Node C skewed -30m

    // Node A writes R1
    Date.now = () => physicalTimeA;
    resetHLCState();
    const hlcA1 = hlcNow('node-a');

    // Node B receives R1 and writes R2
    Date.now = () => physicalTimeB;
    resetHLCState();
    hlcReceive(hlcA1, 'node-b');
    const hlcB1 = hlcNow('node-b');

    // Node C receives R2 and writes R3 (despite backward physical clock)
    Date.now = () => physicalTimeC;
    resetHLCState();
    hlcReceive(hlcB1, 'node-c');
    const hlcC1 = hlcNow('node-c');

    // Node A receives R3 and writes R4
    Date.now = () => physicalTimeA + 10;
    resetHLCState();
    hlcReceive(hlcC1, 'node-a');
    const hlcA2 = hlcNow('node-a');

    // Assert strict monotonic chain: hlcA1 < hlcB1 < hlcC1 < hlcA2
    assert.ok(hlcCompare(hlcB1, hlcA1) > 0, 'Node B write must succeed Node A write');
    assert.ok(hlcCompare(hlcC1, hlcB1) > 0, 'Node C write must succeed Node B write despite negative clock skew');
    assert.ok(hlcCompare(hlcA2, hlcC1) > 0, 'Node A write must succeed Node C write after causal reception');

    // Verify LWW decisions
    assert.equal(lwwWins({ hlc: hlcB1 }, { hlc: hlcA1 }), true);
    assert.equal(lwwWins({ hlc: hlcC1 }, { hlc: hlcB1 }), true);
    assert.equal(lwwWins({ hlc: hlcA2 }, { hlc: hlcC1 }), true);
  });
});

describe('Challenger 1 Stress Verification: Backend POST /api/sync/push Zod & Malformed Payload Security', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', syncRouter);
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    res.status(500).json({ error: err.message });
  });

  test('Rejects string body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, '"just a string"');
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'Should return error property');
  });

  test('Rejects numeric body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, '12345');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('Rejects boolean body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, 'true');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('Rejects null body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, 'null');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('Rejects top-level array body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', []);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('Rejects array of objects body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', [{ workouts: [] }]);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('Rejects numeric keys in object body with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', { 123: [] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('Rejects deeply nested invalid objects inside store payload with HTTP 400', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', {
      workouts: { deeply: { nested: { object: [] } } }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('Rejects invalid record HLC attributes (negative timestamp, non-integer counter, empty node) with HTTP 400', async () => {
    // Negative timestamp l
    const res1 = await makeRequest(app, 'POST', '/api/sync/push', {
      workouts: [{ id: 'w1', hlc: { l: -10, c: 0, node: 'n1' } }]
    });
    assert.equal(res1.status, 400);

    // Non-integer counter c
    const res2 = await makeRequest(app, 'POST', '/api/sync/push', {
      workouts: [{ id: 'w1', hlc: { l: 100, c: 2.5, node: 'n1' } }]
    });
    assert.equal(res2.status, 400);

    // Empty node string
    const res3 = await makeRequest(app, 'POST', '/api/sync/push', {
      workouts: [{ id: 'w1', hlc: { l: 100, c: 0, node: '' } }]
    });
    assert.equal(res3.status, 400);
  });

  test('Rejects Prototype Pollution payloads containing __proto__ with HTTP 400', async () => {
    const rawPayload = '{"__proto__": {"admin": true}, "workouts": []}';
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, rawPayload);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
    assert.equal(({}).admin, undefined, 'Object.prototype must not be polluted');
  });

  test('Rejects Prototype Pollution payloads containing constructor/prototype with HTTP 400', async () => {
    const rawPayload = '{"constructor": {"prototype": {"admin": true}}, "workouts": []}';
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, rawPayload);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid sync payload format');
  });

  test('Rejects syntactically malformed JSON string with HTTP 400 without crashing', async () => {
    const res = await makeRequest(app, 'POST', '/api/sync/push', undefined, '{ "workouts": [');
    assert.equal(res.status, 400);
  });
});
