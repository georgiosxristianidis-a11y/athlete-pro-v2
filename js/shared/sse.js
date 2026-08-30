// @ts-check
/**
 * Carry-buffer SSE reader for coach streams.
 *
 * A TCP chunk may split mid-line. Splitting each chunk on `\n` and JSON.parse
 * on the fragments drops tokens with no error — dashboard coach already
 * buffers; P.A.N.D.A. Core did not.
 */

/**
 * @param {string} buffer leftover from the previous chunk (no trailing newline)
 * @param {string} chunk  newly decoded text
 * @returns {{ buffer: string, lines: string[] }}
 */
export function appendSseChunk(buffer, chunk) {
  const mixed = buffer + chunk;
  const lines = mixed.split('\n');
  const rest = lines.pop() ?? '';
  return { buffer: rest, lines };
}

/**
 * @param {string} line
 * @returns {{ done?: true, error?: string, requestId?: string, text?: string } | null}
 */
export function parseSseDataLine(line) {
  if (!line.startsWith('data: ')) return null;
  const raw = line.slice(6).trim();
  if (raw === '[DONE]') return { done: true };
  try {
    const payload = /** @type {Record<string, unknown>} */ (JSON.parse(raw));
    if (!payload || typeof payload !== 'object') return null;
    if (payload.error) {
      return {
        error: String(payload.error),
        requestId: payload.requestId != null ? String(payload.requestId) : undefined,
      };
    }
    if (typeof payload.text === 'string' && payload.text) {
      return { text: payload.text };
    }
    return null;
  } catch {
    return null;
  }
}
