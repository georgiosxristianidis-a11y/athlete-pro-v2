// @ts-check
/* ════════════════════════════════════════════════════════
   math.worker.js — Athlete Pro
   Background thread for heavy calculations
   ════════════════════════════════════════════════════════ */

self.addEventListener('message', (e) => {
  const { type, payload, id } = e.data;

  if (type === 'CALC_1RM') {
    const { weight, reps } = payload;
    // Epley Formula
    const oneRM = reps === 1 ? weight : weight * (1 + reps / 30);
    self.postMessage({ id, result: Math.round(oneRM) });
  }

  if (type === 'CALC_TONNAGE') {
    const { sets } = payload;
    let tonnage = 0;
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].done) {
        tonnage += sets[i].weight * sets[i].reps;
      }
    }
    self.postMessage({ id, result: tonnage });
  }
});
