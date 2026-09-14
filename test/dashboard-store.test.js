/**
 * Guard for the Home read-model (card A8).
 *
 * js/dashboard.js was a DOM monolith with tonnage/streak/next-type math
 * inlined into render functions — untestable without a document. These
 * three read-model functions now live in js/dashboard.store.js with zero
 * DOM, so this test covers the math directly.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../js/dashboard.store.js');

const w = (type, ts, tonnage = 1000) => ({ type, timestamp: ts, tonnage });

const D = (y, m, d) => new Date(y, m, d, 12).getTime();

describe('getVolumeSummary', () => {
  test('splits tonnage by PPL type and counts sessions', () => {
    const now = new Date();
    const workouts = [w('push', now.getTime(), 500), w('pull', now.getTime(), 300)];
    const s = S.getVolumeSummary(workouts);
    assert.equal(s.ppl.push, 500);
    assert.equal(s.ppl.pull, 300);
    assert.equal(s.ppl.legs, 0);
    assert.equal(s.weekCount, 2);
  });

  test('empty history gives zeros, not NaN', () => {
    const s = S.getVolumeSummary([]);
    assert.deepEqual(s, { weekVol: 0, monthVol: 0, weekCount: 0, ppl: { push: 0, pull: 0, legs: 0 } });
  });
});

describe('getNextType', () => {
  test('rotates push -> pull -> legs -> push', () => {
    assert.equal(S.getNextType([{ type: 'push' }]), 'pull');
    assert.equal(S.getNextType([{ type: 'pull' }]), 'legs');
    assert.equal(S.getNextType([{ type: 'legs' }]), 'push');
  });

  test('no history defaults to legs -> push (first day is Push)', () => {
    assert.equal(S.getNextType([]), 'push');
  });

  test('reads only the most recent (index 0) entry', () => {
    assert.equal(S.getNextType([{ type: 'legs' }, { type: 'push' }]), 'push');
  });
});

describe('computeStreak', () => {
  test('consecutive days ending today count as a streak', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = today.getTime() - 86400000;
    const { streak } = S.computeStreak([w('push', today.getTime()), w('pull', yesterday)]);
    assert.equal(streak, 2);
  });

  test('a gap before today breaks the streak at zero', () => {
    const twoDaysAgo = Date.now() - 2 * 86400000;
    const { streak } = S.computeStreak([w('push', twoDaysAgo)]);
    assert.equal(streak, 0);
  });

  test('a gap further back stops counting but keeps the streak so far', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = today.getTime() - 86400000;
    const fourDaysAgo = today.getTime() - 4 * 86400000;
    const { streak } = S.computeStreak([w('push', today.getTime()), w('pull', yesterday), w('legs', fourDaysAgo)]);
    assert.equal(streak, 2);
  });

  test('workedDays maps a calendar day to that day\'s type', () => {
    const ts = D(2026, 6, 20);
    const { workedDays } = S.computeStreak([w('legs', ts)]);
    const dayStart = new Date(ts);
    dayStart.setHours(0, 0, 0, 0);
    assert.equal(workedDays.get(dayStart.getTime()), 'legs');
  });
});
