const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

let mod;
before(async () => {
  mod = await import('../js/strength-engine.js');
});

describe('estimate1RM (Epley)', () => {
  test('1 rep returns weight unchanged', () => {
    assert.equal(mod.estimate1RM(100, 1), 100);
  });

  test('5 reps at 80 kg → 93', () => {
    assert.equal(mod.estimate1RM(80, 5), 93);
  });

  test('10 reps at 60 kg → 80', () => {
    assert.equal(mod.estimate1RM(60, 10), 80);
  });

  test('zero weight returns 0', () => {
    assert.equal(mod.estimate1RM(0, 10), 0);
  });

  test('zero reps returns 0', () => {
    assert.equal(mod.estimate1RM(100, 0), 0);
  });
});

describe('mcCullochAge', () => {
  test('prime age (30) = 1.0', () => {
    assert.equal(mod.mcCullochAge(30), 1.0);
  });

  test('age 40 = 1.0 (still prime)', () => {
    assert.equal(mod.mcCullochAge(40), 1.0);
  });

  test('age 18 has bonus > 1', () => {
    assert.ok(mod.mcCullochAge(18) > 1.0);
  });

  test('age 50 has coefficient > 1.0 (decline multiplier)', () => {
    assert.ok(mod.mcCullochAge(50) > 1.0);
  });

  test('no age (undefined) returns 1.0', () => {
    assert.equal(mod.mcCullochAge(undefined), 1.0);
  });

  test('age 80 returns capped value', () => {
    assert.ok(mod.mcCullochAge(80) > 1.0);
  });
});

describe('dotsScore', () => {
  test('returns 0 for missing total', () => {
    assert.equal(mod.dotsScore({ total: 0, bodyweight: 80, sex: 'm' }), 0);
  });

  test('returns 0 for missing bodyweight', () => {
    assert.equal(mod.dotsScore({ total: 500, bodyweight: 0, sex: 'm' }), 0);
  });

  test('reasonable score for intermediate male lifter', () => {
    // 80 kg male, bench 100 + squat 140 + deadlift 180 = 420 total
    const score = mod.dotsScore({ total: 420, bodyweight: 80, sex: 'm' });
    assert.ok(score > 200 && score < 600, `Expected 200-600, got ${score}`);
  });

  test('higher total → higher score', () => {
    const a = mod.dotsScore({ total: 420, bodyweight: 80, sex: 'm' });
    const b = mod.dotsScore({ total: 600, bodyweight: 80, sex: 'm' });
    assert.ok(b > a);
  });

  test('falls back to male coefficients for unknown sex', () => {
    const score = mod.dotsScore({ total: 400, bodyweight: 75, sex: 'x' });
    assert.ok(score > 0);
  });
});

describe('exrxTier', () => {
  test('returns null for unknown lift', () => {
    const result = mod.exrxTier({ lift: 'curls', sex: 'm', bodyweight: 80, oneRM: 100 });
    assert.equal(result, null);
  });

  test('returns null for zero bodyweight', () => {
    const result = mod.exrxTier({ lift: 'bench', sex: 'm', bodyweight: 0, oneRM: 100 });
    assert.equal(result, null);
  });

  test('untrained male bencher at 75 kg with 50 kg 1RM', () => {
    const result = mod.exrxTier({ lift: 'bench', sex: 'm', bodyweight: 75, oneRM: 50 });
    assert.equal(result.tier, 'untrained');
    assert.equal(result.tierIndex, 0);
  });

  test('intermediate male bencher at 75 kg with 110 kg 1RM', () => {
    const result = mod.exrxTier({ lift: 'bench', sex: 'm', bodyweight: 75, oneRM: 110 });
    assert.ok(result.tierIndex >= 2, `Expected intermediate+, got tier ${result.tierIndex}`);
  });

  test('result has all required fields', () => {
    const result = mod.exrxTier({ lift: 'deadlift', sex: 'm', bodyweight: 80, oneRM: 180 });
    assert.ok(result !== null);
    assert.ok(typeof result.tier === 'string');
    assert.ok(typeof result.tierIndex === 'number');
    assert.ok(typeof result.percentile === 'number');
    assert.ok(Array.isArray(result.thresholds) && result.thresholds.length === 5);
  });

  test('percentile is clamped 0-99', () => {
    const result = mod.exrxTier({ lift: 'bench', sex: 'm', bodyweight: 75, oneRM: 300 });
    assert.ok(result.percentile >= 0 && result.percentile <= 99);
  });

  test('female lifter returns valid tier', () => {
    const result = mod.exrxTier({ lift: 'squat', sex: 'f', bodyweight: 63, oneRM: 90 });
    assert.ok(result !== null);
    assert.ok(result.tierIndex >= 0 && result.tierIndex <= 4);
  });
});

describe('ipfWeightClass', () => {
  test('66 kg male → 66', () => {
    assert.equal(mod.ipfWeightClass(66, 'm'), '66');
  });

  test('83 kg male → 83', () => {
    assert.equal(mod.ipfWeightClass(83, 'm'), '83');
  });

  test('130 kg male → 120+', () => {
    assert.equal(mod.ipfWeightClass(130, 'm'), '120+');
  });

  test('52 kg female → 52', () => {
    assert.equal(mod.ipfWeightClass(52, 'f'), '52');
  });

  test('90 kg female → 84+', () => {
    assert.equal(mod.ipfWeightClass(90, 'f'), '84+');
  });
});

describe('expectedFromDeadlift', () => {
  test('returns null for zero deadlift', () => {
    assert.equal(mod.expectedFromDeadlift({ deadlift: 0 }), null);
  });

  test('100 kg deadlift → bench 55, squat 85, ohp 35', () => {
    const result = mod.expectedFromDeadlift({ deadlift: 100 });
    assert.equal(result.bench, 55);
    assert.equal(result.squat, 85);
    assert.equal(result.ohp, 35);
  });

  test('returns rounded values', () => {
    const result = mod.expectedFromDeadlift({ deadlift: 150 });
    assert.equal(typeof result.bench, 'number');
    assert.equal(result.bench, Math.round(result.bench));
  });
});

describe('symmetryIndex', () => {
  test('perfectly symmetric arms → 100', () => {
    assert.equal(mod.symmetryIndex({ armL: 35, armR: 35 }), 100);
  });

  test('no measurements → null', () => {
    assert.equal(mod.symmetryIndex({}), null);
  });

  test('large asymmetry → low score', () => {
    const score = mod.symmetryIndex({ armL: 30, armR: 40 });
    assert.ok(score < 50, `Expected < 50, got ${score}`);
  });

  test('considers both arm and thigh pairs', () => {
    const score = mod.symmetryIndex({ armL: 35, armR: 35, thighL: 55, thighR: 55 });
    assert.equal(score, 100);
  });
});
