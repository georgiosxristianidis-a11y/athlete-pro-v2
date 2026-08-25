/**
 * ISL-REST-EXPAND — rest HUD must not share the pill with stale session card.
 *
 * timer-mode + expanded stacked #di-rest-next ("NEXT: …") over #di-name and
 * the live dot — ISL-DUP-NEXT hid #di-sublabel only; the name line stayed.
 * dynamic-island.js does not load under node --test (PiP/store deps), so this
 * guards the contract in source — same pattern as island-guard.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'js', 'shared', 'dynamic-island.js'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'css', 'dynamic-island.css'), 'utf8');

test('tap expand is not blocked while rest HUD is active', () => {
  const clickBlock = SRC.match(
    /addEventListener\(\s*['"]click['"][\s\S]*?toggleExpand\(\)/,
  );
  assert.ok(clickBlock, 'island click handler must call toggleExpand');
  assert.doesNotMatch(clickBlock[0], /if\s*\(\s*_timerActive\s*\)\s*return/);
});

test('compact rest hides session card; expanded rest hides HUD overlay (CSS)', () => {
  assert.match(
    CSS,
    /\.island\.timer-mode:not\(\.expanded\)\s+\.island-expanded-content\s*\{[^}]*display\s*:\s*none/,
  );
  assert.match(
    CSS,
    /\.island\.timer-mode\.expanded\s+\.island-rest\s*\{[^}]*display\s*:\s*none/,
  );
  assert.match(
    CSS,
    /\.island\.profile-minimal\.timer-mode\.expanded\s+\.island-status-line\s*\{[^}]*display\s*:\s*none/,
  );
});

test('expanded rest syncs via _renderExpandedDuringRest', () => {
  assert.match(SRC, /function _renderExpandedDuringRest\(/);
  assert.match(
    SRC,
    /if\s*\(\s*_timerActive\s*\)\s*\{[\s\S]*?if\s*\(\s*_expanded\s*\)\s*_renderExpandedDuringRest\(\)/,
  );
});

test('rest start collapses expanded card before timer-mode', () => {
  assert.match(
    SRC,
    /function setRestProgress[\s\S]*?if\s*\(\s*starting\s*\)\s*\{[\s\S]*?_expanded\s*=\s*false[\s\S]*?classList\.remove\(\s*['"]expanded['"]\s*\)[\s\S]*?classList\.add\(\s*['"]timer-mode['"]\s*\)/,
  );
});
