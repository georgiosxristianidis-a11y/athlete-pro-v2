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
export function generateSparkline(data, width = 100, height = 30) {
  if (!data || data.length < 2) return '';

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2; // pixel padding top/bottom
  
  // Normalize points to SVG coordinates
  const pts = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return { x, y };
  });

  // Catmull-Rom to Cubic Bezier conversion
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

  // Create full path for the gradient fill
  const fillD = `${d} L ${width},${height} L 0,${height} Z`;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--c-gold)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--c-gold)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path class="spark-fill" d="${fillD}" fill="url(#spark-grad)" />
      <path class="spark-stroke" d="${d}" fill="none" vector-effect="non-scaling-stroke" />
    </svg>
  `;
}
