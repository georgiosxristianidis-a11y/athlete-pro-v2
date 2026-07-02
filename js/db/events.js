// @ts-check
/* ════════════════════════════════════════════════════════
   db/events.js — EVENTS  (audit log — append only)
   ════════════════════════════════════════════════════════ */

import { S, newId, tx, req2p, req2pSafe, getAll } from './core.js';

export const Events = {
  log(type, payload = {}) {
    // EVENTS is no longer autoIncrement — assign an explicit UUID id. Local-only
    // audit log, so no CRDT meta / sync needed.
    return tx(S.EVENTS, 'readwrite').then((s) =>
      req2pSafe(s.add({ id: newId(), type, payload, timestamp: Date.now() }), s.transaction)
    );
  },

  getAll() {
    return getAll(S.EVENTS).then((list) => list.sort((a, b) => b.timestamp - a.timestamp));
  },

  clear() {
    return tx(S.EVENTS, 'readwrite').then((s) => req2p(s.clear()));
  },
};
