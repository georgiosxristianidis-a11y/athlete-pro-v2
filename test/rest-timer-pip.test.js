import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';

// F-2 ISL-PIP-NEXT: RestTimer used to send only { time, name } to PiP.drawFrame
// every tick, which merges into PiP's _lastState and therefore keeps whatever
// nextName the frame BEFORE rest started happened to carry — while the island's
// own rest HUD computes "next" fresh from State.plan. The two could disagree.
// Fix: RestTimer computes "next" with the same rule as the island
// (dynamic-island.js's _restNextEl: first exercise still holding an undone
// set) and feeds it into every PiP frame during the rest.

// rest-timer.js checks window.DynamicIsland; shared/utils.js (haptic) wires up
// a pointerdown listener at import time to unlock vibration on first touch.
globalThis.window = {
  DynamicIsland: null,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { State } = await import('../js/workout.store.js');
const { PiP } = await import('../js/features/pip.js');
const { RestTimer } = await import('../js/rest-timer.js');

let captured = null;
PiP.drawFrame = (state) => { captured = state; };

after(() => RestTimer.stop());

describe('RestTimer → PiP "next" agrees with the island rule (F-2)', () => {
  test('mid-block: next = the same exercise still holding an undone set', () => {
    State.plan = [
      { name: 'Bench Press', sets: [{ done: true }, { done: false }, { done: false }] },
      { name: 'Incline Row', sets: [{ done: false }] },
    ];
    captured = null;
    RestTimer.start('Bench Press', '1/3', 5);
    assert.equal(captured.nextName, 'Bench Press');
  });

  test('exercise complete: next = the following exercise', () => {
    State.plan = [
      { name: 'Bench Press', sets: [{ done: true }, { done: true }, { done: true }] },
      { name: 'Incline Row', sets: [{ done: false }] },
    ];
    captured = null;
    RestTimer.start('Bench Press', '3/3', 5);
    assert.equal(captured.nextName, 'Incline Row');
  });

  test('workout complete: next is empty, not stale', () => {
    State.plan = [
      { name: 'Bench Press', sets: [{ done: true }] },
    ];
    captured = null;
    RestTimer.start('Bench Press', '1/1', 5);
    assert.equal(captured.nextName, '');
  });

  test('every render tick during the rest re-sends the same next (no drift)', () => {
    State.plan = [
      { name: 'Squat', sets: [{ done: true }, { done: false }] },
      { name: 'Deadlift', sets: [{ done: false }] },
    ];
    captured = null;
    RestTimer.start('Squat', '1/2', 5);
    const first = captured.nextName;
    // Simulate State moving on mid-rest (must NOT affect this rest's frame —
    // island freezes "next" at rest start too, on the same rule).
    captured = null;
    RestTimer.addTime(1);
    assert.equal(captured.nextName, first);
  });
});
