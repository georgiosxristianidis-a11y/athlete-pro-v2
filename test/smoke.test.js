import test from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server.js';

test('smoke: GET / returns 200', async () => {
  const server = await startServer(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('smoke: /api/firebase-config returns configured false when missing env', async () => {
  const server = await startServer(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/firebase-config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.configured, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('smoke: /api/supabase-status returns not_configured when missing env', async () => {
  const server = await startServer(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/supabase-status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.available, false);
    assert.equal(body.reason, 'not_configured');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('smoke: GET /robots.txt returns 200 text/plain with proper directives', async () => {
  const server = await startServer(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/robots.txt`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/plain/);
    const body = await res.text();
    assert.match(body, /User-agent:\s*\*/);
    assert.match(body, /Allow:\s*\//);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
