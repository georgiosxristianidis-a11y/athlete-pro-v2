// @ts-check
/* ════════════════════════════════════════════════════════
   body-stats.core.js — BODY METRICS, pure logic (card BS-1)

   The measurement screen has three jobs the DOM layer cannot answer on its
   own: which of the thirteen raw fields are worth a bento cell, whether a
   change since the last entry is progress or a warning, and what the trend
   line looks like. All three live here so `test/body-stats.test.js` can hold
   them without a DOM.

   No imports on purpose — this module must stay runnable in plain node.
   ════════════════════════════════════════════════════════ */

/**
 * Every field the user can type in. `group` drives colour by the PPL law
 * (push=green, pull=cyan, legs=purple); `core` means body composition and
 * stays neutral — decoration is not a reason to spend a semantic colour.
 * @typedef {{ id: string, label: string, ru: string, unit: string,
 *             group: 'push'|'pull'|'legs'|'core', computed?: boolean }} BsField
 */

/** @type {BsField[]} */
export const BS_FIELDS = [
  { id: 'weight',    label: 'Weight',      ru: 'Вес',            unit: 'kg', group: 'core' },
  { id: 'body_fat',  label: 'Body Fat',    ru: 'Жир',            unit: '%',  group: 'core', computed: true },
  { id: 'chest',     label: 'Chest',       ru: 'Грудь',          unit: 'cm', group: 'push' },
  { id: 'shoulders', label: 'Shoulders',   ru: 'Плечи',          unit: 'cm', group: 'push' },
  { id: 'waist',     label: 'Waist',       ru: 'Талия',          unit: 'cm', group: 'core' },
  { id: 'hips',      label: 'Hips',        ru: 'Бёдра',          unit: 'cm', group: 'legs' },
  { id: 'neck',      label: 'Neck',        ru: 'Шея',            unit: 'cm', group: 'core' },
  { id: 'arm_l',     label: 'Left Arm',    ru: 'Рука (лев.)',    unit: 'cm', group: 'pull' },
  { id: 'arm_r',     label: 'Right Arm',   ru: 'Рука (прав.)',   unit: 'cm', group: 'pull' },
  { id: 'thigh_l',   label: 'Left Thigh',  ru: 'Бедро (лев.)',   unit: 'cm', group: 'legs' },
  { id: 'thigh_r',   label: 'Right Thigh', ru: 'Бедро (прав.)',  unit: 'cm', group: 'legs' },
  { id: 'calf_l',    label: 'Left Calf',   ru: 'Голень (лев.)',  unit: 'cm', group: 'legs' },
  { id: 'calf_r',    label: 'Right Calf',  ru: 'Голень (прав.)', unit: 'cm', group: 'legs' },
];

/** Fields the user actually types — body fat is derived, never entered. */
export const BS_INPUT_FIELDS = BS_FIELDS.filter((f) => !f.computed);

/**
 * Form sections. Thirteen inputs in one flat list read as a wall; grouped by
 * body region they read as a checklist you tick top to bottom.
 * @type {{ id: string, label: string, ru: string, fields: string[] }[]}
 */
export const BS_FORM_SECTIONS = [
  { id: 'comp',  label: 'Composition', ru: 'Композиция', fields: ['weight', 'waist', 'neck', 'hips'] },
  { id: 'upper', label: 'Upper Body',  ru: 'Верх',       fields: ['chest', 'shoulders', 'arm_l', 'arm_r'] },
  { id: 'lower', label: 'Lower Body',  ru: 'Низ',        fields: ['thigh_l', 'thigh_r', 'calf_l', 'calf_r'] },
];

/**
 * Bento cells. Six, not thirteen: left/right pairs collapse into one averaged
 * cell (the raw sides stay in the form and the history), and the structural
 * fields that only feed the body-fat formula do not earn a tile.
 *
 * `trend` says what a rise means — 'up' good for muscle, 'down' good for waist
 * and fat, 'neutral' for weight, where neither direction is progress on its own.
 *
 * @typedef {{ id: string, label: string, ru: string, unit: string,
 *             source: string[], trend: 'up'|'down'|'neutral', color: string }} BsCell
 * @type {BsCell[]}
 */
export const BS_BENTO = [
  { id: 'weight',   label: 'Weight',   ru: 'Вес',    unit: 'kg', source: ['weight'],            trend: 'neutral', color: 'var(--c-text-1)' },
  { id: 'body_fat', label: 'Body Fat', ru: 'Жир',    unit: '%',  source: ['body_fat'],          trend: 'down',    color: 'var(--c-text-1)' },
  { id: 'chest',    label: 'Chest',    ru: 'Грудь',  unit: 'cm', source: ['chest'],             trend: 'up',      color: 'var(--c-push)' },
  { id: 'waist',    label: 'Waist',    ru: 'Талия',  unit: 'cm', source: ['waist'],             trend: 'down',    color: 'var(--c-text-1)' },
  { id: 'arms',     label: 'Arms',     ru: 'Руки',   unit: 'cm', source: ['arm_l', 'arm_r'],    trend: 'up',      color: 'var(--c-pull)' },
  { id: 'thighs',   label: 'Thighs',   ru: 'Бёдра',  unit: 'cm', source: ['thigh_l', 'thigh_r'], trend: 'up',     color: 'var(--c-legs)' },
];

/** Which input field a bento tap should focus. */
export const cellFocusField = (cellId) => {
  const cell = BS_BENTO.find((c) => c.id === cellId);
  if (!cell) return null;
  const first = cell.source.find((s) => s !== 'body_fat');
  return first || 'waist'; // body fat is derived from waist/neck — send them there
};

/* ── Body fat (U.S. Navy) ───────────────────────────────────────────────── */

/**
 * Onboarding (F-7) writes `profile.sex`. Body-stats used to read only the
 * legacy key `sex` (default `'m'`), so a woman who chose Female in setup
 * still got the male Navy formula. Prefer the namespaced key; fall back to
 * the legacy mirror that Athlete Room already writes.
 * @param {unknown} profileSex  DB.Settings `profile.sex`
 * @param {unknown} legacySex   DB.Settings `sex`
 * @returns {'m'|'f'}
 */
export function resolveSex(profileSex, legacySex) {
  return (profileSex || legacySex) === 'f' ? 'f' : 'm';
}

/**
 * @param {{ sex: string, heightCm: number|null|undefined, waistCm: number|null|undefined,
 *           neckCm: number|null|undefined, hipCm?: number|null }} p
 * @returns {number|null} percent, one decimal, or null when the inputs cannot answer
 */
export function bodyFatNavy({ sex, heightCm, waistCm, neckCm, hipCm }) {
  if (!heightCm || !waistCm || !neckCm) return null;
  if (sex === 'f' && !hipCm) return null;
  const W = waistCm, N = neckCm, H = hipCm || 0, HT = heightCm;
  const bf = sex === 'f'
    ? 495 / (1.29579 - 0.35004 * Math.log10(W + H - N) + 0.221 * Math.log10(HT)) - 450
    : 495 / (1.0324 - 0.19077 * Math.log10(W - N) + 0.15456 * Math.log10(HT)) - 450;
  return !isFinite(bf) || bf < 1 || bf > 80 ? null : Math.round(bf * 10) / 10;
}

/**
 * @param {number} bf
 * @param {string} sex
 * @returns {{ label: string, ru: string, color: string }}
 */
export function bodyFatCategory(bf, sex) {
  const ranges = sex === 'f'
    ? [[13, 'Essential', 'Минимум', 'var(--c-blue)'], [20, 'Athletic', 'Атлет', 'var(--c-accent)'], [24, 'Fitness', 'Форма', 'var(--c-accent)'], [31, 'Average', 'Средне', 'var(--c-amber)'], [100, 'High', 'Высокий', 'var(--c-red)']]
    : [[6, 'Essential', 'Минимум', 'var(--c-blue)'], [13, 'Athletic', 'Атлет', 'var(--c-accent)'], [17, 'Fitness', 'Форма', 'var(--c-accent)'], [25, 'Average', 'Средне', 'var(--c-amber)'], [100, 'High', 'Высокий', 'var(--c-red)']];
  for (const [max, label, ru, color] of ranges) {
    if (bf < Number(max)) return { label: String(label), ru: String(ru), color: String(color) };
  }
  return { label: '—', ru: '—', color: 'var(--c-text-3)' };
}

/* ── Entries ────────────────────────────────────────────────────────────── */

/** Newest first. Callers pass whatever localStorage held; do not trust its order. */
export const sortEntries = (entries) =>
  [...(entries || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

/**
 * Fill in `body_fat` for every entry that has the inputs for it. Without this
 * the fat tile could show a number but never a trend — the value is derived,
 * so nothing about it exists in storage.
 * @param {any[]} entries
 * @param {{ sex: string, heightCm: number|null|undefined }} ctx
 */
export function enrichEntries(entries, { sex, heightCm }) {
  return sortEntries(entries).map((e) => {
    const bf = bodyFatNavy({ sex, heightCm, waistCm: e.waist, neckCm: e.neck, hipCm: e.hips });
    return bf == null ? { ...e } : { ...e, body_fat: bf };
  });
}

/**
 * Value of a bento cell for one entry — the average of the sides that are
 * present, so a half-filled entry still reads instead of showing nothing.
 * @param {any} entry
 * @param {BsCell} cell
 * @returns {number|null}
 */
export function cellValue(entry, cell) {
  if (!entry) return null;
  const vals = cell.source
    .map((id) => Number(entry[id]))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round(avg * 10) / 10;
}

/**
 * Chronological (oldest → newest) values for a cell, at most `limit` points.
 * @param {any[]} enriched newest-first entries from {@link enrichEntries}
 * @param {BsCell} cell
 * @param {number} [limit]
 * @returns {{ date: string, v: number }[]}
 */
export function cellSeries(enriched, cell, limit = 8) {
  const points = [];
  for (const e of enriched) {
    const v = cellValue(e, cell);
    if (v != null) points.push({ date: e.date, v });
    if (points.length >= limit) break;
  }
  return points.reverse();
}

/**
 * Change against the previous entry that carried this metric — not against the
 * previous entry outright, which would report "no change" whenever the user
 * skipped a field.
 * @param {any[]} enriched newest-first
 * @param {BsCell} cell
 * @returns {{ diff: number, tone: 'good'|'warn'|'flat', since: string }|null}
 */
export function cellDelta(enriched, cell) {
  const points = cellSeries(enriched, cell, 2);
  if (points.length < 2) return null;
  const prev = points[0], curr = points[1];
  const diff = Math.round((curr.v - prev.v) * 10) / 10;
  return { diff, tone: toneFor(cell.trend, diff), since: prev.date };
}

/**
 * Most recent known value of every field, not just those of the newest entry.
 * The form is prefilled from this: measurements a user takes rarely (hips,
 * calves) would otherwise come up empty every time and have to be retyped.
 * @param {any[]} entries
 * @returns {Record<string, number>}
 */
export function latestValues(entries) {
  const out = /** @type {Record<string, number>} */ ({});
  for (const e of sortEntries(entries)) {
    for (const f of BS_FIELDS) {
      if (out[f.id] != null) continue;
      const v = Number(e[f.id]);
      if (Number.isFinite(v) && v > 0) out[f.id] = v;
    }
  }
  return out;
}

/**
 * What a rise means for a single raw field — the same question {@link BS_BENTO}
 * answers for tiles, needed again for the per-row deltas in the history.
 * @param {string} fieldId
 * @returns {'up'|'down'|'neutral'}
 */
export function fieldTrend(fieldId) {
  if (fieldId === 'waist' || fieldId === 'body_fat') return 'down';
  const f = BS_FIELDS.find((x) => x.id === fieldId);
  if (!f || f.group === 'core') return 'neutral';
  return 'up';
}

/**
 * Change of one raw field at history position `index`, against the next older
 * entry that carried it.
 * @param {any[]} enriched newest-first
 * @param {string} fieldId
 * @param {number} index
 * @returns {{ diff: number, tone: 'good'|'warn'|'flat' }|null}
 */
export function fieldDeltaAt(enriched, fieldId, index) {
  const curr = Number(enriched[index]?.[fieldId]);
  if (!Number.isFinite(curr)) return null;
  for (let i = index + 1; i < enriched.length; i++) {
    const prev = Number(enriched[i][fieldId]);
    if (Number.isFinite(prev) && prev > 0) {
      const diff = Math.round((curr - prev) * 10) / 10;
      return { diff, tone: toneFor(fieldTrend(fieldId), diff) };
    }
  }
  return null;
}

/**
 * @param {'up'|'down'|'neutral'} trend
 * @param {number} diff
 * @returns {'good'|'warn'|'flat'}
 */
export function toneFor(trend, diff) {
  if (diff === 0 || trend === 'neutral') return 'flat';
  return (trend === 'up') === (diff > 0) ? 'good' : 'warn';
}

/**
 * Polyline points for a sparkline, normalised into a w×h box with `pad` of
 * headroom so the extremes are not clipped by the stroke width.
 * @param {number[]} values oldest → newest
 * @param {number} w
 * @param {number} h
 * @param {number} [pad]
 * @returns {string} "" when there is nothing to draw
 */
export function sparkPoints(values, w, h, pad = 3) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const stepX = w / (values.length - 1);
  const usable = h - pad * 2;
  return values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(pad + usable - ((v - min) / span) * usable).toFixed(1)}`)
    .join(' ');
}

/** 72.0 → "72", 72.45 → "72.5" — trailing zeros are noise on a tile. */
export const fmtNum = (v) =>
  v == null || !Number.isFinite(Number(v)) ? '--' : String(Math.round(Number(v) * 10) / 10);

/** Signed change for a delta pill: "+1.5", "−0.4", "0". Unicode minus, not a hyphen. */
export const fmtDelta = (diff) =>
  diff === 0 ? '0' : (diff > 0 ? '+' : '−') + fmtNum(Math.abs(diff));
