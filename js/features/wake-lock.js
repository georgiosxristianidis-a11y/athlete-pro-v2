// @ts-check
/* ════════════════════════════════════════════════════════
   wake-lock.js — Screen Wake Lock API management
   Prevents screen timeout during active workouts.
   ════════════════════════════════════════════════════════ */

let _wakeLock = null;

/**
 * Acquire a screen wake lock.
 * @returns {Promise<boolean>} — true if acquired
 */
export async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    console.log('[WakeLock] Acquired');
    
    _wakeLock.addEventListener('release', () => {
      console.log('[WakeLock] Released');
    });
    return true;
  } catch (err) {
    // Silently ignore failures (e.g. NotAllowedError)
    console.warn('[WakeLock] Failed to acquire:', err.message);
    return false;
  }
}

/**
 * Release the active screen wake lock.
 */
export async function releaseWakeLock() {
  if (!_wakeLock) return;
  try {
    await _wakeLock.release();
    _wakeLock = null;
  } catch (err) {
    console.warn('[WakeLock] Failed to release:', err.message);
  }
}

/**
 * Check if a wake lock is active.
 * @returns {boolean}
 */
export function isWakeLockActive() {
  return _wakeLock !== null && !_wakeLock.released;
}
