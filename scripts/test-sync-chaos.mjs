#!/usr/bin/env node
/**
 * scripts/test-sync-chaos.mjs
 * 
 * Requirement R4: E2E Chaos Verification Harness
 * Tests Backend Server Lifecycle, Clock Skew HLC Resolution, Jittered Backoff & Mutex,
 * Zod Payload Security Rejection, and UI Motion Budget & Haptic Suppression.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server.js';
import { hlcNow, hlcReceive, hlcCompare, resetHLCState } from '../js/shared/hlc.js';
import { lwwWins } from '../js/shared/lww.js';
import {
  calculateBackoffDelay,
  runSync,
  getIsSyncing,
  getRetryCount,
  resetSyncState,
  BACKOFF_CONFIG
} from '../js/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function logPass(title, details = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✔ [PASS] ${title}${details ? ` (${details})` : ''}`);
}

function logFail(title, error) {
  totalTests++;
  console.error(`  ✖ [FAIL] ${title}`);
  console.error(error);
}

async function runChaosVerification() {
  console.log('====================================================');
  console.log(' P.A.N.D.A Core Elite Audit Resolution Plan — R4 Chaos Verification');
  console.log('====================================================\n');

  let server = null;
  let baseUrl = '';

  try {
    // ── 1. Backend Server Lifecycle & Local Spin Up
    console.log('1. Server Lifecycle Management');
    server = await startServer(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    assert.ok(port > 0, 'Server port must be greater than 0');

    // Health check GET /api/sync/pull
    const initialPull = await fetch(`${baseUrl}/api/sync/pull?since=0`);
    assert.equal(initialPull.status, 200, 'Initial pull response should be HTTP 200');
    const initialData = await initialPull.json();
    assert.equal(initialData.success, true, 'Initial pull success field should be true');
    logPass('Spin up Express server locally', `Listening on port ${port}`);

    // ── 2. Clock Skew Simulation & HLC Causality Assertions
    console.log('\n2. Clock Skew Simulation & HLC Causality');
    resetHLCState();

    const realTime = Date.now();
    const skewedTime = realTime + 600000; // Node A skewed +10 minutes ahead

    // Node A (+10 min clock) creates record R_A
    resetHLCState(skewedTime, 0);
    const hlcA = hlcNow('node-A-skewed');
    const recordA = {
      id: 'chaos-workout-101',
      title: 'Node A Skewed Initial Workout',
      updatedAt: hlcA.l,
      deviceId: 'node-A-skewed',
      hlc: hlcA
    };

    // Node A pushes R_A to server
    const pushA = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workouts: [recordA] })
    });
    assert.equal(pushA.status, 200, 'Node A push should return HTTP 200');
    const pushARes = await pushA.json();
    assert.equal(pushARes.merged, 1, 'Node A push merged count should be 1');

    // Node B (normal physical clock) receives R_A, calls hlcReceive to advance logical time, then edits record R_B
    resetHLCState(); // reset to simulate separate Node B instance
    const hlcB_received = hlcReceive(recordA.hlc, 'node-B-normal');
    assert.ok(hlcB_received.l >= recordA.hlc.l, 'hlcReceive must advance local L to at least remote L');

    const hlcB = hlcNow('node-B-normal');
    const recordB = {
      id: 'chaos-workout-101',
      title: 'Node B Overwrite Update',
      updatedAt: hlcB.l,
      deviceId: 'node-B-normal',
      hlc: hlcB
    };

    // Assert HLC causality ordering
    const compResult = hlcCompare(recordB.hlc, recordA.hlc);
    assert.ok(compResult > 0, `Node B HLC must be strictly greater than Node A HLC (got ${compResult})`);
    assert.equal(lwwWins(recordB, recordA), true, 'Node B record must win LWW conflict resolution');

    // Node B pushes R_B to server
    const pushB = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workouts: [recordB] })
    });
    assert.equal(pushB.status, 200, 'Node B push should return HTTP 200');
    const pushBRes = await pushB.json();
    assert.equal(pushBRes.merged, 1, 'Node B push merged count should be 1');

    // Pull from server and verify recordB has overwritten recordA without data loss
    const pullAfter = await fetch(`${baseUrl}/api/sync/pull?since=0`);
    const pullData = await pullAfter.json();
    assert.ok(pullData.changes && pullData.changes.workouts, 'Pull should return workouts store changes');
    const syncedRecord = pullData.changes.workouts.find(r => r.id === 'chaos-workout-101');
    assert.ok(syncedRecord, 'Synced record chaos-workout-101 must exist');
    assert.equal(syncedRecord.title, 'Node B Overwrite Update', 'Synced record title must match Node B edit');
    assert.deepEqual(syncedRecord.hlc, recordB.hlc, 'Synced record HLC must match Node B HLC');

    logPass('Clock Skew causality & CRDT overwrite', `R_B.hlc > R_A.hlc (${recordB.hlc.l}:${recordB.hlc.c}:${recordB.hlc.node} > ${recordA.hlc.l}:${recordA.hlc.c}:${recordA.hlc.node})`);

    // ── 3. Network Drops & Resilience (Backoff & Mutex)
    console.log('\n3. Network Drops & Jittered Exponential Backoff');
    resetSyncState();

    // 3a. Verify Backoff calculation bounds
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = calculateBackoffDelay(attempt);
      const expDelay = Math.min(BACKOFF_CONFIG.MAX_DELAY_MS, BACKOFF_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1));
      const minBound = Math.floor(expDelay * (1 - BACKOFF_CONFIG.JITTER_FACTOR));
      const maxBound = Math.floor(Math.min(BACKOFF_CONFIG.MAX_DELAY_MS, expDelay * (1 + BACKOFF_CONFIG.JITTER_FACTOR)));

      assert.ok(delay >= minBound, `Attempt ${attempt} delay (${delay}ms) must be >= min bound (${minBound}ms)`);
      assert.ok(delay <= BACKOFF_CONFIG.MAX_DELAY_MS, `Attempt ${attempt} delay (${delay}ms) must be <= max delay (${BACKOFF_CONFIG.MAX_DELAY_MS}ms)`);
    }
    logPass('Jittered exponential backoff bounds verified', 'Attempts 1-10 bounded between 500ms and 30000ms');

    // 3b. Simulate network failure & retryCount increment
    assert.equal(getRetryCount(), 0, 'Initial retryCount must be 0');
    
    // Guard navigator.onLine in Node environment so runSync passes connectivity check guard
    try {
      Object.defineProperty(globalThis.navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true
      });
    } catch {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        configurable: true,
        writable: true
      });
    }
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = { dispatchEvent: () => {} };
    }
    
    // Executing runSync() in Node triggers network failure on relative fetch URL
    await runSync();
    assert.equal(getRetryCount(), 1, 'retryCount must increment to 1 after sync error');
    
    // Clean up timer
    resetSyncState();
    assert.equal(getRetryCount(), 0, 'resetSyncState must reset retryCount to 0');
    logPass('Network failure error handling & retryCount increment', 'retryCount incremented on failure and reset on clear');

    // 3c. Mutex Lock checks: Concurrent runSync calls must be prevented by isSyncing lock
    assert.equal(getIsSyncing(), false, 'isSyncing must be false when idle');
    resetSyncState();
    const syncP1 = runSync();
    const syncP2 = runSync(); // Should hit Mutex lock guard (isSyncing === true) and return immediately
    await Promise.all([syncP1, syncP2]);
    assert.equal(getRetryCount(), 1, 'Concurrent sync attempt must be guarded by Mutex lock (only 1 failed attempt recorded)');
    assert.equal(getIsSyncing(), false, 'isSyncing must be released after sync completes');
    resetSyncState();
    logPass('Mutex lock isSyncing prevents concurrent duplicate sync executions');

    // ── 4. Backend Security & Malformed Payload Validation
    console.log('\n4. Backend Security & Payload Validation (HTTP 400)');

    // 4a. Malformed non-array payload
    const malformed1 = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workouts: 'invalid_string_not_array' })
    });
    assert.equal(malformed1.status, 400, 'Non-array payload should return HTTP 400');
    const json1 = await malformed1.json();
    assert.equal(json1.error, 'Invalid sync payload format');
    assert.ok(Array.isArray(json1.details), 'Zod error details array must be returned');

    // 4b. Invalid store name payload
    const malformed2 = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unknownStoreName: [] })
    });
    assert.equal(malformed2.status, 400, 'Unknown store name should return HTTP 400');
    const json2 = await malformed2.json();
    assert.equal(json2.error, 'Invalid sync payload format');

    // 4c. Non-object string payload
    const malformed3 = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('not an object')
    });
    assert.equal(malformed3.status, 400, 'Non-object body should return HTTP 400');

    logPass('Backend rejects malformed sync push payloads with HTTP 400 Bad Request & Zod details');

    // ── 5. Static Analysis & UI Verification
    console.log('\n5. Static Analysis & UI Verification');

    // 5a. css/intel.css GPU transform checks
    const intelCssPath = path.join(ROOT_DIR, 'css', 'intel.css');
    const intelCssContent = await fs.readFile(intelCssPath, 'utf8');

    assert.ok(intelCssContent.includes('.intel-heat-bar {'), 'css/intel.css must contain .intel-heat-bar selector');
    assert.ok(intelCssContent.includes('transform: scaleX('), 'css/intel.css must use transform: scaleX(...)');
    assert.ok(intelCssContent.includes('will-change: transform'), 'css/intel.css must use will-change: transform');
    assert.ok(intelCssContent.includes('transform-origin: left center'), 'css/intel.css must specify transform-origin: left center');
    logPass('.intel-heat-bar uses GPU-accelerated transform: scaleX & will-change: transform');

    // 5b. js/intel.view.js Stream haptic removal check
    const intelViewPath = path.join(ROOT_DIR, 'js', 'intel.view.js');
    const intelViewContent = await fs.readFile(intelViewPath, 'utf8');

    // Find the SSE streaming text loop around `if (parsed.text)`
    const sseMatch = intelViewContent.match(/if\s*\(\s*parsed\.text\s*\)\s*\{([^}]*)\}/s);
    assert.ok(sseMatch, 'js/intel.view.js must contain SSE stream parsed.text handling block');
    const sseBlock = sseMatch[1];
    assert.ok(!sseBlock.includes('haptic('), 'SSE streaming chunk loop must NOT contain haptic() calls');
    logPass('haptic(2) removed from SSE text streaming loop in js/intel.view.js');

    console.log('\n====================================================');
    console.log(` ALL ${passedTests}/${totalTests} CHAOS VERIFICATION TESTS PASSED`);
    console.log('====================================================\n');

  } catch (err) {
    logFail('Chaos verification suite failed', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
      console.log('Server closed successfully.');
    }
  }
}

runChaosVerification();
