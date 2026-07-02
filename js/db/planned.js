// @ts-check
/* ════════════════════════════════════════════════════════
   db/planned.js — PLANNED WORKOUTS  (AI Generated)
   ════════════════════════════════════════════════════════ */

import { S, tx, req2p, req2pSafe, withMeta, _triggerSync } from './core.js';

export const PlannedWorkouts = {
  save(name, payload) {
    const entry = withMeta({ name, payload, timestamp: Date.now() });
    return tx(S.PLANS, 'readwrite').then((s) =>
      req2pSafe(s.add(entry), s.transaction).then(() => {
        _triggerSync(S.PLANS, entry);
        return entry.id;
      })
    );
  },
  getAll() {
    return tx(S.PLANS).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.reverse());
    });
  },
  clear() {
    return tx(S.PLANS, 'readwrite').then((s) => req2p(s.clear()));
  }
};
