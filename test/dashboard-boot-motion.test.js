import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

describe('SPLASH-1 - zero black screen boot and no #loading', () => {
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const appJs = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
  const bootJs = readFileSync(join(ROOT, 'js/boot.js'), 'utf8');

  test('index.html does not contain #loading or splash-mark', () => {
    assert.ok(!indexHtml.includes('id="loading"'), 'no id=loading');
    assert.ok(!indexHtml.includes('splash-mark'), 'no splash-mark');
  });

  test('app.js and boot.js do not contain hideLoading or bootTimeout', () => {
    assert.ok(!appJs.includes('hideLoading'), 'no hideLoading in app.js');
    assert.ok(!appJs.includes('bootTimeout'), 'no bootTimeout in app.js');
    assert.ok(!bootJs.includes('hideLoading'), 'no hideLoading in boot.js');
  });
});

describe('MOTION-1 - stagger-item cascade and skeletons', () => {
  const baseCss = readFileSync(join(ROOT, 'css/base.css'), 'utf8');
  const dashboardJs = readFileSync(join(ROOT, 'js/dashboard.js'), 'utf8');

  test('base.css has stagger-item delays up to 12', () => {
    assert.ok(baseCss.includes('.stagger-item:nth-child(1)'), 'nth-child 1');
    assert.ok(baseCss.includes('.stagger-item:nth-child(6)'), 'nth-child 6');
    assert.ok(baseCss.includes('.stagger-item:nth-child(12)'), 'nth-child 12');
  });

  test('dashboard.js has .sk skeletons for key metrics in template', () => {
    assert.ok(dashboardJs.includes('id="dash-vol-week"'), 'dash-vol-week');
    assert.ok(dashboardJs.includes('id="dash-vol-month"'), 'dash-vol-month');
    assert.ok(dashboardJs.includes('id="dash-sessions"'), 'dash-sessions');
    assert.ok(dashboardJs.includes('id="spark-total" class="sk"'), 'spark-total sk');
    assert.ok(dashboardJs.includes('id="weekly-summary-value"'), 'weekly-summary-value');
    assert.ok(dashboardJs.includes('class="streak-count sk" id="streak-count"'), 'streak-count sk');
    assert.ok(dashboardJs.includes('class="badge badge-accent sk" id="dash-total"'), 'dash-total sk');
  });

  test('dashboard.js marks sections with .stagger-item', () => {
    assert.ok(dashboardJs.includes('dash-hero stagger-item'), 'hero stagger');
    assert.ok(dashboardJs.includes('stat-row stagger-item'), 'stat-row stagger');
    assert.ok(dashboardJs.includes('dash-card stagger-item'), 'dash-card stagger');
    assert.ok(dashboardJs.includes('streak-card stagger-item'), 'streak-card stagger');
    assert.ok(dashboardJs.includes('ppl-gauge-card stagger-item'), 'ppl gauge stagger');
    assert.ok(dashboardJs.includes('orm-row stagger-item'), 'orm-row stagger');
    assert.ok(dashboardJs.includes('session-item stagger-item'), 'session-item stagger');
  });
});

describe('SPLASH-1 / MOTION-1 - localStorage flags and Spring physics', () => {
  const handlersJs = readFileSync(join(ROOT, 'js/workout.view/handlers.js'), 'utf8');
  const profileJs = readFileSync(join(ROOT, 'js/profile.js'), 'utf8');
  const dashboardJs = readFileSync(join(ROOT, 'js/dashboard.js'), 'utf8');
  const springJs = readFileSync(join(ROOT, 'js/shared/spring.js'), 'utf8');

  test('workout save saves ap-has-workouts and ap-last-workout-type', () => {
    assert.ok(handlersJs.includes('ap-has-workouts'), 'handlers.js sets ap-has-workouts');
    assert.ok(handlersJs.includes('ap-last-workout-type'), 'handlers.js sets ap-last-workout-type');
  });

  test('profile.js removes flags on clearAllData', () => {
    assert.ok(profileJs.includes('ap-has-workouts'), 'profile.js removes ap-has-workouts');
    assert.ok(profileJs.includes('ap-last-workout-type'), 'profile.js removes ap-last-workout-type');
  });

  test('dashboard.js reads flags before await and guards desync', () => {
    assert.ok(dashboardJs.includes("localStorage.getItem('ap-has-workouts')"), 'dashboard.js reads ap-has-workouts');
    assert.ok(dashboardJs.includes("localStorage.getItem('ap-last-workout-type')"), 'dashboard.js reads ap-last-workout-type');
    assert.ok(dashboardJs.includes('_hasAnimatedStats'), 'dashboard.js tracks session animation state');
  });

  test('spring.js clamps dt to prevent numerical explosion', () => {
    assert.ok(springJs.includes('Math.min('), 'spring.js clamps dt');
  });

  test('directLaunch delegates through _loadWorkout and normalizes type', () => {
    assert.ok(dashboardJs.includes('_loadWorkout'), 'dashboard.js uses _loadWorkout in directLaunch');
    assert.ok(dashboardJs.includes('.toLowerCase().trim()'), 'dashboard.js normalizes workout type');
  });
});
