// AIR-4 TEST-GUARD: regression lock for the AIR refactor (DoD-2).
//
// The AIR law has three elevation tiers (.claude/rules/design.md
// § Инварианты «AIR»):
//   Tier 0 — page: near-black --c-bg
//   Tier 1 — content: FLAT --c-bg-2 + hairline, NO backdrop-filter
//   Tier 2 — floating glass: blur allowed (modals, toast, island, nav)
//
// Tier 1 kept regressing by hand — one `backdrop-filter: blur()` copy-pasted
// into a card and the whole screen goes milky again, and nobody notices until
// a field check in the dark. This guard greps css/ and fails the gate instead
// of the eyes: blur is legal ONLY on the Tier-2 whitelist below.
//
// Second half of the guard is the mirror image: Tier 2 blur must NOT silently
// disappear either (a too-eager future sweep would flatten the modals).

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = join(__dirname, '..', 'css');

/** Tier 2 — the ONLY selectors allowed to declare a blurring backdrop-filter. */
const TIER2_WHITELIST = {
  'base.css': [/\.modal-overlay\b/, /\.modal-sheet\b/, /\.claude-sheet\b/, /\.toast\b/],
  'dynamic-island.css': [/./],            // whole file is the island (Tier 2 HUD)
  'athlete-room.css': [/\.ar-crop-modal\b/], // a modal, not a card
};

/** Strips comments, preserving newlines so line numbers stay honest. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Flat list of every declaration with the selector it lives under.
 * @returns {Array<{selector: string, prop: string, value: string, line: number}>}
 */
function declarations(css) {
  const src = stripComments(css);
  const out = [];
  const stack = [];
  let buf = '';
  let line = 1;

  const flush = (endLine) => {
    const i = buf.indexOf(':');
    if (i === -1 || !stack.length) return;
    const prop = buf.slice(0, i).trim();
    const value = buf.slice(i + 1).trim();
    if (!prop || prop.startsWith('@')) return;
    // innermost non-at-rule prelude = the selector this declaration applies to
    const selector = [...stack].reverse().find((s) => !s.startsWith('@')) || stack[stack.length - 1];
    out.push({ selector, prop, value, line: endLine });
  };

  for (const ch of src) {
    if (ch === '\n') { line++; buf += ' '; continue; }
    if (ch === '{') { stack.push(buf.trim().replace(/\s+/g, ' ')); buf = ''; continue; }
    if (ch === '}') { flush(line); stack.pop(); buf = ''; continue; }
    if (ch === ';') { flush(line); buf = ''; continue; }
    buf += ch;
  }
  return out;
}

const cssFiles = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort();

test('css/ has files to guard (self-check)', () => {
  assert.ok(cssFiles.length >= 10, `expected the css/ dir, got ${cssFiles.length} files`);
});

test('backdrop-filter appears only on the Tier-2 whitelist (AIR Tier 1 stays flat)', () => {
  const offenders = [];

  for (const file of cssFiles) {
    const allowed = TIER2_WHITELIST[file] || [];
    for (const d of declarations(readFileSync(join(CSS_DIR, file), 'utf8'))) {
      if (!/^(-webkit-)?backdrop-filter$/.test(d.prop)) continue;
      if (/^none$/i.test(d.value)) continue;       // removing blur is always legal
      if (allowed.some((re) => re.test(d.selector))) continue;
      offenders.push(`css/${file}:${d.line}  ${d.selector} { ${d.prop}: ${d.value} }`);
    }
  }

  assert.deepEqual(
    offenders, [],
    'Tier 1 must stay flat (background: var(--c-bg-2) + hairline). ' +
    'backdrop-filter outside the Tier-2 whitelist:\n' + offenders.join('\n'),
  );
});

test('will-change: backdrop-filter follows the same whitelist', () => {
  const offenders = [];

  for (const file of cssFiles) {
    const allowed = TIER2_WHITELIST[file] || [];
    for (const d of declarations(readFileSync(join(CSS_DIR, file), 'utf8'))) {
      if (d.prop !== 'will-change' || !/backdrop-filter/.test(d.value)) continue;
      if (allowed.some((re) => re.test(d.selector))) continue;
      offenders.push(`css/${file}:${d.line}  ${d.selector} { will-change: ${d.value} }`);
    }
  }

  assert.deepEqual(offenders, [], 'will-change hints a blur that Tier 1 must not have:\n' + offenders.join('\n'));
});

// ── Mirror side: Tier 2 must KEEP its glass ──────────────────────────────
const TIER2_REQUIRED = [
  ['base.css', '.modal-overlay'],
  ['base.css', '.modal-sheet'],
  ['base.css', '.toast'],
  ['dynamic-island.css', '.island'],
  ['athlete-room.css', '.ar-crop-modal'],
];

for (const [file, selector] of TIER2_REQUIRED) {
  test(`Tier 2 keeps its blur: ${file} ${selector}`, () => {
    const blurred = declarations(readFileSync(join(CSS_DIR, file), 'utf8')).some(
      (d) => d.prop === 'backdrop-filter'
        && /blur\(/.test(d.value)
        && new RegExp(`(^|[,\\s])\\${selector}(\\b|[.:,\\s])`).test(d.selector),
    );
    assert.ok(blurred, `${selector} lost its Tier-2 backdrop-filter: blur()`);
  });
}
