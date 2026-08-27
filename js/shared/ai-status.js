// @ts-check
/**
 * Probe /api/ai-status without treating privacy blocks as server failure.
 *
 * F-13: new installs default to airgap. The service worker then short-circuits
 * /api/* with 503. A raw fetch() looks like the coach is down; the UI logged
 * that to the console and showed "NO KEY". safeFetch throws PrivacyBlockedError
 * before the network, and the SW 503 body carries `code: "airgap"` if a caller
 * still uses fetch().
 */

/**
 * @typedef {'server' | 'airgap' | 'ai-off' | 'offline'} AiStatusSource
 * @typedef {{ gemini: boolean, anthropic: boolean, source: AiStatusSource }} AiStatus
 */

/**
 * Classify a status probe. Pure — unit-tested, no DOM, no fetch.
 *
 * @param {number | null} status
 * @param {object | null} body
 * @param {Error | null} [err]
 * @returns {AiStatus}
 */
export function classifyAiStatus(status, body, err = null) {
  if (err) {
    const code = /** @type {any} */ (err).code;
    if (err.name === 'PrivacyBlockedError' && (code === 'airgap' || code === 'ai-off')) {
      return { gemini: false, anthropic: false, source: code };
    }
    return { gemini: false, anthropic: false, source: 'offline' };
  }
  const payload = body && typeof body === 'object' ? body : {};
  if (status === 503 && /** @type {any} */ (payload).code === 'airgap') {
    return { gemini: false, anthropic: false, source: 'airgap' };
  }
  if (status !== 200) {
    return { gemini: false, anthropic: false, source: 'offline' };
  }
  return {
    gemini: !!(/** @type {any} */ (payload).gemini),
    anthropic: !!(/** @type {any} */ (payload).anthropic),
    source: 'server',
  };
}

/**
 * @param {AiStatus} probed
 * @returns {boolean}
 */
export function hasServerCoach(probed) {
  return probed.source === 'server' && (probed.gemini || probed.anthropic);
}

/**
 * @param {() => Promise<Response>} [fetcher]
 * @returns {Promise<AiStatus>}
 */
export async function probeAiStatus(fetcher) {
  const run =
    fetcher ||
    (async () => {
      const { safeFetch } = await import('../privacy.store.js');
      return safeFetch('/api/ai-status', {}, 'sync');
    });
  try {
    const res = await run();
    const body = await res.json().catch(() => ({}));
    return classifyAiStatus(res.status, body, null);
  } catch (err) {
    return classifyAiStatus(null, null, err instanceof Error ? err : new Error(String(err)));
  }
}
