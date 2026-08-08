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

/**
 * Тот же класс отказа, другой вход: `<link rel="modulepreload">` в index.html.
 * Удалённый модуль (js/workout-plans.js, снос второго движка плана 2026-08-08)
 * оставил за собой висячий preload — сервер отдал на него SPA-фолбэк 200
 * text/html, и браузер писал в консоль ошибку MIME на КАЖДОЙ загрузке.
 * Ни один гейт этого не ловил: файл «есть» (200), просто это не модуль.
 */
const ROOT = path.join(__dirname, '..');

describe('static guard: modulepreload targets in index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const re = /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g;
  const hrefs = [];
  let m;
  while ((m = re.exec(html))) hrefs.push(m[1]);

  test('sanity: index.html declares modulepreload hints', () => {
    assert.ok(hrefs.length > 0, 'ожидались <link rel="modulepreload"> — регэксп протух?');
  });

  for (const href of hrefs) {
    test(`modulepreload "${href}" resolves`, () => {
      assert.ok(
        fs.existsSync(path.join(ROOT, href)),
        `index.html объявляет preload на '${href}', но файла нет — браузер получит SPA-фолбэк text/html`
      );
    });
  }
});
