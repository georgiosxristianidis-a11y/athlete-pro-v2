import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { monotoneCubicPath, parseVolumeDays, VOLUME_DAYS } from '../js/shared/sparkline.js';
import {
  renderStrengthHero,
  valueBand,
  strengthIndexPlot,
} from '../js/analytics.strength-curves.js';

/** Sample a cubic Bézier Y at t in [0,1]. */
function cubicY(y0, y1, y2, y3, t) {
  const u = 1 - t;
  return u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
}

/** Collect Y samples along every C segment of an SVG path. */
function samplePathY(d, steps = 12) {
  const ys = [];
  const m = d.match(/^M ([\d.-]+),([\d.-]+)(.*)$/);
  assert.ok(m, `path must start with M: ${d}`);
  let y = Number(m[2]);
  ys.push(y);
  const rest = m[3];
  const re = / C ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g;
  let seg;
  let found = 0;
  while ((seg = re.exec(rest))) {
    found++;
    const c1y = Number(seg[2]);
    const c2y = Number(seg[4]);
    const p2y = Number(seg[6]);
    for (let i = 1; i <= steps; i++) ys.push(cubicY(y, c1y, c2y, p2y, i / steps));
    y = p2y;
  }
  assert.ok(found > 0, `expected C segments in ${d}`);
  return ys;
}

describe('monotoneCubicPath', () => {
  test('two points is a straight line, not a cubic', () => {
    const d = monotoneCubicPath([
      { x: 0, y: 10 },
      { x: 100, y: 90 },
    ]);
    assert.match(d, /^M /);
    assert.match(d, / L /);
    assert.doesNotMatch(d, / C /);
  });

  test('a V-shape stays inside the point Y range (Catmull-Rom overshoots here)', () => {
    const P = [
      { x: 0, y: 80 },
      { x: 50, y: 10 },
      { x: 100, y: 80 },
    ];
    const ys = samplePathY(monotoneCubicPath(P));
    const lo = Math.min(...P.map((p) => p.y));
    const hi = Math.max(...P.map((p) => p.y));
    for (const y of ys) {
      assert.ok(y >= lo - 0.15 && y <= hi + 0.15, `y=${y} outside [${lo}, ${hi}]`);
    }
  });

  test('a climb does not dip below the start or overshoot the end', () => {
    const P = [
      { x: 0, y: 80 },
      { x: 40, y: 50 },
      { x: 80, y: 30 },
      { x: 120, y: 10 },
    ];
    const ys = samplePathY(monotoneCubicPath(P));
    const lo = Math.min(...P.map((p) => p.y));
    const hi = Math.max(...P.map((p) => p.y));
    for (const y of ys) {
      assert.ok(y >= lo - 0.15 && y <= hi + 0.15, `y=${y} outside [${lo}, ${hi}]`);
    }
  });
});

describe('parseVolumeDays', () => {
  test('VOLUME_DAYS is 7 / 30 / 90', () => {
    assert.deepEqual(VOLUME_DAYS, [7, 30, 90]);
  });

  test('known windows pass through', () => {
    assert.equal(parseVolumeDays(7), 7);
    assert.equal(parseVolumeDays('30'), 30);
    assert.equal(parseVolumeDays(90), 90);
  });

  test('missing or junk falls back to 30', () => {
    assert.equal(parseVolumeDays(null), 30);
    assert.equal(parseVolumeDays(''), 30);
    assert.equal(parseVolumeDays(14), 30);
    assert.equal(parseVolumeDays('nope'), 30);
  });
});

describe('valueBand', () => {
  test('pads a tight climb so the plot is not a full-height cliff', () => {
    const { vmin, vmax, vr } = valueBand([80, 82, 85]);
    assert.ok(vmin < 80);
    assert.ok(vmax > 85);
    assert.ok(vr > 5);
  });
});

function mountStub() {
  return { innerHTML: '' };
}

const w = (y, mo, d, weight) => ({
  type: 'push',
  timestamp: new Date(y, mo, d, 12).getTime(),
  duration: 0,
  tonnage: weight * 5,
  exercises: [{ name: 'Bench Press', sets: [{ weight, reps: 5, rpe: null, done: true }] }],
});

describe('Strength Index hero is a tap target', () => {
  test('a tracked journey renders data-action=analytics:openIndex', () => {
    const mount = mountStub();
    const workouts = [
      w(2026, 0, 10, 60),
      w(2026, 1, 10, 65),
      w(2026, 2, 10, 70),
      w(2026, 3, 10, 75),
    ];
    renderStrengthHero(workouts, mount);
    assert.match(mount.innerHTML, /data-action="analytics:openIndex"/);
    assert.match(mount.innerHTML, /role="button"/);
  });

  test('the drill-down plot returns geometry for a tracked journey', () => {
    const workouts = [
      w(2026, 0, 10, 60),
      w(2026, 1, 10, 65),
      w(2026, 2, 10, 70),
      w(2026, 3, 10, 75),
    ];
    const plot = strengthIndexPlot(workouts);
    assert.ok(plot);
    assert.ok(plot.pts.length >= 3);
    assert.ok(plot.html.includes('idx-chart-grad'));
    assert.equal(plot.viewW, 320);
    assert.equal(plot.viewH, 140);
  });
});
