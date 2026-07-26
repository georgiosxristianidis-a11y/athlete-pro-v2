import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// AIR philosophy (NEXT_SESSION.md § Философия AIR): Tier 1 surfaces are flat
// near-black + hairline border, no blur. Only Tier 2 (floating glass) keeps
// backdrop-filter. This guard fails if a new backdrop-filter sneaks into a
// css/ file/selector outside the whitelist below — regression caught by the
// gate, not by eyes.
const cssDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'css');

// Whole-file exemptions: every backdrop-filter in these files is Tier 2 by design.
const WHITELIST_FILES = new Set(['dynamic-island.css']);

// Per-selector exemptions in files that are otherwise Tier 1.
const WHITELIST_SELECTORS = {
  'base.css': ['.modal-overlay', '.modal-sheet', '.claude-sheet', '.toast'],
  'athlete-room.css': ['.ar-crop-modal'],
};

function findBackdropFilterViolations() {
  const violations = [];
  for (const file of readdirSync(cssDir)) {
    if (!file.endsWith('.css') || WHITELIST_FILES.has(file)) continue;
    const allowedSelectors = WHITELIST_SELECTORS[file] || [];
    const raw = readFileSync(path.join(cssDir, file), 'utf8');
    // Strip /* ... */ comments (keep line count intact so line numbers stay accurate).
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const lines = src.split('\n');

    lines.forEach((line, i) => {
      if (!/backdrop-filter\s*:/.test(line)) return;
      if (/will-change\s*:\s*backdrop-filter/.test(line)) return; // not a filter declaration

      // Walk back to the nearest selector line opening this rule's block.
      let selector = '';
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(/^([^{]+)\{\s*$/);
        if (m) { selector = m[1].trim(); break; }
      }
      const isAllowed = allowedSelectors.some((sel) => selector.includes(sel));
      if (!isAllowed) {
        violations.push(`${file}:${i + 1} selector "${selector}" not in whitelist`);
      }
    });
  }
  return violations;
}

describe('AIR Tier guard — backdrop-filter whitelist', () => {
  test('no backdrop-filter outside Tier 2 whitelist', () => {
    const violations = findBackdropFilterViolations();
    assert.deepEqual(violations, []);
  });
});
