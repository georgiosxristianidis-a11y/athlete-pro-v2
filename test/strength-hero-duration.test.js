import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { renderStrengthHero } = await import('../js/analytics.strength-curves.js');

// renderStrengthHero only ever does `mount.innerHTML = <string>` — a plain
// object with a settable property is a sufficient mount stub.
function mountStub() { return { innerHTML: '' }; }

const w = (y, mo, d, weight) => ({
  type: 'push',
  timestamp: new Date(y, mo, d, 12).getTime(),
  duration: 0,
  tonnage: weight * 5,
  exercises: [{ name: 'Bench Press', sets: [{ weight, reps: 5, rpe: null, done: true }] }],
});

describe('renderStrengthHero — journey duration stat', () => {
  // buildSeries requires >=3 distinct calendar months before a series (and
  // therefore the hero) renders at all, so every fixture below spans >=3 months.

  test('a 3-month history shows months, not a floored "1y"', () => {
    const mount = mountStub();
    const workouts = [w(2026, 0, 10, 60), w(2026, 1, 10, 65), w(2026, 2, 10, 70), w(2026, 3, 10, 75)];
    renderStrengthHero(workouts, mount);
    assert.match(mount.innerHTML, />3<small>mo<\/small></);
    assert.doesNotMatch(mount.innerHTML, /1<small>y<\/small>/);
  });

  test('an 11-month history still reads in months (just under the 1y switch)', () => {
    const mount = mountStub();
    const workouts = [w(2025, 1, 1, 60), w(2025, 6, 1, 70), w(2025, 11, 1, 80)];
    renderStrengthHero(workouts, mount);
    assert.match(mount.innerHTML, /<small>mo<\/small>/);
  });

  test('a multi-year history switches to years with one decimal', () => {
    const mount = mountStub();
    const workouts = [w(2024, 0, 10, 60), w(2024, 6, 10, 70), w(2025, 0, 10, 80), w(2026, 0, 10, 90)];
    renderStrengthHero(workouts, mount);
    assert.match(mount.innerHTML, />2<small>y<\/small></);
  });

  test('a same-day/short span still renders (buildSeries hides it — no crash)', () => {
    const mount = mountStub();
    const workouts = [w(2026, 0, 1, 60), w(2026, 0, 2, 61)];
    renderStrengthHero(workouts, mount);
    assert.equal(mount.innerHTML, ''); // <3 months tracked — hero hides, doesn't error
  });
});
