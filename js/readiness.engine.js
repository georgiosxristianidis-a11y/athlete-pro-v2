/**
 * readiness.engine.js
 * 
 * Deterministic math for athlete readiness.
 * Replaces LLM-hallucinated numbers with strict, data-driven facts.
 */

import { DB } from './db.js';

/**
 * Calculates ACWR (Acute:Chronic Workload Ratio) and CNS Readiness.
 * 
 * @returns {Promise<{ acwr: number, cns: number, recovery: number, acuteVolume: number, chronicWeeklyVolume: number }>}
 */
export async function calculateReadiness() {
  const history = await DB.Workouts.getAll();
  const sorted = history.sort((a,b) => new Date(b.date) - new Date(a.date));
  
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  let acuteVolume = 0;
  let chronicVolume = 0;
  
  // CNS Base is 100%. Dropped by heavy RPE and consecutive days.
  let cnsScore = 100;
  
  for (const w of sorted) {
    const wDate = new Date(w.date);
    const diffDays = Math.floor((now - wDate) / DAY_MS);
    
    if (diffDays > 28) continue;
    
    let wVolume = 0;
    let highRpeSets = 0;
    
    if (w.exercises) {
      for (const ex of w.exercises) {
        if (!ex.sets) continue;
        for (const set of ex.sets) {
           wVolume += (set.reps || 0) * (set.weight || 0);
           // Sets with RPE 9+ heavily tax the CNS
           if (set.rpe >= 9 || set.isFailure) highRpeSets++;
        }
      }
    }
    
    if (diffDays <= 7) {
      acuteVolume += wVolume;
      // CNS penalty for recent hard workouts (last 7 days).
      // A set to failure usually drops CNS by ~1.5% for 72h.
      if (diffDays <= 3) {
        cnsScore -= (highRpeSets * 2);
      }
    }
    
    chronicVolume += wVolume;
  }
  
  // Chronic weekly is average of last 4 weeks
  const chronicWeeklyVolume = chronicVolume / 4;
  
  // ACWR = Acute / Chronic. Ideal is 0.8 to 1.3
  let acwr = chronicWeeklyVolume > 0 ? (acuteVolume / chronicWeeklyVolume) : 1.0;
  
  // Calculate consecutive days penalty
  let consecutiveDays = 0;
  for(let i=0; i<5; i++) {
    const hasWorkout = sorted.some(w => {
      const d = Math.floor((now - new Date(w.date)) / DAY_MS);
      return d === i;
    });
    if (hasWorkout) consecutiveDays++;
    else break;
  }
  
  // Severe penalty for no rest days
  if (consecutiveDays >= 3) {
    cnsScore -= (consecutiveDays * 5);
  } else if (consecutiveDays === 0 && sorted.length > 0) {
    // Bonus for resting today
    cnsScore += 10;
  }

  // Final bounds
  cnsScore = Math.max(0, Math.min(100, Math.round(cnsScore)));
  acwr = Number(acwr.toFixed(2));
  
  // Recovery is an inverse of fatigue mapping to 0-100
  // If ACWR is in sweet spot (0.8-1.3), recovery is good.
  let recovery = 100;
  if (acwr > 1.5) recovery -= 30;
  else if (acwr > 1.3) recovery -= 15;
  else if (acwr < 0.6) recovery -= 10; // Under-training detraining effect
  
  recovery = Math.min(recovery, cnsScore); // Recovery cannot be higher than CNS

  return {
    acwr,
    cns: cnsScore,
    recovery,
    acuteVolume,
    chronicWeeklyVolume
  };
}
