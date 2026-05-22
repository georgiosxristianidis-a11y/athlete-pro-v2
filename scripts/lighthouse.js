#!/usr/bin/env node
'use strict';
/**
 * scripts/lighthouse.js — local Lighthouse CI runner
 *
 * Usage: node scripts/lighthouse.js
 *   or:  npm run lhci
 *
 * What it does:
 *   1. Starts Express server on port 3333 (avoids conflict with dev port 3000).
 *   2. Runs `npx lighthouse` against it (uses globally-cached version).
 *   3. Checks score thresholds; prints PASS / FAIL per category.
 *   4. Saves JSON report to test-results/lighthouse.json.
 *   5. Exits 0 on pass, 1 on any threshold failure.
 *
 * Thresholds:
 *   performance    >= 70  (warn — mobile PWA perf varies by machine)
 *   accessibility  >= 95  (error — hard-won WCAG AA)
 *   best-practices >= 90
 *   seo            >= 90
 */

const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');

const ROOT        = path.join(__dirname, '..');
const PORT        = 3333;
const REPORT_PATH = path.join(ROOT, 'test-results', 'lighthouse.json');

const THRESHOLDS = {
  performance:      70,
  accessibility:    95,
  'best-practices': 90,
  seo:              90,
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // ── 1. Start server ─────────────────────────────────────
  console.log(`[lhci] Starting server on http://localhost:${PORT} ...`);
  const server = spawn(
    process.execPath,
    ['server.js'],
    {
      env:   { ...process.env, PORT: String(PORT) },
      cwd:   ROOT,
      stdio: 'ignore',
    }
  );
  server.on('error', (err) => console.error('[lhci] server error:', err.message));

  // Give server time to bind
  await wait(2500);

  // ── 2. Run Lighthouse ────────────────────────────────────
  console.log('[lhci] Running Lighthouse audit...');
  const lhArgs = [
    '--yes',
    'lighthouse',
    `http://localhost:${PORT}`,
    '--output=json',
    `--output-path=${REPORT_PATH}`,
    '--chrome-flags=--headless --no-sandbox --disable-gpu',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--quiet',
  ];

  const lhExit = await new Promise((resolve) => {
    const lh = spawn('npx', lhArgs, { cwd: ROOT, stdio: 'inherit', shell: true });
    lh.on('close', resolve);
  });

  // ── 3. Stop server ───────────────────────────────────────
  server.kill();

  if (lhExit !== 0) {
    console.error(`\n[lhci] lighthouse exited with code ${lhExit}`);
    return 1;
  }

  // ── 4. Parse report and check thresholds ─────────────────
  if (!fs.existsSync(REPORT_PATH)) {
    console.error('[lhci] report file not found:', REPORT_PATH);
    return 1;
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const cats   = report.categories || {};
  let failed   = false;

  console.log('\n[lhci] Scores:');
  for (const [key, min] of Object.entries(THRESHOLDS)) {
    const score = Math.round((cats[key]?.score ?? 0) * 100);
    const pass  = score >= min;
    const mark  = pass ? 'PASS' : 'FAIL';
    console.log(`  ${mark}  ${key.padEnd(18)} ${String(score).padStart(3)}  (threshold: ${min})`);
    if (!pass) failed = true;
  }

  console.log(`\n[lhci] Report saved: ${REPORT_PATH}`);
  return failed ? 1 : 0;
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[lhci] Fatal:', err.message);
    process.exit(1);
  });
