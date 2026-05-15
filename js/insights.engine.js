// @ts-check
/* ════════════════════════════════════════════════════════
   insights.engine.js — Rule-based offline coach
   ────────────────────────────────────────────────────────
   Deterministic insights computed from local data only.
   Used as fallback when AI Coach is disabled / air-gapped.

   No fetch, no LLM, no external dependencies.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { expectedFromDeadlift, symmetryIndex } from './strength-engine.js';

/**
 * @typedef {{
 *   kind: 'streak'|'recovery'|'imbalance'|'symmetry'|'pr'|'consistency'|'rest',
 *   priority: number,    // 0-100, higher = more important
 *   icon: string,        // svg name
 *   title: string,
 *   body: string,
 *   action?: string,     // optional one-liner suggestion
 * }} Insight
 */

/** @returns {Promise<Insight[]>} */
export async function generateInsights() {
  const [workouts, orms, metrics, settings] = await Promise.all([
    DB.Workouts.getAll().catch(() => []),
    DB.OneRM.getAll().catch(() => []),
    DB.Metrics.getAll().catch(() => []),
    DB.Settings.getAll().catch(() => ({})),
  ]);

  const insights = [];

  /* ── 1. Inactive day group ── */
  const lastByType = { push: 0, pull: 0, legs: 0 };
  workouts.forEach(w => {
    if (lastByType[w.type] === undefined) return;
    if (w.timestamp > lastByType[w.type]) lastByType[w.type] = w.timestamp;
  });
  Object.entries(lastByType).forEach(([type, t]) => {
    if (t === 0) return; // never trained, skip (don't nag novice)
    const days = Math.floor((Date.now() - t) / 86_400_000);
    if (days >= 6) {
      insights.push({
        kind: 'recovery',
        priority: 70 + Math.min(days, 14),
        icon: 'clock',
        title: `${days} days since ${type} day`,
        body: `Your last ${type} session was ${days} days ago. Hitting it 1–2× weekly maintains strength.`,
        action: `Schedule a ${type} session this week.`,
      });
    }
  });

  /* ── 2. Streak status ── */
  const streak = _computeStreak(workouts);
  if (streak >= 3) {
    insights.push({
      kind: 'streak',
      priority: 50,
      icon: 'flame',
      title: `${streak}-day streak`,
      body: 'Consistency is the multiplier. Keep showing up.',
    });
  } else if (streak === 0 && workouts.length > 0) {
    const lastDays = Math.floor((Date.now() - workouts[workouts.length - 1].timestamp) / 86_400_000);
    if (lastDays > 3) {
      insights.push({
        kind: 'consistency',
        priority: 65,
        icon: 'flame',
        title: 'Streak paused',
        body: `${lastDays} days since your last session. A short workout keeps the rhythm alive.`,
      });
    }
  }

  /* ── 3. Bench/Deadlift imbalance via translator ── */
  const bench = _bestOrm(orms, 'bench');
  const dead = _bestOrm(orms, 'dead');
  if (bench && dead) {
    const expected = expectedFromDeadlift({ deadlift: dead });
    if (expected && bench < expected.bench * 0.85) {
      const gap = expected.bench - bench;
      insights.push({
        kind: 'imbalance',
        priority: 60,
        icon: 'balance',
        title: `Bench lagging by ~${gap}kg`,
        body: `Based on your ${dead}kg deadlift, expected bench is ~${expected.bench}kg. Consider adding chest volume.`,
        action: 'Add 1 extra bench/incline set per push session.',
      });
    }
  }

  /* ── 4. Symmetry alert ── */
  const sym = symmetryIndex({
    armL: parseFloat(settings['m-arm-l']),
    armR: parseFloat(settings['m-arm-r']),
    thighL: parseFloat(settings['m-thigh-l']),
    thighR: parseFloat(settings['m-thigh-r']),
  });
  if (sym !== null && sym < 80) {
    insights.push({
      kind: 'symmetry',
      priority: 55,
      icon: 'symmetry',
      title: `Symmetry index ${sym}/100`,
      body: 'L/R measurements differ. Add unilateral work to balance.',
      action: 'Single-arm rows, split squats, lunges.',
    });
  }

  /* ── 5. Recent PRs ── */
  const recentPrs = orms.filter(o => o.timestamp && (Date.now() - o.timestamp) < 14 * 86_400_000);
  if (recentPrs.length > 0) {
    insights.push({
      kind: 'pr',
      priority: 40,
      icon: 'trophy',
      title: `${recentPrs.length} PR${recentPrs.length > 1 ? 's' : ''} in last 2 weeks`,
      body: recentPrs.slice(0, 3).map(p => `${p.id}: ${p.value}kg`).join(' · '),
    });
  }

  /* ── 6. Rest reminder ── */
  if (workouts.length >= 5) {
    const last5 = workouts.slice(-5);
    const span = (last5[last5.length - 1].timestamp - last5[0].timestamp) / 86_400_000;
    if (span < 5) {
      insights.push({
        kind: 'rest',
        priority: 75,
        icon: 'moon',
        title: '5 sessions in <5 days',
        body: 'Recovery is when adaptation happens. Consider a deload day this week.',
      });
    }
  }

  /* ── 7. Body weight trend (if multiple metrics) ── */
  if (metrics.length >= 2) {
    const sorted = [...metrics].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const days = (last.timestamp - first.timestamp) / 86_400_000;
    if (days >= 14) {
      const delta = last.weight - first.weight;
      if (Math.abs(delta) >= 1) {
        insights.push({
          kind: 'recovery',
          priority: 35,
          icon: 'trend',
          title: `Bodyweight ${delta > 0 ? '+' : ''}${delta.toFixed(1)}kg over ${Math.round(days)}d`,
          body: delta > 0
            ? 'Trending up. If goal is hypertrophy, on track. If cutting, review intake.'
            : 'Trending down. If cutting, on track. If bulking, increase calories.',
        });
      }
    }
  }

  // Sort by priority, return top 5
  return insights.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

/* ── Helpers ── */
function _computeStreak(workouts) {
  if (!workouts.length) return 0;
  const dates = new Set(
    workouts.map(w => new Date(w.timestamp).toISOString().slice(0, 10))
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) streak++;
    else if (i > 0) break; // Allow today to be empty
  }
  return streak;
}

function _bestOrm(orms, nameSubstring) {
  const matches = orms.filter(o => o.id.toLowerCase().includes(nameSubstring));
  if (!matches.length) return null;
  return Math.max(...matches.map(o => o.value));
}
