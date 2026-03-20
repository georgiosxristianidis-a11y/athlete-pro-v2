const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

});
