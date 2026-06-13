import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

let db;
before(async () => {
  // db.js is importable under Node: crypto Worker is lazy, IDB opens on demand
  db = await import('../js/db.js');
});

// Fixed reference: Wednesday, 2026-06-17 14:00 local.
// Calendar week starts Mon 2026-06-15; calendar month starts 2026-06-01.
const REF = new Date(2026, 5, 17, 14, 0, 0);
const at = (y, m, d, h = 12) => ({ timestamp: new Date(y, m, d, h).getTime() });
const w = (y, m, d, type, tonnage, h = 12) => ({ ...at(y, m, d, h), type, tonnage, duration: 0 });

describe('period boundaries — single source of truth', () => {
  test('startOfWeek lands on Monday 00:00', () => {
    const s = new Date(db.startOfWeek(REF));
    assert.equal(s.getDay(), 1); // Monday
    assert.equal(s.getHours(), 0);
    assert.equal(s.getDate(), 15);
  });

  test('startOfWeek treats Sunday as end of the week (Monday before)', () => {
    const sun = new Date(2026, 5, 21, 9); // Sun 2026-06-21
    const s = new Date(db.startOfWeek(sun));
    assert.equal(s.getDate(), 15); // still Mon the 15th
  });

  test('startOfMonth lands on the 1st 00:00', () => {
    const s = new Date(db.startOfMonth(REF));
    assert.equal(s.getDate(), 1);
    assert.equal(s.getMonth(), 5);
    assert.equal(s.getHours(), 0);
  });
});

describe('weekly vs monthly volume — no spurious equality', () => {
  const list = [
    w(2026, 5, 16, 'push', 1000), // this week + this month
    w(2026, 5, 10, 'pull', 2000), // earlier this month, NOT this week
    w(2026, 4, 20, 'legs', 4000), // last month
  ];

  test('weeklyVolumeFrom counts only the current calendar week', () => {
    assert.equal(db.weeklyVolumeFrom(list, REF), 1000);
  });

  test('monthlyVolumeFrom counts the whole calendar month', () => {
    assert.equal(db.monthlyVolumeFrom(list, REF), 3000);
  });

  test('week and month diverge when older-in-month data exists', () => {
    assert.notEqual(db.weeklyVolumeFrom(list, REF), db.monthlyVolumeFrom(list, REF));
  });
});

describe('counts use the same boundaries as volume', () => {
  const list = [
    w(2026, 5, 16, 'push', 1000),
    w(2026, 5, 15, 'pull', 1000), // Monday boundary inclusive
    w(2026, 5, 10, 'legs', 1000),
  ];

  test('weeklyCountFrom is inclusive of the Monday boundary', () => {
    assert.equal(db.weeklyCountFrom(list, REF), 2);
  });

  test('monthlyCountFrom covers the calendar month', () => {
    assert.equal(db.monthlyCountFrom(list, REF), 3);
  });

  test('week count never exceeds month count for same data', () => {
    assert.ok(db.weeklyCountFrom(list, REF) <= db.monthlyCountFrom(list, REF));
  });
});

describe('pplTonnageFrom — split by type', () => {
  test('sums tonnage per push/pull/legs and ignores unknown types', () => {
    const list = [
      w(2026, 5, 16, 'push', 100),
      w(2026, 5, 16, 'push', 50),
      w(2026, 5, 16, 'pull', 200),
      w(2026, 5, 16, 'cardio', 999), // unknown — ignored
    ];
    assert.deepEqual(db.pplTonnageFrom(list), { push: 150, pull: 200, legs: 0 });
  });
});
