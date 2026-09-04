// js/shared/sparkline.js
/**
 * Elite Sparklines — SVG path from a value series.
 * Interpolation is Fritsch–Carlson monotone cubic (not Catmull-Rom): the
 * curve passes through every point and never invents peaks or dips below
 * the baseline. Catmull-Rom drew hooks on sparse strength/volume series.
 */

/** Allowed Home Volume Trend windows. Default 30 if storage is missing/corrupt. */
export const VOLUME_DAYS = [7, 30, 90];

/**
 * @param {unknown} raw
 * @returns {7|30|90}
 */
export function parseVolumeDays(raw) {
  const n = Number(raw);
  return VOLUME_DAYS.includes(n) ? /** @type {7|30|90} */ (n) : 30;
}

/**
 * Fritsch–Carlson monotone cubic → SVG path.
 * @param {{x:number,y:number}[]} P
 * @returns {string}
 */
export function monotoneCubicPath(P) {
  if (!P || !P.length) return '';
  if (P.length === 1) return `M ${P[0].x.toFixed(1)},${P[0].y.toFixed(1)}`;
  if (P.length === 2) {
    return `M ${P[0].x.toFixed(1)},${P[0].y.toFixed(1)} L ${P[1].x.toFixed(1)},${P[1].y.toFixed(1)}`;
  }

  const n = P.length;
  const dx = new Array(n - 1);
  const dy = new Array(n - 1);
  const m = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = P[i + 1].x - P[i].x;
    dy[i] = P[i + 1].y - P[i].y;
    m[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
  }

  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const f = 3 / Math.sqrt(s);
      t[i] = f * a * m[i];
      t[i + 1] = f * b * m[i];
    }
  }

  let d = `M ${P[0].x.toFixed(1)},${P[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c1x = P[i].x + h;
    const c1y = P[i].y + t[i] * h;
    const c2x = P[i + 1].x - h;
    const c2y = P[i + 1].y - t[i + 1] * h;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${P[i + 1].x.toFixed(1)},${P[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/**
 * Renders an SVG sparkline from an array of numbers.
 * @param {number[]} data Array of values (e.g. [1200, 1500, 1100, 1800])
 * @param {number} width SVG width
 * @param {number} height SVG height
 * @returns {string} SVG HTML string
 */
export function generateSparkline(data, width = 100, height = 30, strokeColor = '') {
  if (!data || data.length < 2) return '';

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const pts = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const d = monotoneCubicPath(pts);
  const strokeAttr = strokeColor ? ` stroke="${strokeColor}"` : '';

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
      <path class="spark-stroke" d="${d}" fill="none" vector-effect="non-scaling-stroke"${strokeAttr} />
    </svg>
  `;
}

/**
 * Renders multiple data series in a single SVG, all scaled to the same global max.
 * @param {{data: number[], color: string}[]} layers
 * @param {number} width
 * @param {number} height
 * @returns {string} SVG HTML string
 */
export function generateSparklineMulti(layers, width = 300, height = 80) {
  const validLayers = layers.filter((l) => l.data && l.data.length >= 2 && Math.max(...l.data) > 0);
  if (validLayers.length === 0) return '';

  const globalMax = Math.max(...validLayers.flatMap((l) => l.data));
  const globalMin = 0;
  const range = globalMax - globalMin || 1;
  const padding = 4;
  const n = validLayers[0].data.length;

  const paths = validLayers.map(({ data, color }) => {
    const pts = data.map((val, i) => {
      const x = (i / (n - 1)) * width;
      const y = height - padding - ((val - globalMin) / range) * (height - padding * 2);
      return { x, y };
    });
    const d = monotoneCubicPath(pts);
    return `<path class="spark-stroke" d="${d}" fill="none" vector-effect="non-scaling-stroke" stroke="${color}" />`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
      ${paths.join('\n      ')}
    </svg>
  `;
}
