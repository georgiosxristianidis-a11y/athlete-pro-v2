/**
 * Home "Go" used to call selectType while a session was already live.
 * selectType rebuilds State.plan, stamps a new startedAt, and persistSession
 * overwrites ap-active-session — every logged set gone.
 *
 * Concrete trigger: start Push, log sets, tab Home, tap the hero Go button
 * (often for Pull). After the fix, hasLiveSession() resumes Train instead.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  State,
  SESSION_KEY,
  hasLiveSession,
  persistSession,
  buildSession,
} from '../js/workout.store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
}

beforeEach(() => {
  mockStorage();
  State.phase = 'select';
  State.type = null;
  State.plan = null;
  State.startedAt = null;
  State.blockTimings = {};
});

test('hasLiveSession is true only while phase is active', () => {
  assert.equal(hasLiveSession(), false);
  State.phase = 'active';
  assert.equal(hasLiveSession(), true);
});

test('rebuilding the plan while active overwrites logged sets in the snapshot', () => {
  State.phase = 'active';
  State.type = 'push';
  State.startedAt = 1_700_000_000_000;
  State.plan = [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }];
  persistSession();
  const before = JSON.parse(localStorage.getItem(SESSION_KEY));
  assert.equal(before.plan[0].sets[0].done, true);
  assert.equal(before.type, 'push');

  // The path selectType took before the guard.
  State.plan = buildSession('pull', { workouts: [] });
  State.type = 'pull';
  State.startedAt = Date.now();
  persistSession();
  const after = JSON.parse(localStorage.getItem(SESSION_KEY));
  assert.equal(after.type, 'pull');
  const bench = after.plan.find((e) => e.name === 'Bench Press');
  assert.equal(bench, undefined, 'push work is gone after a rebuild');
  assert.equal(
    after.plan.some((e) => e.sets?.some((s) => s.done)),
    false,
    'new session has no logged sets'
  );
});

function sliceFn(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.ok(start !== -1, `missing ${startNeedle}`);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing ${endNeedle} after ${startNeedle}`);
  return src.slice(start, end);
}

test('directLaunch resumes Train when a session is live — does not call selectType', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'dashboard.js'), 'utf8');
  const fn = sliceFn(src, 'async function directLaunch(type)', 'async function load()');
  assert.match(fn, /hasLiveSession\s*\(/);
  const guard = fn.indexOf('hasLiveSession');
  const select = fn.indexOf('selectType');
  assert.ok(guard !== -1 && select > guard, 'guard must run before selectType');
  const early = fn.slice(guard, select);
  assert.match(early, /return/, 'live session must return before selectType');
  assert.match(early, /s-train/, 'resume path must open Train');
});

test('selectType returns before buildSession when a session is live', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'workout.view/handlers.js'), 'utf8');
  const fn = sliceFn(src, 'export async function selectType(type)', 'EXERCISES');
  assert.match(fn, /hasLiveSession\s*\(/);
  const guard = fn.indexOf('hasLiveSession');
  const build = fn.indexOf('buildSession');
  assert.ok(guard !== -1 && build > guard, 'guard must run before buildSession');
  assert.match(fn.slice(guard, build), /return/, 'live session must return before rebuild');
});
