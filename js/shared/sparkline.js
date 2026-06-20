// js/shared/sparkline.js
/**
 * Elite Sparklines - SVG Path Generator using Catmull-Rom to Bezier conversion.
 * Zero dependencies, pure math.
 */

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

  const d = _catmullRomPath(pts);
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
  const validLayers = layers.filter(l => l.data && l.data.length >= 2 && Math.max(...l.data) > 0);
  if (validLayers.length === 0) return '';

  const globalMax = Math.max(...validLayers.flatMap(l => l.data));
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
    const d = _catmullRomPath(pts);
    return `<path class="spark-stroke" d="${d}" fill="none" vector-effect="non-scaling-stroke" stroke="${color}" />`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
      ${paths.join('\n      ')}
    </svg>
  `;
}

function _catmullRomPath(pts) {
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 === pts.length ? i + 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}
