// @ts-check
/* ════════════════════════════════════════════════════════
   db/nutrition.js — NUTRITION LOGS
   ════════════════════════════════════════════════════════ */

import { S, tx, req2p, req2pSafe, withMeta, _triggerSync } from './core.js';

export const NutritionLogs = {
  save(payload) {
    const entry = withMeta({ payload, timestamp: Date.now() });
    return tx(S.NUTRITION, 'readwrite').then((s) =>
      req2pSafe(s.add(entry), s.transaction).then(() => {
        _triggerSync(S.NUTRITION, entry);
        return entry.id;
      })
    );
  },
  getAll() {
    return tx(S.NUTRITION).then(s => {
      const idx = s.index('timestamp');
      return req2p(idx.getAll()).then(list => list.reverse());
    });
  },
  clear() {
    return tx(S.NUTRITION, 'readwrite').then((s) => req2p(s.clear()));
  }
};
