// @ts-check
import { downloadText } from './download.js';

/**
 * Convert workout data to CSV format.
 * @param {Array<import('../db.js').WorkoutRecord>} workouts 
 * @returns {string}
 */
export function workoutsToCsv(workouts) {
  const header = ['Date', 'Type', 'Duration (min)', 'Tonnage (kg)', 'Exercise', 'Tag', 'Set', 'Weight (kg)', 'Reps', 'RPE'].join(',');
  const rows = [];

  workouts.forEach(w => {
    const date = new Date(w.timestamp).toISOString().split('T')[0];
    w.exercises.forEach(ex => {
      ex.sets.forEach((set, idx) => {
        rows.push([
          date,
          w.type,
          Math.round((w.duration || 0) / 60000),
          w.tonnage,
          `"${ex.name.replace(/"/g, '""')}"`,
          ex.tag ? `"${ex.tag.replace(/"/g, '""')}"` : '',
          idx + 1,
          set.weight,
          set.reps,
          set.rpe || ''
        ].join(','));
      });
    });
  });

  return [header, ...rows].join('\n');
}

/**
 * Trigger a download of CSV data.
 * @param {string} csv 
 * @param {string} filename 
 */
export function downloadCsv(csv, filename) {
  downloadText(csv, filename, 'text/csv;charset=utf-8;');
}
