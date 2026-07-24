/* ════════════════════════════════════════════════════════
   sw-update.js — nuclear escape hatch for a stuck Service Worker
   Used by app.js (loop-guard / toast escalation) and profile.js
   (5-tap on version stamp). Unregisters every SW and clears the
   Cache Storage so the next load fetches everything fresh and
   installs a clean SW. Never touches IndexedDB — workouts survive.
════════════════════════════════════════════════════════ */

export async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* best-effort — reload anyway */ }
  finally {
    window.location.reload();
  }
}
