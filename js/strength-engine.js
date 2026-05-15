// @ts-check
/* ════════════════════════════════════════════════════════
   strength-engine.js — Pure-math strength comparison engine
   ────────────────────────────────────────────────────────
   No DOM, no fetch, no DB. Pure functions.
     • estimate1RM (Epley)
     • exrxTier (Untrained → Elite, per lift, sex, bodyweight, age)
     • dotsScore (modern Wilks replacement, IPF 2020)
     • mcCullochAge (age-adjusted multiplier)
     • ipfWeightClass + iwfWeightClass
   ════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════
   1RM ESTIMATION (Epley)
   ════════════════════════════════════════════════════════ */
export function estimate1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/* ════════════════════════════════════════════════════════
   ExRx STRENGTH STANDARDS
   ────────────────────────────────────────────────────────
   Source: ExRx.net strength standards (adult, age-corrected).
   Format: per lift, sex, bodyweight bracket → 5 tier thresholds (kg, 1RM).
   Tiers: [Untrained, Novice, Intermediate, Advanced, Elite]
   We interpolate between bodyweight brackets.
   ════════════════════════════════════════════════════════ */

const EXRX = {
  m: {
    bench: {
      // bw_kg: [unt, nov, int, adv, elite]
      52:  [ 35,  45,  60,  85, 110],
      56:  [ 40,  50,  70,  95, 125],
      60:  [ 45,  60,  80, 110, 140],
      67:  [ 55,  70,  95, 125, 160],
      75:  [ 60,  80, 105, 140, 180],
      82:  [ 65,  90, 115, 155, 195],
      90:  [ 70,  95, 125, 165, 210],
      100: [ 75, 105, 135, 175, 220],
      110: [ 80, 110, 140, 180, 230],
      125: [ 85, 115, 145, 190, 240],
      145: [ 90, 120, 150, 195, 250],
    },
    squat: {
      52:  [ 40,  60,  85, 120, 160],
      56:  [ 50,  70, 100, 140, 180],
      60:  [ 60,  85, 115, 155, 200],
      67:  [ 70, 100, 135, 180, 230],
      75:  [ 80, 115, 155, 205, 260],
      82:  [ 90, 125, 170, 220, 280],
      90:  [100, 140, 185, 235, 295],
      100: [110, 150, 195, 245, 310],
      110: [115, 155, 205, 255, 320],
      125: [120, 160, 210, 260, 330],
      145: [125, 165, 215, 265, 335],
    },
    deadlift: {
      52:  [ 50,  75, 105, 140, 180],
      56:  [ 60,  90, 125, 165, 210],
      60:  [ 75, 105, 145, 185, 235],
      67:  [ 90, 125, 170, 215, 265],
      75:  [100, 140, 190, 240, 295],
      82:  [115, 155, 205, 260, 320],
      90:  [125, 170, 220, 275, 340],
      100: [135, 180, 230, 285, 350],
      110: [140, 185, 240, 295, 360],
      125: [145, 190, 245, 300, 370],
      145: [150, 195, 250, 305, 380],
    },
    ohp: {
      52:  [ 22,  30,  42,  60,  78],
      56:  [ 25,  35,  48,  68,  88],
      60:  [ 28,  40,  55,  76,  98],
      67:  [ 33,  46,  62,  85, 110],
      75:  [ 38,  52,  70,  95, 122],
      82:  [ 42,  57,  77, 105, 132],
      90:  [ 46,  62,  83, 112, 142],
      100: [ 50,  67,  88, 118, 150],
      110: [ 53,  70,  92, 122, 155],
      125: [ 56,  74,  96, 126, 160],
      145: [ 58,  76,  99, 130, 165],
    },
  },
  f: {
    bench: {
      44: [ 18, 25, 35, 50, 65],
      48: [ 22, 28, 40, 55, 70],
      52: [ 25, 32, 45, 60, 78],
      57: [ 28, 36, 50, 68, 88],
      63: [ 32, 42, 56, 75, 95],
      72: [ 36, 47, 62, 82, 105],
      84: [ 40, 52, 68, 90, 115],
      100:[ 44, 56, 73, 96, 122],
      120:[ 47, 60, 78, 100, 130],
    },
    squat: {
      44: [ 22, 35, 50, 70,  95],
      48: [ 28, 42, 60, 82, 110],
      52: [ 33, 50, 70, 95, 125],
      57: [ 38, 58, 80, 108, 140],
      63: [ 45, 66, 90, 120, 155],
      72: [ 52, 75, 100, 132, 170],
      84: [ 58, 82, 110, 145, 185],
      100:[ 64, 88, 118, 155, 198],
      120:[ 68, 92, 124, 162, 210],
    },
    deadlift: {
      44: [ 28, 45, 65, 90, 120],
      48: [ 35, 55, 78, 105, 138],
      52: [ 42, 65, 90, 120, 155],
      57: [ 48, 75, 102, 135, 172],
      63: [ 55, 85, 115, 150, 190],
      72: [ 62, 95, 128, 165, 208],
      84: [ 70, 105, 140, 180, 225],
      100:[ 76, 112, 150, 190, 240],
      120:[ 80, 118, 158, 200, 252],
    },
    ohp: {
      44: [ 12, 17, 24, 33, 44],
      48: [ 14, 20, 27, 37, 50],
      52: [ 16, 22, 30, 42, 55],
      57: [ 18, 25, 34, 47, 62],
      63: [ 21, 28, 38, 52, 68],
      72: [ 24, 32, 43, 58, 75],
      84: [ 27, 36, 48, 64, 82],
      100:[ 30, 40, 53, 70, 90],
      120:[ 32, 42, 56, 73, 95],
    },
  },
};

const TIER_NAMES = ['untrained', 'novice', 'intermediate', 'advanced', 'elite'];

/**
 * Resolve ExRx tier and percentile for a 1RM lift.
 * @param {{ lift: 'bench'|'squat'|'deadlift'|'ohp', sex: 'm'|'f', bodyweight: number, oneRM: number, age?: number }} args
 * @returns {{ tier: string, tierIndex: number, percentile: number, thresholds: number[] } | null}
 */
export function exrxTier({ lift, sex, bodyweight, oneRM, age }) {
  const table = EXRX[sex]?.[lift];
  if (!table || !bodyweight || !oneRM) return null;

  // Interpolate thresholds for given bodyweight
  const brackets = Object.keys(table).map(Number).sort((a, b) => a - b);
  let lo = brackets[0], hi = brackets[brackets.length - 1];
  for (let i = 0; i < brackets.length - 1; i++) {
    if (bodyweight >= brackets[i] && bodyweight <= brackets[i + 1]) {
      lo = brackets[i]; hi = brackets[i + 1]; break;
    }
  }
  if (bodyweight < brackets[0]) { lo = hi = brackets[0]; }
  if (bodyweight > brackets[brackets.length - 1]) { lo = hi = brackets[brackets.length - 1]; }
  const t = lo === hi ? 0 : (bodyweight - lo) / (hi - lo);
  const thresholds = table[lo].map((v, i) => v + (table[hi][i] - v) * t);

  // Apply age correction (McCulloch) — gives the effective 1RM in "prime years"
  const ageCoef = mcCullochAge(age || 30);
  const effective1RM = oneRM * ageCoef;

  // Find tier
  let tierIndex = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (effective1RM >= thresholds[i]) tierIndex = i;
  }

  // Percentile estimate — assume tier centers map to 5/25/50/75/95.
  const tierCenters = [5, 25, 50, 75, 95];
  let percentile;
  if (effective1RM <= thresholds[0]) {
    percentile = (effective1RM / thresholds[0]) * tierCenters[0];
  } else if (effective1RM >= thresholds[4]) {
    percentile = Math.min(99, tierCenters[4] + ((effective1RM - thresholds[4]) / thresholds[4]) * 4);
  } else {
    for (let i = 0; i < 4; i++) {
      if (effective1RM >= thresholds[i] && effective1RM <= thresholds[i + 1]) {
        const frac = (effective1RM - thresholds[i]) / (thresholds[i + 1] - thresholds[i]);
        percentile = tierCenters[i] + frac * (tierCenters[i + 1] - tierCenters[i]);
        break;
      }
    }
  }

  return {
    tier: TIER_NAMES[tierIndex],
    tierIndex,
    percentile: Math.round(Math.max(0, Math.min(99, percentile))),
    thresholds,
  };
}

/* ════════════════════════════════════════════════════════
   DOTS SCORE (IPF 2020 — modern Wilks)
   ────────────────────────────────────────────────────────
   DOTS = total_kg × 500 / (a + b·bw + c·bw² + d·bw³ + e·bw⁴)
   ════════════════════════════════════════════════════════ */

const DOTS = {
  m: { a: -307.75076, b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093 },
  f: { a: -57.96288,  b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706 },
};

/**
 * @param {{ total: number, bodyweight: number, sex: 'm'|'f' }} args
 *  total = sum of best squat + bench + deadlift (1RM)
 */
export function dotsScore({ total, bodyweight, sex }) {
  if (!total || !bodyweight) return 0;
  const c = DOTS[sex] || DOTS.m;
  const bw = Math.max(40, Math.min(bodyweight, sex === 'm' ? 200 : 150));
  const denom = c.a + c.b * bw + c.c * bw ** 2 + c.d * bw ** 3 + c.e * bw ** 4;
  return Math.round((total * 500) / denom);
}

/* ════════════════════════════════════════════════════════
   McCULLOCH AGE COEFFICIENT
   ────────────────────────────────────────────────────────
   Multiplier on lift to "normalize" to age-30 prime.
   Approximation: 1.0 from 24-40, then gradual decline.
   ════════════════════════════════════════════════════════ */

export function mcCullochAge(age) {
  if (!age || age < 14) return 1.0;
  if (age >= 14 && age <= 23) {
    // Younger lifters: small bonus to credit late-teens/early-20s strength curve
    const table = { 14: 1.23, 15: 1.18, 16: 1.13, 17: 1.10, 18: 1.07, 19: 1.04, 20: 1.03, 21: 1.02, 22: 1.01, 23: 1.005 };
    return table[Math.floor(age)] || 1.0;
  }
  if (age >= 24 && age <= 40) return 1.0;
  if (age <= 80) {
    // Linear-ish decline ~1.5%/year past 40
    const yearsPast = age - 40;
    return 1.0 + yearsPast * 0.015;
  }
  return 1.6;
}

/* ════════════════════════════════════════════════════════
   IPF / IWF WEIGHT CLASSES
   ════════════════════════════════════════════════════════ */

const IPF_M = [53, 59, 66, 74, 83, 93, 105, 120, Infinity];
const IPF_F = [43, 47, 52, 57, 63, 72, 84, Infinity];
const IWF_M = [55, 61, 67, 73, 81, 89, 96, 102, 109, Infinity];
const IWF_F = [45, 49, 55, 59, 64, 71, 76, 81, 87, Infinity];

function _classFromTable(bw, table) {
  for (const c of table) if (bw <= c) return c;
  return Infinity;
}

export function ipfWeightClass(bodyweight, sex) {
  const table = sex === 'f' ? IPF_F : IPF_M;
  const c = _classFromTable(bodyweight, table);
  return c === Infinity ? `${table[table.length - 2]}+` : `${c}`;
}

export function iwfWeightClass(bodyweight, sex) {
  const table = sex === 'f' ? IWF_F : IWF_M;
  const c = _classFromTable(bodyweight, table);
  return c === Infinity ? `${table[table.length - 2]}+` : `${c}`;
}

/* ════════════════════════════════════════════════════════
   STRENGTH TRANSLATOR — DL ↔ Bench expected ratio
   ────────────────────────────────────────────────────────
   Heuristic: Bench ≈ 0.55 × Deadlift for trained lifters.
   Used to flag imbalance.
   ════════════════════════════════════════════════════════ */

const RATIOS = {
  // expected ratios relative to deadlift (for trained, sex-neutral approximation)
  bench: 0.55,
  squat: 0.85,
  ohp: 0.35,
};

/** @param {{ deadlift: number }} args */
export function expectedFromDeadlift({ deadlift }) {
  if (!deadlift) return null;
  return {
    bench: Math.round(deadlift * RATIOS.bench),
    squat: Math.round(deadlift * RATIOS.squat),
    ohp: Math.round(deadlift * RATIOS.ohp),
  };
}

/* ════════════════════════════════════════════════════════
   SYMMETRY INDEX — from L vs R measurements
   ────────────────────────────────────────────────────────
   Returns 0–100 where 100 = perfectly symmetric.
   ════════════════════════════════════════════════════════ */

/** @param {{ armL?: number, armR?: number, thighL?: number, thighR?: number }} m */
export function symmetryIndex(m) {
  const pairs = [];
  if (m.armL && m.armR)   pairs.push([m.armL, m.armR]);
  if (m.thighL && m.thighR) pairs.push([m.thighL, m.thighR]);
  if (!pairs.length) return null;
  const diffs = pairs.map(([l, r]) => Math.abs(l - r) / Math.max(l, r));
  const maxDiff = Math.max(...diffs);
  return Math.round(Math.max(0, 1 - maxDiff * 5) * 100); // 20% diff → 0%
}
