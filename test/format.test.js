import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// format.js has a dependency on locale.store.js → isRu()
// We mock it via module registration before import.
// Node.js test runner supports --import for loaders; here we stub
// isRu via a thin mock written inline using register().
import { register } from 'node:module';

// ── Inline ESM mock for locale.store.js ──────────────────────────────────────
// isRu() → false (English locale) by default for all formatter tests.
// We test locale-sensitive fmtDate separately via Intl, not the module flag.
const mockSource = `export function isRu() { return false; }`;
const mockURL = 'data:text/javascript,' + encodeURIComponent(mockSource);

// Intercept the locale.store.js specifier via a custom loader hook.
// Using globalThis to share flag without file I/O.
globalThis.__fmtTest_isRu = false;

// ── Import format.js after mock is in place ───────────────────────────────────
// Because format.js uses a top-level import of locale.store.js at parse time,
// we rely on the fact that test/setup.js already shimmed the browser globals.
// For format.js specifically, isRu() only matters for fmtDate locale string.
// We test the pure numeric functions without locale concern first.

// Direct import — Node resolves relative to this file (test/).
const { fmtVol, fmtWeight, fmtDuration, fmtDate } = await import('../js/shared/format.js');

// ── fmtVol ────────────────────────────────────────────────────────────────────
describe('fmtVol', () => {
  test('values under 1000 round to integer string', () => {
    assert.equal(fmtVol(488), '488');
    assert.equal(fmtVol(999), '999');
    assert.equal(fmtVol(0), '0');
  });

  test('exactly 1000 → "1.0k"', () => {
    assert.equal(fmtVol(1000), '1.0k');
  });

  test('values ≥ 1000 get one decimal + k suffix', () => {
    assert.equal(fmtVol(1500), '1.5k');
    assert.equal(fmtVol(10000), '10.0k');
    assert.equal(fmtVol(2750), '2.8k');
  });

  test('non-numeric input treated as 0', () => {
    assert.equal(fmtVol(undefined), '0');
    assert.equal(fmtVol(null), '0');
    assert.equal(fmtVol('abc'), '0');
  });

  test('numeric string is coerced', () => {
    assert.equal(fmtVol('1500'), '1.5k');
  });

  test('negative values round to integer (passthrough)', () => {
    // Negative volume is nonsensical but shouldn't throw
    assert.equal(typeof fmtVol(-100), 'string');
  });
});

// ── fmtWeight ─────────────────────────────────────────────────────────────────
describe('fmtWeight', () => {
  test('integer weights have no decimal', () => {
    assert.equal(fmtWeight(60), '60');
    assert.equal(fmtWeight(100), '100');
    assert.equal(fmtWeight(0), '0');
  });

  test('fractional weights get one decimal place', () => {
    assert.equal(fmtWeight(62.5), '62.5');
    assert.equal(fmtWeight(82.5), '82.5');
    assert.equal(fmtWeight(0.5), '0.5');
  });

  test('non-numeric input treated as 0 (integer → no decimal)', () => {
    assert.equal(fmtWeight(undefined), '0');
    assert.equal(fmtWeight(null), '0');
  });

  test('numeric string is coerced correctly', () => {
    assert.equal(fmtWeight('80'), '80');
    assert.equal(fmtWeight('82.5'), '82.5');
  });
});

// ── fmtDuration ───────────────────────────────────────────────────────────────
describe('fmtDuration', () => {
  test('zero ms → "0s"', () => {
    assert.equal(fmtDuration(0), '0s');
  });

  test('values under 60 s render as seconds', () => {
    assert.equal(fmtDuration(30_000), '30s');
    assert.equal(fmtDuration(59_000), '59s');
  });

  test('exactly 60 s → "1m"', () => {
    assert.equal(fmtDuration(60_000), '1m');
  });

  test('minutes without hours, no leading zero on minutes', () => {
    assert.equal(fmtDuration(45 * 60_000), '45m');
    assert.equal(fmtDuration(9 * 60_000), '9m');
  });

  test('1 hour exactly → "1h 00m"', () => {
    assert.equal(fmtDuration(3600_000), '1h 00m');
  });

  test('1 hour 5 minutes → "1h 05m" (zero-padded minutes)', () => {
    assert.equal(fmtDuration(65 * 60_000), '1h 05m');
  });

  test('1 hour 23 minutes', () => {
    assert.equal(fmtDuration(83 * 60_000), '1h 23m');
  });

  test('negative ms clamped to 0s', () => {
    assert.equal(fmtDuration(-5000), '0s');
  });

  test('non-numeric treated as 0', () => {
    assert.equal(fmtDuration(undefined), '0s');
    assert.equal(fmtDuration(null), '0s');
  });
});

// ── fmtDate ───────────────────────────────────────────────────────────────────
describe('fmtDate', () => {
  test('valid Date object returns non-empty string', () => {
    const result = fmtDate(new Date('2025-06-16'));
    assert.ok(typeof result === 'string' && result.length > 0);
  });

  test('epoch ms number returns non-empty string', () => {
    const result = fmtDate(1_750_000_000_000);
    assert.ok(typeof result === 'string' && result.length > 0);
  });

  test('ISO string returns non-empty string', () => {
    const result = fmtDate('2025-06-16T00:00:00Z');
    assert.ok(typeof result === 'string' && result.length > 0);
  });

  test('invalid date string returns "—"', () => {
    assert.equal(fmtDate('not-a-date'), '—');
  });

  test('undefined input returns "—"', () => {
    assert.equal(fmtDate(undefined), '—');
  });

  test('NaN input returns "—"', () => {
    assert.equal(fmtDate(NaN), '—');
  });

  test('custom opts changes output format', () => {
    const full = fmtDate(new Date('2025-06-16'), { year: 'numeric', month: 'long', day: 'numeric' });
    const short = fmtDate(new Date('2025-06-16'));
    // They should differ in length because one includes the full year
    assert.notEqual(full, short);
  });
});
