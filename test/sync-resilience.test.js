import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBackoffDelay,
  getIsSyncing,
  getRetryCount,
  resetSyncState,
  runSync,
  BACKOFF_CONFIG
} from '../js/sync.js';
import { DB } from '../js/db.js';

describe('Network Resilience & Jittered Exponential Backoff', () => {
  beforeEach(() => {
    resetSyncState();
  });

  afterEach(() => {
    resetSyncState();
  });

  test('calculateBackoffDelay returns 0 for non-positive attempt', () => {
    assert.equal(calculateBackoffDelay(0), 0);
    assert.equal(calculateBackoffDelay(-1), 0);
  });

  test('calculateBackoffDelay respects attempt 1 jitter bounds [500, 1500]', () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateBackoffDelay(1);
      assert.ok(delay >= 500, `Delay ${delay} should be >= 500`);
      assert.ok(delay <= 1500, `Delay ${delay} should be <= 1500`);
    }
  });

  test('calculateBackoffDelay respects attempt 5 jitter bounds [8000, 24000]', () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateBackoffDelay(5);
      assert.ok(delay >= 8000, `Delay ${delay} should be >= 8000`);
      assert.ok(delay <= 24000, `Delay ${delay} should be <= 24000`);
    }
  });

  test('calculateBackoffDelay caps exponential growth at maxDelay (30000ms)', () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateBackoffDelay(10); // 1000 * 2^9 = 512000 -> capped at 30000
      assert.ok(delay >= 15000, `Delay ${delay} should be >= 15000`);
      assert.ok(delay <= 30000, `Delay ${delay} should be <= 30000`);
    }
  });

  test('calculateBackoffDelay allows custom baseDelay, maxDelay, and jitterFactor', () => {
    // baseDelay 200, maxDelay 1000, jitter 0 (deterministic)
    const delayNoJitter = calculateBackoffDelay(1, 200, 1000, 0);
    assert.equal(delayNoJitter, 200);

    const delayAttempt3NoJitter = calculateBackoffDelay(3, 200, 1000, 0);
    assert.equal(delayAttempt3NoJitter, 800); // 200 * 2^2 = 800
  });

  test('getRetryCount and resetSyncState work correctly', () => {
    assert.equal(getRetryCount(), 0);
    resetSyncState();
    assert.equal(getRetryCount(), 0);
  });
});

describe('Mutex Lock & Global Safety', () => {
  let originalGetAllRaw;
  let originalGetRaw;
  let originalFetch;

  beforeEach(() => {
    resetSyncState();
    originalGetAllRaw = DB._getAllRaw;
    originalGetRaw = DB._getRaw;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    DB._getAllRaw = originalGetAllRaw;
    DB._getRaw = originalGetRaw;
    globalThis.fetch = originalFetch;
    delete globalThis.window;
    delete globalThis.navigator;
    resetSyncState();
  });

  test('getIsSyncing returns false initially', () => {
    assert.equal(getIsSyncing(), false);
  });

  test('runSync acquires mutex lock synchronously on entry and releases in finally', async () => {
    let rawCalled = false;
    DB._getAllRaw = async () => {
      rawCalled = true;
      assert.equal(getIsSyncing(), true, 'Lock must be true inside async work');
      return [];
    };

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ changes: {} })
    });

    const syncPromise = runSync();
    assert.equal(getIsSyncing(), true, 'Lock must be acquired synchronously right after entry');

    await syncPromise;
    assert.ok(rawCalled);
    assert.equal(getIsSyncing(), false, 'Lock must be released in finally');
  });

  test('runSync prevents concurrent sync calls via mutex lock', async () => {
    let callCount = 0;
    let finishFirstCall;
    const gatePromise = new Promise(resolve => { finishFirstCall = resolve; });

    DB._getAllRaw = async () => {
      callCount++;
      if (callCount === 1) {
        await gatePromise;
      }
      return [];
    };

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ changes: {} })
    });

    const promise1 = runSync();
    assert.equal(getIsSyncing(), true, 'isSyncing should be true during first run');

    // Second call while first call is waiting on gatePromise
    const promise2 = runSync();
    assert.equal(getIsSyncing(), true);

    finishFirstCall();
    await promise1;
    await promise2;

    assert.equal(getIsSyncing(), false, 'isSyncing should be false after completion');
  });

  test('runSync dispatches ap-sync-status events on window when window exists', async () => {
    const events = [];

    // Mock Window and CustomEvent
    class MockCustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    }

    const mockWindow = {
      dispatchEvent(event) {
        events.push(event);
      }
    };

    globalThis.window = mockWindow;
    globalThis.CustomEvent = MockCustomEvent;

    DB._getAllRaw = async () => [];
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ changes: {} })
    });

    await runSync();

    assert.ok(events.length >= 2, 'Should emit syncing and synced events');
    assert.equal(events[0].detail.status, 'syncing');
    assert.equal(events[events.length - 1].detail.status, 'synced');
  });

  test('runSync handles fetch failure: increments retryCount and emits error event', async () => {
    const events = [];

    class MockCustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    }

    globalThis.window = { dispatchEvent: (e) => events.push(e) };
    globalThis.CustomEvent = MockCustomEvent;

    DB._getAllRaw = async () => [{ id: 'w-1', updatedAt: Date.now() + 10000 }];
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server Error' })
    });

    await runSync();

    assert.equal(getRetryCount(), 1, 'retryCount should be incremented to 1');
    assert.equal(getIsSyncing(), false, 'isSyncing lock must be released even on error');

    const errEvent = events.find(e => e.detail?.status === 'error');
    assert.ok(errEvent, 'Should dispatch error status event');
    assert.equal(errEvent.detail.retryCount, 1);
    assert.ok(typeof errEvent.detail.retryIn === 'number');

    resetSyncState();
    assert.equal(getRetryCount(), 0);
  });

  test('runSync handles navigator.onLine === false by emitting offline event', async () => {
    const events = [];

    class MockCustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    }

    globalThis.window = { dispatchEvent: (e) => events.push(e) };
    globalThis.CustomEvent = MockCustomEvent;
    globalThis.navigator = { onLine: false };

    await runSync();

    assert.equal(events.length, 1);
    assert.equal(events[0].detail.status, 'offline');
    assert.equal(getIsSyncing(), false);
  });
});
