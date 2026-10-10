import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { renderStrengthCurves, strengthIndexPlot } = await import('../js/analytics.strength-curves.js');

// renderStrengthCurves writes `mount.innerHTML` and then wires scrub on
// `.sc-card` nodes — an empty list is enough for a markup-only assertion.
function mountStub() {
  return { innerHTML: '', querySelectorAll: () => [] };
}

const w = (mo, sets) => ({
  type: 'push',
  timestamp: new Date(2026, mo, 10, 12).getTime(),
  duration: 0,
  tonnage: 0,
  exercises: [{ name: 'Bench Press', sets }],
});

describe('buildSeries — only lifted sets reach the Stats curve', () => {
  // A session prefills every set with the auto-progressed weight and done:false
  // (workout.store buildSession) and saves sets as-is (completeSession). The
  // last month here lifted 100 kg and left a 102.5 kg suggestion unfinished.
  const history = [
    w(0, [{ weight: 90, reps: 5, done: true }]),
    w(1, [{ weight: 95, reps: 5, done: true }]),
    w(2, [
      { weight: 100, reps: 5, done: true },
      { weight: 102.5, reps: 5, done: false },
    ]),
  ];

  test('a done:false set with a heavier weight does not raise top, peak or delta', () => {
    const mount = mountStub();
    renderStrengthCurves(history, mount);
    assert.match(mount.innerHTML, /peak 100</);
    assert.match(mount.innerHTML, />\+10 kg</);
    assert.match(mount.innerHTML, />100<span class="sc-unit">kg/);
  });

  test('a done set with 0 reps is not a lift', () => {
    const mount = mountStub();
    renderStrengthCurves(
      [...history.slice(0, 2), w(2, [{ weight: 100, reps: 5, done: true }, { weight: 110, reps: 0, done: true }])],
      mount,
    );
    assert.match(mount.innerHTML, /peak 100</);
  });

  test('a set without the done field counts as lifted (same rule as fetchExerciseHistory)', () => {
    const mount = mountStub();
    renderStrengthCurves([...history.slice(0, 2), w(2, [{ weight: 100, reps: 5 }])], mount);
    assert.match(mount.innerHTML, /peak 100</);
  });

  test('a month with only unfinished sets drops out instead of plotting the suggestion', () => {
    const mount = mountStub();
    renderStrengthCurves([...history, w(3, [{ weight: 105, reps: 5, done: false }])], mount);
    assert.match(mount.innerHTML, /peak 100</);
    assert.match(mount.innerHTML, />100<span class="sc-unit">kg/);
  });

  test('the Strength Index uses the same filtered series', () => {
    const plot = strengthIndexPlot(history);
    assert.ok(plot);
    // 100 / 90 → 111, not 102.5 / 90 → 114
    assert.equal(plot.score, 111);
  });

  test('aria-label names what is drawn — top working weight, not est 1RM', () => {
    const mount = mountStub();
    renderStrengthCurves(history, mount);
    assert.doesNotMatch(mount.innerHTML, /1RM/);
    assert.match(mount.innerHTML, /aria-label="Bench Press top working weight by month, 100 kg current, 100 kg peak"/);
  });
});
