const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../server');

let server, baseUrl;

before(async () => {
  server = await startServer(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach — validation (400)', () => {
  test('no body → 400', async () => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('missing messages → 400', async () => {
    const res = await post('/api/coach', {});
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('empty messages array → 400', async () => {
    const res = await post('/api/coach', { messages: [] });
    assert.equal(res.status, 400);
  });

  test('invalid role → 400', async () => {
    const res = await post('/api/coach', {
      messages: [{ role: 'system', content: 'hello' }],
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('role'));
  });

  test('content too long → 400', async () => {
    const res = await post('/api/coach', {
      messages: [{ role: 'user', content: 'x'.repeat(12001) }],
    });
    assert.equal(res.status, 400);
  });

  test('message not an object → 400', async () => {
    const res = await post('/api/coach', { messages: ['string'] });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/coach — no API key (500)', () => {
  test('valid payload without ANTHROPIC_API_KEY → 500', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post('/api/coach', {
        messages: [{ role: 'user', content: 'How should I train today?' }],
      });
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.ok(body.error.includes('ANTHROPIC_API_KEY'));
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe('POST /api/generate-plan — fallback (no API key)', () => {
  test('no history + no API key → 200 with default plan', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post('/api/generate-plan', {
        workoutHistory: [],
        oneRMs: [],
        goals: 'strength',
        experience: 'intermediate',
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.plan.push && body.plan.pull && body.plan.legs);
      assert.ok(body.note);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test('default plan has exercises in all splits', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post('/api/generate-plan', { workoutHistory: [] });
      const body = await res.json();
      for (const split of ['push', 'pull', 'legs']) {
        assert.ok(Array.isArray(body.plan[split]) && body.plan[split].length > 0, `${split} missing exercises`);
      }
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe('POST /api/recommendations', () => {
  test('valid request → 200 with recommendations array', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post('/api/recommendations', {
        workout: { type: 'push', exercises: [] },
        fatigue: {},
        topLifts: [],
        nextSessionPlan: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 80 }],
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.recommendations));
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test('missing nextSessionPlan → 400', async () => {
    const res = await post('/api/recommendations', {
      workout: { type: 'push', exercises: [] },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });
});
