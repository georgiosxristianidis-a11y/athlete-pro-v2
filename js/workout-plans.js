// @ts-check
/* ════════════════════════════════════════════════════════
   workout-plans.js — Structured Training Programs
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} Program
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'strength'|'hypertrophy'|'hybrid'} type
 * @property {number} durationWeeks
 * @property {string[]} days — e.g. ['A', 'B', 'A']
 * @property {Object} templates — { A: [], B: [] }
 * @property {Function} getProgression — (exercise, history) => {weight, reps, sets}
 */

/** @type {Program[]} */
export const PROGRAMS = [
  {
    id: 'ppl-classic',
    name: 'Classic PPL',
    description: 'The standard Push-Pull-Legs rotation for balanced growth.',
    type: 'hybrid',
    durationWeeks: 4,
    days: ['push', 'pull', 'legs'],
    templates: {
      push: [
        { name: 'Bench Press', sets: 3, reps: 8 },
        { name: 'Overhead Press', sets: 3, reps: 10 },
        { name: 'Incline DB Press', sets: 3, reps: 12 },
        { name: 'Lateral Raise', sets: 3, reps: 15 },
        { name: 'Tricep Pushdown', sets: 3, reps: 12 },
      ],
      pull: [
        { name: 'Deadlift', sets: 1, reps: 5 },
        { name: 'Pull-up', sets: 3, reps: 8 },
        { name: 'Barbell Row', sets: 3, reps: 10 },
        { name: 'Face Pull', sets: 3, reps: 15 },
        { name: 'Bicep Curl', sets: 3, reps: 12 },
      ],
      legs: [
        { name: 'Squat', sets: 3, reps: 5 },
        { name: 'Romanian Deadlift', sets: 3, reps: 10 },
        { name: 'Leg Press', sets: 3, reps: 12 },
        { name: 'Leg Curl', sets: 3, reps: 12 },
        { name: 'Calf Raise', sets: 3, reps: 15 },
      ]
    },
    getProgression: (ex, last) => {
      // Linear: +2.5kg if all sets hit target reps
      if (!last) return { weight: 0, reps: ex.reps, sets: ex.sets };
      const success = last.sets.every(s => s.reps >= ex.reps);
      return {
        weight: success ? last.sets[0].weight + 2.5 : last.sets[0].weight,
        reps: ex.reps,
        sets: ex.sets,
        autoBumped: success
      };
    }
  },
  {
    id: '5x5-power',
    name: 'Strong 5x5',
    description: 'Pure strength focus. 3 days a week, focusing on 5 reps of core lifts.',
    type: 'strength',
    durationWeeks: 6,
    days: ['A', 'B'],
    templates: {
      A: [
        { name: 'Squat', sets: 5, reps: 5 },
        { name: 'Bench Press', sets: 5, reps: 5 },
        { name: 'Barbell Row', sets: 5, reps: 5 },
      ],
      B: [
        { name: 'Squat', sets: 5, reps: 5 },
        { name: 'Overhead Press', sets: 5, reps: 5 },
        { name: 'Deadlift', sets: 1, reps: 5 },
      ]
    },
    getProgression: (ex, last) => {
      if (!last) return { weight: 0, reps: ex.reps, sets: ex.sets };
      const success = last.sets.every(s => s.reps >= ex.reps);
      const inc = ex.name === 'Deadlift' ? 5 : 2.5;
      return {
        weight: success ? last.sets[0].weight + inc : last.sets[0].weight,
        reps: ex.reps,
        sets: ex.sets,
        autoBumped: success
      };
    }
  }
];

/**
 * Get program by ID.
 * @param {string} id
 * @returns {Program|undefined}
 */
export function getProgram(id) {
  return PROGRAMS.find(p => p.id === id);
}
