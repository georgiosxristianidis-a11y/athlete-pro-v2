// @ts-check
// Discard must drop ap-active-session. persistSession() is a no-op when
// phase !== 'active', so cancel used to leave the snapshot in place and the
// next Train load / cold boot resurrected the workout the user threw away.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Minimal Map-backed localStorage — стор пишет туда на загрузке модуля. */
function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  };
  return m;
}

mockStorage();
beforeEach(mockStorage);

const { State, SESSION_KEY, persistSession, clearPersistedSession, tryRestoreSession } =
  await import('../js/workout.store.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function seedActiveSession() {
  State.phase = 'active';
  State.type = 'push';
  State.plan = [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }];
  State.startedAt = 1_700_000_000_000;
  State.blockTimings = { power: { startedAt: 1, endedAt: 2 } };
  persistSession();
}

test('persistSession writes a snapshot that tryRestoreSession can pick up', () => {
  seedActiveSession();
  assert.ok(localStorage.getItem(SESSION_KEY));
  const restored = tryRestoreSession();
  assert.ok(restored);
  assert.equal(restored.type, 'push');
  assert.equal(State.phase, 'active');
});

test('persistSession after Discard is a no-op — the leftover key is the bug', () => {
  seedActiveSession();
  State.phase = 'select';
  State.plan = [];
  State.startedAt = 0;
  persistSession();
  assert.ok(
    localStorage.getItem(SESSION_KEY),
    'persistSession() must not wipe the key when phase is not active — that is why cancel must call clearPersistedSession()'
  );
  const restored = tryRestoreSession();
  assert.ok(restored, 'stale snapshot after a no-op persist is exactly the Discard resurrection');
  assert.equal(restored.type, 'push');
});

test('clearPersistedSession drops the snapshot so Discard cannot come back', () => {
  seedActiveSession();
  State.phase = 'select';
  State.plan = [];
  State.startedAt = 0;
  clearPersistedSession();
  assert.equal(localStorage.getItem(SESSION_KEY), null);
  assert.equal(tryRestoreSession(), null);
  assert.equal(State.phase, 'select', 'clear must not flip phase back to active');
});

test('cancelSession deletes the snapshot instead of calling persistSession', () => {
  const src = readFileSync(path.join(ROOT, 'js', 'workout.view', 'handlers.js'), 'utf8');
  const fn = src.match(/export async function cancelSession\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'cancelSession is missing');
  assert.match(
    fn[0],
    /clearPersistedSession\(\)/,
    'Discard must drop ap-active-session after leaving the active phase'
  );
  assert.doesNotMatch(
    fn[0],
    /^\s*persistSession\(\);/m,
    'calling persistSession() after phase=select is a no-op and resurrects the session'
  );
});
