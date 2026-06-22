// @ts-check
import { isRu } from '../locale.store.js';

/**
 * format.js — the single layer for number / unit / date display (task 2-3).
 * One definition each, so the app stops disagreeing with itself (e.g. 488 vs
 * 6.9k). Aggregation lives in db.js (startOfWeek/Month); this is presentation.
 */

/** Compact training volume in kg: 1500 → '1.5k', 488 → '488'. */
export function fmtVol(kg) {
  const n = Number(kg) || 0;
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString();
}

/** Weight value (no unit): whole numbers bare, else one decimal. 60 → '60', 62.5 → '62.5'. */
export function fmtWeight(kg) {
  const n = Number(kg) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Session length from milliseconds: '30s', '45m', '1h 05m'. */
export function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/**
 * Localized short date for display, e.g. 'Mon, Jun 16'.
 * Accepts a Date, epoch-ms, or ISO string; returns '—' for invalid input.
 * @param {Date|number|string} input
 * @param {Intl.DateTimeFormatOptions} [opts]
 */
export function fmtDate(input, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(isRu() ? 'ru' : 'en', opts);
}

/** Generic number formatter (avoids inline toFixed issues). */
export function fmtNum(n, precision = 1) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(precision);
}
