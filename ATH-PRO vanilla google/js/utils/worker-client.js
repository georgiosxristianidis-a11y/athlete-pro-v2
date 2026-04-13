// @ts-check
/* ════════════════════════════════════════════════════════
   worker-client.js — Athlete Pro
   Promise wrapper for Web Workers
   ════════════════════════════════════════════════════════ */

const worker = new Worker('/js/workers/math.worker.js');
let messageId = 0;
const callbacks = {};

worker.onmessage = (e) => {
  const { id, result } = e.data;
  if (callbacks[id]) {
    callbacks[id](result);
    delete callbacks[id];
  }
};

export const MathWorker = {
  calc1RM(weight, reps) {
    return new Promise((resolve) => {
      const id = ++messageId;
      callbacks[id] = resolve;
      worker.postMessage({ type: 'CALC_1RM', payload: { weight, reps }, id });
    });
  },
  
  calcTonnage(sets) {
    return new Promise((resolve) => {
      const id = ++messageId;
      callbacks[id] = resolve;
      worker.postMessage({ type: 'CALC_TONNAGE', payload: { sets }, id });
    });
  }
};
