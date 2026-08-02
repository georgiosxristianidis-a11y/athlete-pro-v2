import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage stub so the persistence helpers run under node --test.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { periodRange, loadPeriodPref, savePeriodPref, PERIOD_DAYS } =
  await import('../js/analytics.store.js');

const REF = new Date(2026, 5, 17, 14, 0, 0); // Wed 2026-06-17 14:00 local

describe('periodRange — rolling windows, not calendar-aligned', () => {
  test('week is a 7-day rolling window ending now', () => {
    const { since, until } = periodRange('week', null, REF);
    assert.equal(until, REF.getTime());
    assert.equal(since, REF.getTime() - 7 * 86400000);
  });

  test('month is a 30-day rolling window (matches pre-AN-1 default)', () => {
    const { since, until } = periodRange('month', null, REF);
    assert.equal(since, REF.getTime() - 30 * 86400000);
    assert.equal(until, REF.getTime());
  });

  test('3month is a 90-day rolling window', () => {
    const { since, until } = periodRange('3month', null, REF);
    assert.equal(since, REF.getTime() - 90 * 86400000);
    assert.equal(until, REF.getTime());
  });

  test('unknown period key falls back to month', () => {
    const a = periodRange('bogus', null, REF);
    const b = periodRange('month', null, REF);
    assert.deepEqual(a, b);
  });

  test('custom uses the given range verbatim when to <= now', () => {
    const from = new Date(2026, 4, 1).getTime();
    const to = new Date(2026, 4, 15).getTime();
    const { since, until } = periodRange('custom', { from, to }, REF);
    assert.equal(since, from);
    assert.equal(until, to);
  });

  test('custom clamps a future "to" date to now — no counting workouts that cannot exist yet', () => {
    const from = new Date(2026, 4, 1).getTime();
    const futureTo = new Date(2027, 0, 1).getTime();
    const { until } = periodRange('custom', { from, to: futureTo }, REF);
    assert.equal(until, REF.getTime());
  });

  test('custom without a range falls back to month (defensive default)', () => {
    const a = periodRange('custom', null, REF);
    const b = periodRange('month', null, REF);
    assert.deepEqual(a, b);
  });

  test('PERIOD_DAYS matches the window lengths used by periodRange', () => {
    assert.deepEqual(PERIOD_DAYS, { week: 7, month: 30, '3month': 90 });
  });
});

describe('period preference — persistence', () => {
  beforeEach(() => store.clear());

  test('defaults to month when nothing stored', () => {
    assert.deepEqual(loadPeriodPref(), { period: 'month', customRange: null });
  });

  test('round-trips a simple period', () => {
    savePeriodPref('week');
    assert.deepEqual(loadPeriodPref(), { period: 'week', customRange: null });
  });

  test('round-trips a custom range', () => {
    const customRange = { from: 1000, to: 2000 };
    savePeriodPref('custom', customRange);
    assert.deepEqual(loadPeriodPref(), { period: 'custom', customRange });
  });

  test('falls back to month on corrupt JSON', () => {
    store.set('ap-analytics-period', '{not json');
    assert.deepEqual(loadPeriodPref(), { period: 'month', customRange: null });
  });

  test('falls back to month on an unknown period value', () => {
    store.set('ap-analytics-period', JSON.stringify({ period: 'decade' }));
    assert.deepEqual(loadPeriodPref(), { period: 'month', customRange: null });
  });

  test('falls back to month on a custom entry missing from/to', () => {
    store.set('ap-analytics-period', JSON.stringify({ period: 'custom' }));
    assert.deepEqual(loadPeriodPref(), { period: 'month', customRange: null });
  });
});
