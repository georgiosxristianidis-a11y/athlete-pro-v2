/**
 * ISL-REST-EXPAND — rest HUD must not share the pill with the expanded card.
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

/** Body of a named function in dynamic-island.js (IIFE-scoped). */
function fnBody(name) {
  const re = new RegExp(`function ${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n  \\}`);
  const m = SRC.match(re);
  assert.ok(m, `${name}() must exist in dynamic-island.js`);
  return m[1];
}

test('tap expand is blocked while rest HUD is active', () => {
  const clickBlock = SRC.match(
    /addEventListener\(\s*['"]click['"][\s\S]*?toggleExpand\(\)/,
  );
  assert.ok(clickBlock, 'island click handler must call toggleExpand');
  assert.match(clickBlock[0], /if\s*\(\s*_timerActive\s*\)\s*return/);
});

test('toggleExpand refuses while rest HUD is active', () => {
  assert.match(fnBody('toggleExpand'), /if\s*\(\s*_timerActive\s*\)\s*return/);
});

test('rest start collapses expanded card before timer-mode', () => {
  assert.match(
    SRC,
    /function setRestProgress[\s\S]*?if\s*\(\s*starting\s*\)\s*\{[\s\S]*?_expanded\s*=\s*false[\s\S]*?classList\.remove\(\s*['"]expanded['"]\s*\)[\s\S]*?classList\.add\(\s*['"]timer-mode['"]\s*\)/,
  );
});
