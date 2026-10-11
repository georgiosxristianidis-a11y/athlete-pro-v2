// @ts-check
/* ════════════════════════════════════════════════════════
   shared/volume-trend.js — агрегация Volume Trend на главной
   ────────────────────────────────────────────────────────
   Чистая функция, без DOM. Шаг корзины зависит от окна:
     7  → 7 дневных корзин (столбики, PPL-тип = доминирующий по тоннажу)
     30 → 5 недельных, 90 → 13 недельных (одна суммарная линия)
   Недели считаются от «сегодня» назад, самая старая клипуется по границе
   окна — сумма корзин всегда равна total.
   Пилюля: окно против предыдущего РАВНОГО окна (trendPercent).
   ════════════════════════════════════════════════════════ */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {{ value: number, type: 'push'|'pull'|'legs'|null }} VolumeBucket
 * @typedef {{ mode: 'day'|'week', buckets: VolumeBucket[], total: number, prevTotal: number, days: number }} VolumeTrend
 */

/**
 * @param {{timestamp:number, tonnage?:number, type?:string}[]|null|undefined} workouts
 * @param {number} days — окно: 7 | 30 | 90
 * @param {Date} [now]
 * @returns {VolumeTrend}
 */
export function volumeTrend(workouts, days, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const mode = days <= 7 ? 'day' : 'week';
  const step = mode === 'day' ? 1 : 7;
  const count = Math.ceil(days / step);

  const sums = Array.from({ length: count }, () => ({ value: 0, push: 0, pull: 0, legs: 0 }));
  let total = 0;
  let prevTotal = 0;

  for (const w of workouts || []) {
    const wd = new Date(w.timestamp);
    wd.setHours(0, 0, 0, 0);
    // round, а не floor: смена часового пояса даёт сутки по 23/25 ч
    const age = Math.round((todayMs - wd.getTime()) / DAY_MS);
    const ton = Number(w.tonnage) || 0;
    if (age < 0 || !ton) continue;

    if (age < days) {
      total += ton;
      const b = sums[count - 1 - Math.floor(age / step)];
      b.value += ton;
      const type = String(w.type || '').toLowerCase();
      if (type === 'push' || type === 'pull' || type === 'legs') b[type] += ton;
    } else if (age < days * 2) {
      prevTotal += ton;
    }
  }

  /** @type {VolumeBucket[]} */
  const buckets = sums.map((b) => {
    const best = Math.max(b.push, b.pull, b.legs);
    /** @type {VolumeBucket['type']} */
    let type = null;
    if (best > 0) type = b.push === best ? 'push' : b.pull === best ? 'pull' : 'legs';
    return { value: b.value, type };
  });

  return { mode, buckets, total, prevTotal, days };
}

/**
 * Процент к предыдущему равному окну. Прошлое окно пустое → null (пилюлю
 * не показывать: делить не на что, «+100%» было бы враньём).
 * @param {Pick<VolumeTrend,'total'|'prevTotal'>} r
 * @returns {number|null}
 */
export function trendPercent(r) {
  if (!(r.prevTotal > 0)) return null;
  return Math.round(((r.total - r.prevTotal) / r.prevTotal) * 100);
}
