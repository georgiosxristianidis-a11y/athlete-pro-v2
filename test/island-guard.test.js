// S1 TEST-ISL-GUARD: regression lock for the island field-bug fixes B/C
// (1ab96cf). This file covers BUG-ISL-DOT only — BUG-ISL-TAP (control tap
// toggling expand) needs real click-event delegation and lives in
// test/e2e/regressions.spec.js instead: dynamic-island.js pulls in
// canvas/PiP/store deps that don't load under node --test (see sync-dot.js's
// own "kept DOM-free" comment).
//
// BUG-ISL-DOT: the idle path set `.island-dot.online`, a class with no
// matching CSS rule, so the dot rendered transparent. The fix added the rule
// — but the real invariant is broader: ANY class deriveDotState() can ever
// produce must have a visible `.island-dot.<state>` rule, or a future branch
// can reintroduce the exact same invisible-dot bug under a new name.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDotState } from '../js/shared/sync-dot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '..', 'css', 'dynamic-island.css'), 'utf8');

/** A `.island-dot.<state>` rule exists and declares a `background`. */
function hasVisibleDotRule(state) {
  const re = new RegExp(`\\.island-dot\\.${state}\\s*\\{[^}]*background\\s*:\\s*[^;]+;`);
  return re.test(css);
}

const scenarios = [
  { name: 'airgap',                         input: { mode: 'airgap', online: true,  syncStatus: 'idle',    cloudConfigured: true } },
  { name: 'offline (network down)',         input: { mode: 'cloud',  online: false, syncStatus: 'idle',    cloudConfigured: true } },
  { name: 'offline (sync reports offline)', input: { mode: 'cloud',  online: true,  syncStatus: 'offline', cloudConfigured: true } },
  { name: 'syncing',                        input: { mode: 'cloud',  online: true,  syncStatus: 'syncing', cloudConfigured: true } },
  { name: 'error',                          input: { mode: 'cloud',  online: true,  syncStatus: 'error',   cloudConfigured: true } },
  { name: 'no-cloud',                       input: { mode: 'cloud',  online: true,  syncStatus: 'idle',    cloudConfigured: false } },
  { name: 'synced',                         input: { mode: 'cloud',  online: true,  syncStatus: 'idle',    cloudConfigured: true } },
];

for (const { name, input } of scenarios) {
  test(`dot state "${name}" has a visible CSS rule (BUG-ISL-DOT)`, () => {
    const state = deriveDotState(input);
    assert.ok(hasVisibleDotRule(state), `.island-dot.${state} must declare a non-empty background`);
  });
}

test('deriveDotState never produces a class without a CSS rule (exhaustive sweep)', () => {
  // Sweep the whole input space, not just the documented branches — a future
  // edit to deriveDotState can't silently add a class with no CSS coverage.
  const modes = ['cloud', 'anon', 'airgap'];
  const onlines = [true, false];
  const syncStatuses = ['idle', 'syncing', 'error', 'offline', 'some-future-status'];
  const cloudConfigureds = [true, false];

  const seen = new Set();
  for (const mode of modes) {
    for (const online of onlines) {
      for (const syncStatus of syncStatuses) {
        for (const cloudConfigured of cloudConfigureds) {
          seen.add(deriveDotState({ mode, online, syncStatus, cloudConfigured }));
        }
      }
    }
  }

  for (const state of seen) {
    assert.match(
      css,
      new RegExp(`\\.island-dot\\.${state}\\s*\\{`),
      `.island-dot.${state} has no CSS rule at all — the dot would render invisible (BUG-ISL-DOT class)`
    );
  }
});
