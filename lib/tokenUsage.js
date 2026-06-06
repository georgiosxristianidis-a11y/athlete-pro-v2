'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ════════════════════════════════════════════════════════
   lib/tokenUsage.js — Track Anthropic token consumption
   ════════════════════════════════════════════════════════ */

// In-memory session stats
let _session = { inputTokens: 0, outputTokens: 0, requests: 0 };

/**
 * Record token usage from an Anthropic API response.
 * @param {string} endpoint — e.g. '/api/coach', '/api/generate-plan'
 * @param {Object} usage — { input_tokens: number, output_tokens: number }
 */
export function record(endpoint, usage) {
  if (!usage) return;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;

  _session.inputTokens += input;
  _session.outputTokens += output;
  _session.requests += 1;

  // Log every call
  const total = input + output;
  console.log(
    `[Token] ${endpoint} → in: ${input.toLocaleString()} | out: ${output.toLocaleString()} | total: ${total.toLocaleString()}`
  );

  // Persist per-day total to localStorage-compatible store (for dev)
  _persistDailyUsage(endpoint, input, output);
}

/**
 * Get current session usage summary.
 * @returns {{ inputTokens: number, outputTokens: number, requests: number }}
 */
export function getSessionSummary() {
  return { ..._session };
}

/**
 * Reset session counter.
 */
export function resetSession() {
  _session = { inputTokens: 0, outputTokens: 0, requests: 0 };
}

/**
 * Persist daily usage to a JSON file.
 * @param {string} endpoint
 * @param {number} input
 * @param {number} output
 */
function _persistDailyUsage(endpoint, input, output) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const file = path.join(__dirname, '..', 'token-usage.log');
  const line = `${today} | ${endpoint.padEnd(25)} | in: ${String(input).padStart(6)} | out: ${String(output).padStart(6)} | total: ${String(input + output).padStart(6)}\n`;

  try {
    fs.appendFileSync(file, line);
  } catch (err) {
    console.warn('[tokenUsage] Could not write to token-usage.log:', err.message);
  }
}

/**
 * Get total usage from the log file.
 * @returns {{ totalInput: number, totalOutput: number, totalAll: number }}
 */
export function getLifetimeUsage() {
  const file = path.join(__dirname, '..', 'token-usage.log');
  if (!fs.existsSync(file)) {
    return { totalInput: 0, totalOutput: 0, totalAll: 0 };
  }

  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  let totalInput = 0;
  let totalOutput = 0;

  for (const line of lines) {
    const match = line.match(/in:\s*(\d+)\s*\|\s*out:\s*(\d+)/);
    if (match) {
      totalInput += parseInt(match[1], 10);
      totalOutput += parseInt(match[2], 10);
    }
  }

  return { totalInput, totalOutput, totalAll: totalInput + totalOutput };
}
