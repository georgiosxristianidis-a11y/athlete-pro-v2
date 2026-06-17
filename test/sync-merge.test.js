import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeWorkoutExercises, pickWinner } from '../js/shared/sync-merge.js';

describe('mergeWorkoutExercises — set-level convergence', () => {
  test('remote-only exercise is kept when local is empty', () => {
    const out = mergeWorkoutExercises([], [{ name: 'Bench', sets: [{ w: 100 }] }], false);
    assert.deepEqual(out, [{ name: 'Bench', sets: [{ w: 100 }] }]);
  });

  test('local-only exercise is added (never dropped)', () => {
    const out = mergeWorkoutExercises([{ name: 'Squat', sets: [{ w: 140 }] }], [], false);
    assert.deepEqual(out, [{ name: 'Squat', sets: [{ w: 140 }] }]);
  });

  test('a set logged only locally survives even when remote wins shared sets', () => {
    const local =  [{ name: 'Bench', sets: [{ r: 5 }, { r: 5 }, { r: 5 }] }];
    const remote = [{ name: 'Bench', sets: [{ r: 8 }, { r: 8 }] }];
    const out = mergeWorkoutExercises(local, remote, /* localWins */ false);
    // shared indices keep remote; the local-only 3rd set is appended
    assert.deepEqual(out[0].sets, [{ r: 8 }, { r: 8 }, { r: 5 }]);
  });

  test('localWins overwrites shared sets with local values', () => {
    const local =  [{ name: 'Bench', sets: [{ r: 5 }, { r: 5 }] }];
    const remote = [{ name: 'Bench', sets: [{ r: 8 }, { r: 8 }] }];
    const out = mergeWorkoutExercises(local, remote, /* localWins */ true);
    assert.deepEqual(out[0].sets, [{ r: 5 }, { r: 5 }]);
  });

  test('disjoint exercises from both replicas are unioned', () => {
    const out = mergeWorkoutExercises(
      [{ name: 'A', sets: [] }],
      [{ name: 'B', sets: [] }],
      false
    );
    assert.deepEqual(out.map((e) => e.name).sort(), ['A', 'B']);
  });

  test('tolerates missing sets arrays', () => {
    const out = mergeWorkoutExercises([{ name: 'A' }], [{ name: 'A' }], false);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].sets, []);
  });
});

describe('pickWinner — LWW decision over rows', () => {
  test('newer local wins', () => {
    assert.equal(pickWinner({ updatedAt: 200, deviceId: 'a' }, { updatedAt: 100, deviceId: 'b' }), 'local');
  });

  test('newer remote wins', () => {
    assert.equal(pickWinner({ updatedAt: 100, deviceId: 'a' }, { updatedAt: 200, deviceId: 'b' }), 'remote');
  });

  test('equal timestamps resolve deterministically via deviceId', () => {
    const a = pickWinner({ updatedAt: 500, deviceId: 'aaa' }, { updatedAt: 500, deviceId: 'bbb' });
    const b = pickWinner({ updatedAt: 500, deviceId: 'bbb' }, { updatedAt: 500, deviceId: 'aaa' });
    assert.notEqual(a, b); // no split-brain
  });

  test('falls back to legacy timestamp field', () => {
    assert.equal(pickWinner({ timestamp: 100 }, { updatedAt: 200 }), 'remote');
  });

  test('a newer remote tombstone wins (caller then deletes locally)', () => {
    assert.equal(pickWinner({ updatedAt: 100 }, { _deleted: true, updatedAt: 200 }), 'remote');
  });
});
