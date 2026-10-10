// @ts-check
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const {
  renderStrengthCurves,
  renderStrengthHero,
  buildSeries,
} = await import('../js/analytics.strength-curves.js');

function mountStub() {
  return {
    innerHTML: '',
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
}

const workout = (y, mo, d, exerciseName, weight, type = 'push') => ({
  type,
  timestamp: new Date(y, mo, d, 12).getTime(),
  duration: 3600,
  tonnage: weight * 5,
  exercises: [
    {
      name: exerciseName,
      sets: [{ weight, reps: 5, rpe: null, done: true }],
    },
  ],
});

describe('Strength Curves UI & Onboarding Support', () => {
  test('single-point workout renders baseline card with dashed reference line and baseline badge', () => {
    const mount = mountStub();
    // Single workout (1 session / 1 month)
    const workouts = [workout(2026, 0, 15, 'Bench Press', 75, 'push')];

    renderStrengthCurves(workouts, mount);

    assert.ok(mount.innerHTML.includes('sc-card'), 'should render .sc-card');
    assert.ok(mount.innerHTML.includes('Bench Press'), 'should render exercise name');
    assert.ok(mount.innerHTML.includes('75<span class="sc-unit">kg</span>'), 'should render current weight');
    // Baseline markers
    assert.match(mount.innerHTML, /Базовый вес|Baseline/, 'should include baseline badge');
    assert.match(mount.innerHTML, /1-я точка|1st mark/, 'should include 1st mark indicator');
    // SVG geometry: dashed line & single centered circle, no NaN
    assert.ok(mount.innerHTML.includes('stroke-dasharray="4 4"'), 'should render dashed baseline indicator');
    assert.ok(mount.innerHTML.includes('sc-cur-dot'), 'should render current dot');
    assert.doesNotMatch(mount.innerHTML, /NaN/, 'must not have NaN in SVG or text');
  });

  test('multi-month progression renders smooth curve with peak dot and delta', () => {
    const mount = mountStub();
    const workouts = [
      workout(2026, 0, 10, 'Overhead Press', 50, 'push'),
      workout(2026, 1, 10, 'Overhead Press', 55, 'push'),
      workout(2026, 2, 10, 'Overhead Press', 60, 'push'),
    ];

    renderStrengthCurves(workouts, mount);

    assert.ok(mount.innerHTML.includes('sc-card'), 'should render .sc-card');
    assert.ok(mount.innerHTML.includes('Overhead Press'), 'should render exercise name');
    assert.ok(mount.innerHTML.includes('60<span class="sc-unit">kg</span>'), 'should render current weight');
    assert.ok(mount.innerHTML.includes('+10 kg'), 'should render +10 kg delta');
    assert.ok(mount.innerHTML.includes('peak 60'), 'should render peak weight');
    assert.ok(mount.innerHTML.includes('sc-peak-dot'), 'should render gold peak dot');
    assert.ok(mount.innerHTML.includes('sc-stroke'), 'should render stroke line');
    assert.doesNotMatch(mount.innerHTML, /NaN/, 'must not have NaN in SVG');
  });

  test('accepts precomputed curves array from getCachedOrComputeProgressionCurves', () => {
    const mount = mountStub();
    const mockCurves = [
      {
        name: 'Barbell Row',
        pts: [
          { t: new Date(2026, 0, 15).getTime(), v: 70 },
          { t: new Date(2026, 1, 15).getTime(), v: 75 },
        ],
        type: 'pull',
        n: 4,
        delta: 5,
        bestWeight: 75,
        currentWeight: 75,
      },
    ];

    renderStrengthCurves(mockCurves, mount);

    assert.ok(mount.innerHTML.includes('Barbell Row'), 'should render precomputed curve');
    assert.ok(mount.innerHTML.includes('75<span class="sc-unit">kg</span>'), 'should render current weight');
    assert.ok(mount.innerHTML.includes('+5 kg'), 'should render delta');
  });

  test('empty workout history renders polite onboarding hint without error or blank void', () => {
    const mount = mountStub();
    renderStrengthCurves([], mount);

    assert.ok(mount.innerHTML.includes('sc-empty-hint'), 'should render onboarding hint container');
    assert.match(mount.innerHTML, /Прогрессия|Progression/, 'should explain progression tracking');
  });

  test('workouts with zero valid weights render onboarding hint', () => {
    const mount = mountStub();
    const workouts = [
      {
        type: 'push',
        timestamp: Date.now(),
        exercises: [{ name: 'Push-ups', sets: [{ weight: 0, reps: 20, done: true }] }],
      },
    ];

    renderStrengthCurves(workouts, mount);
    assert.ok(mount.innerHTML.includes('sc-empty-hint'), 'zero-weight workouts show hint');
  });

  test('buildSeries defaults to minMonths = 3, preserving renderStrengthHero contract', () => {
    const mount = mountStub();
    // 2 workouts in same month (< 3 months)
    const shortSpan = [
      workout(2026, 0, 1, 'Bench Press', 60),
      workout(2026, 0, 15, 'Bench Press', 62),
    ];

    const heroSeries = buildSeries(shortSpan);
    assert.equal(heroSeries.length, 0, 'hero series requires 3 months');

    renderStrengthHero(shortSpan, mount);
    assert.equal(mount.innerHTML, '', 'hero hides for < 3 months');

    // Progression curves with minMonths = 1 include it
    const curveSeries = buildSeries(shortSpan, { minMonths: 1 });
    assert.equal(curveSeries.length, 1, 'progression curves include 1-month lift');
    assert.equal(curveSeries[0].name, 'Bench Press');
  });
});
