// @ts-check
// MUSCLE-BADGE — the exercise-card muscle badge must never show UNKNOWN for a
// lift that ships in the default plans. Root cause: getMuscleBadge (workout
// .view/render.js) matched exercise names against exercises-library.json by
// exact-then-one-direction-substring only. Plan display names diverge from
// the library's naming ("Butterfly Machine" vs "Pec Deck Fly", "Chest-
// Supported T-Bar Row" vs "T-Bar Row") so several lifts across PPL | GIO and
// PPL | Hybrid resolved to nothing. Fixed by extracting a pure
// resolveMuscleGroup(name, library) — bidirectional substring match plus a
// manual override table for names the library has no textual overlap with —
// so the guard below can run without mocking DOM/IDB/fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PPL_GIO_PLAN, PPL_HYBRID_PLAN, resolveMuscleGroup } from '../js/workout.store.js';
import libraryJson from '../exercises-library.json' with { type: 'json' };

const library = libraryJson.exercises;

/** Every exercise name across every week/day of a plan (deduped). */
function planNames(plan) {
  const names = new Set();
  for (const week of Object.values(plan)) {
    for (const day of Object.values(week)) {
      for (const ex of day) names.add(ex.name);
    }
  }
  return names;
}

// ── Baseline — reproduces the reported bug ──────────────────────────────────

test('baseline: old exact/one-direction-substring match leaves plan lifts unresolved', () => {
  const oldResolve = (name) => {
    const clean = name.toLowerCase().trim();
    const matched = library.find(i => i.name.toLowerCase().trim() === clean)
      || library.find(i => i.name.toLowerCase().includes(clean));
    return matched ? matched.muscleGroup.toLowerCase() : null;
  };
  const unresolved = [...planNames(PPL_GIO_PLAN)].filter(n => !oldResolve(n));
  // These are exactly the names reported as UNKNOWN in the app.
  assert.ok(unresolved.includes('Incline DB Press'));
  assert.ok(unresolved.includes('Butterfly Machine'));
  assert.ok(unresolved.includes('Chest-Supported T-Bar Row'));
  assert.ok(unresolved.length > 0);
});

// ── Fix — resolveMuscleGroup resolves every plan lift ───────────────────────

test('resolveMuscleGroup: every PPL_GIO_PLAN exercise resolves to a known muscle group', () => {
  for (const name of planNames(PPL_GIO_PLAN)) {
    const group = resolveMuscleGroup(name, library);
    assert.ok(group, `"${name}" resolved to ${group} (expected a muscle group)`);
  }
});

test('resolveMuscleGroup: every PPL_HYBRID_PLAN exercise resolves to a known muscle group', () => {
  for (const name of planNames(PPL_HYBRID_PLAN)) {
    const group = resolveMuscleGroup(name, library);
    assert.ok(group, `"${name}" resolved to ${group} (expected a muscle group)`);
  }
});

test('resolveMuscleGroup: previously-broken names resolve to the correct group', () => {
  const cases = {
    'Incline DB Press': 'chest',
    'Butterfly Machine': 'chest',
    'Dips (Chest Focus)': 'chest',
    'Alternating Dumbbell Curls': 'biceps',
    'Preacher Curls': 'biceps',
    'Hanging Leg Raises': 'abs',
    'Hyperextensions': 'lower back',
    'Chest-Supported T-Bar Row': 'back',
    'Overhead Tricep Ext.': 'triceps',
    'Wide-Grip Upright Row': 'shoulders',
    'Leg Extensions': 'quadriceps',
    'Hip Adductor Machine': 'adductors',
    'Hip Abductor Machine': 'glutes',
    'Iso-Lateral Seated Row': 'back',
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(resolveMuscleGroup(name, library), expected, name);
  }
});

test('resolveMuscleGroup: still-working exact/fuzzy matches keep resolving', () => {
  assert.equal(resolveMuscleGroup('Bench Press', library), 'chest');
  assert.equal(resolveMuscleGroup('Hammer Curl', library), 'biceps');
  assert.equal(resolveMuscleGroup('Pull-up', library), 'back');
  assert.equal(resolveMuscleGroup('Leg Press', library), 'quadriceps');
  assert.equal(resolveMuscleGroup('Barbell Hip Thrust', library), 'glutes');
  assert.equal(resolveMuscleGroup('Leg Curl', library), 'hamstrings');
  assert.equal(resolveMuscleGroup('Calf Raise', library), 'calves');
});

test('resolveMuscleGroup: unmatched free-text name returns null (no fake UNKNOWN group)', () => {
  assert.equal(resolveMuscleGroup('Totally Made Up Exercise Xyz', library), null);
  assert.equal(resolveMuscleGroup('', library), null);
});
