// @ts-check
/**
 * Static guard — dynamic import() targets in js/shared/ must resolve on disk.
 *
 * js/shared/*.js lazy-loads sibling modules via `await import('./x.js')` /
 * `import('../y.js')` (athlete-room.js alone has several: body-stats,
 * profile.view x3, profile.store). A renamed/moved target silently breaks
 * at runtime — the failure only surfaces when a user actually hits that
 * code path (e.g. saveName() only imports profile.store.js when Apply is
 * pressed). This catches a broken relative path at test time instead,
 * without needing a browser.
 *
 * Only real `import(...)` call expressions are checked — JSDoc type-imports
 * like `@param {import('../db.js').WorkoutRecord}` are comments, not code,
 * and are stripped before scanning so they can't produce false positives.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_DIR = path.join(__dirname, '..', 'js', 'shared');

/** Strip /* block *\/ and // line comments so JSDoc type-imports never match. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findDynamicImports(src) {
  const code = stripComments(src);
  const re = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const targets = [];
  let m;
  while ((m = re.exec(code))) targets.push(m[1]);
  return targets;
}

describe('static guard: dynamic import() targets in js/shared/', () => {
  const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.js'));
  assert.ok(files.length > 0, 'sanity: js/shared/ should contain .js files');

  for (const file of files) {
    const full = path.join(SHARED_DIR, file);
    const src = fs.readFileSync(full, 'utf8');
    const targets = findDynamicImports(src);

    for (const spec of targets) {
      test(`${file}: import('${spec}') resolves`, () => {
        assert.ok(spec.startsWith('.'), `expected a relative import, got '${spec}'`);
        const resolved = path.resolve(path.dirname(full), spec);
        assert.ok(
          fs.existsSync(resolved),
          `${file} does import('${spec}') -> missing file: ${resolved}`
        );
      });
    }
  }
});
