import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('Phase 2 — Performance post-conditions', () => {

  test('PERF-3: index.html contains zero gstatic.com/firebasejs references', () => {
    const html = readText('index.html');
    const matches = (html.match(/gstatic\.com\/firebasejs/g) || []).length;
    assert.equal(matches, 0, 'index.html still has gstatic.com/firebasejs references');
  });

  test('PERF-1: js/dashboard.js does not call DB.Workouts.weeklyVolume() directly', () => {
    const src = readText('js/dashboard.js');
    assert.ok(
      !src.includes('DB.Workouts.weeklyVolume()'),
      'dashboard.js still calls DB.Workouts.weeklyVolume() — should use weeklyVolumeFrom()'
    );
    assert.ok(
      !src.includes('DB.Workouts.monthlyVolume()'),
      'dashboard.js still calls DB.Workouts.monthlyVolume() — should use monthlyVolumeFrom()'
    );
    assert.ok(
      !src.includes('DB.Workouts.monthlyCount()'),
      'dashboard.js still calls DB.Workouts.monthlyCount() — should use monthlyCountFrom()'
    );
    assert.ok(
      !src.includes('DB.Workouts.pplTonnage()'),
      'dashboard.js still calls DB.Workouts.pplTonnage() — should use pplTonnageFrom()'
    );
  });

  test('PERF-2: js/app.js does not statically import analytics.view.js', () => {
    const src = readText('js/app.js');
    assert.ok(
      !(/import\s*\{[^}]*Analytics[^}]*\}\s*from\s*['"]\.\/analytics\.view\.js['"]/.test(src)),
      'app.js still has a static import of analytics.view.js'
    );
  });

  test('PERF-3: js/app.js does not statically import db-firebase.js', () => {
    const src = readText('js/app.js');
    assert.ok(
      !(/import\s.*from\s*['"]\.\/db-firebase\.js['"]/.test(src)),
      'app.js still has a static import of db-firebase.js — Firebase module should be lazy-loaded'
    );
  });

  test('PERF-HIST: render.js reads workout history once per render, not once per exercise', () => {
    const src = readText('js/workout.view/render.js');
    const calls = (src.match(/DB\.Workouts\.getAll\(\)/g) || []).length;
    assert.equal(
      calls,
      1,
      'render.js should call DB.Workouts.getAll() exactly once (in renderActive) — ' +
        '_getLastSessionWeight/_computeCoachTarget/_getLastSessionSummary/_getExerciseHistory ' +
        'must take the history as an argument instead of fetching it themselves'
    );
  });

  test('PERF-HIST: renderExerciseCard and the coach-target chain take workouts as an argument', () => {
    const src = readText('js/workout.view/render.js');
    assert.match(src, /export async function renderExerciseCard\(ex, ei, workouts\)/);
    assert.match(src, /_computeCoachTarget\(ex\.name, workouts\)/);
  });

  test('PERF-HIST: boot backup-reminder check does not read the full workout history just to test count > 0', () => {
    const src = readText('js/app.js');
    assert.ok(
      !src.includes('DB.Workouts.getAll()'),
      'boot backup-reminder still does a full table scan — shouldRemindBackup only needs workoutCount > 0'
    );
    assert.ok(
      src.includes('DB.Workouts.getLast(1)'),
      'boot backup-reminder should use DB.Workouts.getLast(1) — a single cursor hit instead of getAll()'
    );
  });

});
