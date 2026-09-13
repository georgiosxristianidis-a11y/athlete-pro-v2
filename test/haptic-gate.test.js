/**
 * Guard for the Haptic Gate (card A3): vibration goes through haptic() from
 * js/shared/utils.js everywhere — never a direct navigator.vibrate call.
 *
 * haptic() isn't decoration: it gates on a real user interaction
 * (_hasInteracted) and falls back to a CSS pulse on iOS, where
 * navigator.vibrate silently no-ops. A direct call bypasses both.
 *
 * Comments mentioning "navigator.vibrate" (e.g. intel.view.js explaining why
 * a hot loop doesn't call it) are not violations — line comments are
 * stripped before matching so the guard doesn't redden on prose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The one file allowed to touch the real API. */
const EXEMPT = new Set(['js/shared/utils.js']);

function stripLineComments(src) {
  return src
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

test('haptic gate: navigator.vibrate only inside shared/utils.js', () => {
  // `js/**/*.js` alone only matches nested paths, not files directly under
  // js/ — both patterns are required or top-level modules go unchecked.
  const files = execFileSync('git', ['ls-files', '--', 'js/*.js', 'js/**/*.js'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !EXEMPT.has(f));

  const offenders = files.filter((f) => {
    const src = stripLineComments(readFileSync(path.join(REPO_ROOT, f), 'utf8'));
    return /navigator\s*\.\s*vibrate/.test(src);
  });

  assert.deepEqual(offenders, [], `direct navigator.vibrate outside haptic(): ${offenders.join(', ')}`);
});
