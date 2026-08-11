import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { workoutsToCsv } = await import('../js/shared/csv-export.js');

const W = [{
  type: 'push',
  timestamp: Date.UTC(2026, 6, 30, 9, 0),
  duration: 58 * 60000,
  tonnage: 100,
  exercises: [
    { name: 'Bench Press', sets: [{ weight: 80, reps: 8, rpe: 8 }] },
    { name: 'Incline DB Press', tag: 'DBI', sets: [{ weight: 20, reps: 10, rpe: null }] },
  ],
}];

describe('workoutsToCsv', () => {
  test('header carries a Tag column', () => {
    const csv = workoutsToCsv(W);
    assert.match(csv.split('\n')[0], /^Date,Type,Duration \(min\),Tonnage \(kg\),Exercise,Tag,Set,Weight \(kg\),Reps,RPE$/);
  });

  test('tagged exercise carries its tag in the row', () => {
    const csv = workoutsToCsv(W);
    const row = csv.split('\n').find((r) => r.includes('Incline DB Press'));
    assert.match(row, /"Incline DB Press","DBI"/);
  });

  test('untagged exercise leaves the Tag column empty, not undefined', () => {
    const csv = workoutsToCsv(W);
    const row = csv.split('\n').find((r) => r.includes('Bench Press'));
    assert.match(row, /"Bench Press",,1,80,8,8/);
    assert.ok(!row.includes('undefined'));
  });
});
