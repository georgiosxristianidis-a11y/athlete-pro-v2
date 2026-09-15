// @ts-check
// EX-RU-1 — RU display name for exercises. `exerciseLabel`/`findLibraryExercise`
// are pure (no store import) so they're testable without mocking DOM/IDB.
// Guard mirrors muscle-badge.test.js: every default-plan lift must resolve to
// a non-empty nameRu, or the picker/workout card silently falls back to
// English for a lift someone actually programmed into a preset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exerciseLabel, findLibraryExercise } from '../js/shared/exercise-label.js';
import { PPL_GIO_PLAN, PPL_HYBRID_PLAN } from '../js/workout.store.js';
import libraryJson from '../exercises-library.json' with { type: 'json' };

const library = libraryJson.exercises;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

test('exerciseLabel: lang=en returns the input name as-is', () => {
  assert.equal(exerciseLabel('Bench Press', { library, lang: 'en' }), 'Bench Press');
  assert.equal(exerciseLabel('Totally Made Up Exercise', { library, lang: 'en' }), 'Totally Made Up Exercise');
});

test('exerciseLabel: lang=ru resolves an exact library name to nameRu', () => {
  assert.equal(exerciseLabel('Barbell Bench Press', { library, lang: 'ru' }), 'Жим штанги лёжа');
});

test('exerciseLabel: lang=ru resolves a seed plan name via substring match', () => {
  // Same case the launch handoff opens with: plan writes "Bench Press",
  // library carries "Barbell Bench Press" + its nameRu.
  assert.equal(exerciseLabel('Bench Press', { library, lang: 'ru' }), 'Жим штанги лёжа');
});

test('exerciseLabel: lang=ru resolves seed names with no textual overlap via the override table', () => {
  const cases = {
    'Incline DB Press': 'Жим гантелей на наклонной скамье',
    'Butterfly Machine': 'Сведение рук в тренажёре (бабочка)',
    'Dips (Chest Focus)': 'Отжимания на брусьях (грудь)',
    'Hyperextensions': 'Гиперэкстензия',
    'Overhead Tricep Ext.': 'Французский жим с гантелей',
    'Wide-Grip Upright Row': 'Тяга штанги к подбородку',
    'Hip Adductor Machine': 'Сведение ног в тренажёре',
    'Hip Abductor Machine': 'Разведение ног в тренажёре',
    'Iso-Lateral Seated Row': 'Тяга в тренажёре с упором в грудь',
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(exerciseLabel(name, { library, lang: 'ru' }), expected, name);
  }
});

test('exerciseLabel: no library match returns the original string, no throw', () => {
  assert.equal(exerciseLabel('Totally Made Up Exercise Xyz', { library, lang: 'ru' }), 'Totally Made Up Exercise Xyz');
  assert.equal(exerciseLabel('', { library, lang: 'ru' }), '');
});

test('exerciseLabel: an empty nameRu on the matched entry does not blank the name', () => {
  const fakeLibrary = [{ name: 'Ghost Lift', nameRu: '' }];
  assert.equal(exerciseLabel('Ghost Lift', { library: fakeLibrary, lang: 'ru' }), 'Ghost Lift');
});

test('findLibraryExercise: returns null when nothing matches (not the input string)', () => {
  assert.equal(findLibraryExercise('Totally Made Up Exercise Xyz', library), null);
  assert.equal(findLibraryExercise('', library), null);
});

test('seed guard: every PPL_GIO_PLAN exercise resolves to a non-empty nameRu', () => {
  for (const name of planNames(PPL_GIO_PLAN)) {
    const label = exerciseLabel(name, { library, lang: 'ru' });
    assert.ok(label && label !== name, `"${name}" did not resolve to a RU label (got "${label}")`);
  }
});

test('seed guard: every PPL_HYBRID_PLAN exercise resolves to a non-empty nameRu', () => {
  for (const name of planNames(PPL_HYBRID_PLAN)) {
    const label = exerciseLabel(name, { library, lang: 'ru' });
    assert.ok(label && label !== name, `"${name}" did not resolve to a RU label (got "${label}")`);
  }
});

// ── Source guard — modals.js must keep dataset.name on the English key ─────
// The picker is free to *display* exerciseLabel()/nameRu, but a future pass
// translating the label must not also translate what gets written into the
// plan — that's the exact bug class 2026-07-08 (0kg history reset).

test('source: workout.view/modals.js shows exerciseLabel but writes dataset.name from ex.name', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/workout.view/modals.js'), 'utf8');
  assert.match(src, /exerciseLabel\(/, 'picker must use exerciseLabel() for display');
  assert.match(src, /btn\.dataset\.name = ex\.name;/, 'dataset.name must stay ex.name (the identifier), not the RU label');
});
