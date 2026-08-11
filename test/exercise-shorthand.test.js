// ABBR-1: regression lock for the Island name-abbreviation dictionary.
// Display-only transform — must never touch ex.name/alias/history, so this
// test only ever asserts on the string output of shortenExerciseName.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SHORT_WORDS, shortenExerciseName, islandLabel } from '../js/shared/exercise-shorthand.js';

test('shortens every configured equipment word, case-insensitively', () => {
  assert.equal(shortenExerciseName('Incline Dumbbell Press'), 'Incline DB Press');
  assert.equal(shortenExerciseName('Barbell Row'), 'BB Row');
  assert.equal(shortenExerciseName('Machine Lateral Raises'), 'Mach Lateral Raises');
  assert.equal(shortenExerciseName('Kettlebell Swing'), 'KB Swing');
  assert.equal(shortenExerciseName('Overhead Cable Extension'), 'OH Cable Extension');
});

test('leaves names without a configured word untouched', () => {
  assert.equal(shortenExerciseName('Bench Press'), 'Bench Press');
  assert.equal(shortenExerciseName('Pull-up'), 'Pull-up');
});

test('only matches whole words, not substrings', () => {
  // "Overheadpress" (no space) must not be treated as the word "overhead".
  assert.equal(shortenExerciseName('Overheadpress Variant'), 'Overheadpress Variant');
});

test('handles empty/undefined input without throwing', () => {
  assert.equal(shortenExerciseName(''), '');
  assert.equal(shortenExerciseName(undefined), '');
});

test('every PPL_GIO_PLAN / PPL_HYBRID_PLAN exercise resolves to a stable, deterministic string', async () => {
  const { PPL_GIO_PLAN, PPL_HYBRID_PLAN } = await import('../js/workout.store.js');
  const allNames = [];
  for (const plan of [PPL_GIO_PLAN, PPL_HYBRID_PLAN]) {
    for (const week of [plan.weekA, plan.weekB]) {
      for (const day of Object.values(week)) {
        for (const ex of day) allNames.push(ex.name);
      }
    }
  }
  assert.ok(allNames.length > 0, 'sanity: plans are not empty');
  for (const name of allNames) {
    const shortened = shortenExerciseName(name);
    assert.equal(typeof shortened, 'string');
    assert.equal(shortenExerciseName(shortened), shortened, `idempotent for "${name}"`);
  }
});

test('SHORT_WORDS keeps "barbell" mapped to BB (Gio decision 2026-08-09, ABBR-1: no BR)', () => {
  assert.equal(SHORT_WORDS.barbell, 'BB');
});

// ABBR-1 п.2 — manual per-exercise tag (Edit Plan), Island-only override.
test('islandLabel: manual tag wins over name, compact or not', () => {
  assert.equal(islandLabel({ name: 'Incline Dumbbell Press', tag: 'DB' }), 'DB');
  assert.equal(islandLabel({ name: 'Incline Dumbbell Press', tag: 'DB' }, { compact: true }), 'DB');
});

test('islandLabel: no tag falls back to raw name (non-compact) or shortened name (compact)', () => {
  assert.equal(islandLabel({ name: 'Incline Dumbbell Press' }), 'Incline Dumbbell Press');
  assert.equal(islandLabel({ name: 'Incline Dumbbell Press' }, { compact: true }), 'Incline DB Press');
});

test('islandLabel: handles missing/undefined exercise without throwing', () => {
  assert.equal(islandLabel(null), '');
  assert.equal(islandLabel(undefined), '');
  assert.equal(islandLabel({}), '');
});
