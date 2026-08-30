import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server.js';

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
    assert.ok(body.error);
    assert.ok(JSON.stringify(body.details).includes('role'));
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
        engine: 'anthropic',
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

describe('POST /api/coach/generate-plan — fallback (no API key)', () => {
  test('no history + no API key → 200 with default plan', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post('/api/coach/generate-plan', {
        engine: 'anthropic',
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
      const res = await post('/api/coach/generate-plan', {
        engine: 'anthropic',
        workoutHistory: [],
      });
      const body = await res.json();
      for (const split of ['push', 'pull', 'legs']) {
        assert.ok(
          Array.isArray(body.plan[split]) && body.plan[split].length > 0,
          `${split} missing exercises`
        );
      }
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe('POST /api/coach/recommendations', () => {
  test('valid request → 200 with recommendations array', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post('/api/coach/recommendations', {
        engine: 'anthropic',
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
    const res = await post('/api/coach/recommendations', {
      workout: { type: 'push', exercises: [] },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });
});

describe('POST /api/coach/weekly-report — fallback when AI fails', () => {
  test('empty workouts + invalid BYOK → 200 with zero-score fallback', async () => {
    const res = await post('/api/coach/weekly-report', {
      engine: 'gemini',
      workouts: [],
      profile: {},
      customKey: 'not-a-real-key',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.report.score, 0);
    assert.ok(Array.isArray(body.report.pros));
    assert.ok(body.warning);
  });

  test('invalid customKey with sessions → 200 fallback, not 400', async () => {
    const res = await post('/api/coach/weekly-report', {
      engine: 'gemini',
      workouts: [{ type: 'push', date: new Date().toISOString() }],
      profile: {},
      customKey: 'not-a-real-key',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.report.score >= 0);
  });
});
