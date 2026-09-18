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

/**
 * A15 — views не зовут `DB.*` напрямую, только через свой `*.store.js`.
 *
 * Правило закреплено в `.claude/rules/architecture.md` (Store/View pattern).
 * Массовая миграция долга — отдельными PR по поверхности (см.
 * `docs/handoff/HANDOFF_cursor_arch_cards.md` § A15), этот гард только не даёт
 * долгу расти: baseline ниже — точная фотография на момент правила, новый
 * прямой вызов `DB.*` в уже размеченном файле красит тест, новый view-файл
 * с прямым вызовом красит его с нуля.
 *
 * Снизить число в BASELINE можно после миграции — тест это разрешает
 * (`<=`), поднять число без миграции — нет.
 */
describe('A15: views не зовут DB.* напрямую (кроме store)', () => {
  const JS_ROOT = path.join(ROOT, 'js');

  /** view-файл в терминах A15: `*.view.js`, что-то внутри `*.view/`, и владелец экрана `profile.js`. */
  function isViewFile(relPosix) {
    if (relPosix === 'js/profile.js') return true;
    if (/\.view\//.test(relPosix)) return true;
    if (/\.view\.js$/.test(relPosix)) return true;
    return false;
  }

  function walkJs(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walkJs(full, out); continue; }
      if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
  }

  /**
   * Комментарии вырезаем той же функцией, что и выше: `@param {Object} settings
   * - All settings from DB.Settings.getAll()` — документация, а не вызов, и без
   * стрипа она держала `profile.view/settings.js` на baseline 1 навсегда.
   * Обратную ошибку (гард зеленеет на закомментированном коде) это не вносит:
   * закомментированный `DB.*` и есть отсутствие вызова.
   */
  function countDbCalls(src) {
    return (stripComments(src).match(/\bDB\.[A-Za-z]/g) || []).length;
  }

  /** Долг на дату правила (14.09.2026) — не расти. Понижается миграцией по поверхности. */
  const BASELINE = {
    'js/ai-settings.view.js': 3,
    'js/claude.view.js': 5,
    // A9 (17.09): 11 → 0, экран ходит в базу только через js/intel.store.js.
    'js/intel.view.js': 0,
    'js/privacy.view.js': 6,
    // A13 (18.09): 39 → 0 — экран профиля ходит в базу только через
    // js/profile.store.js. Вместе с ним 0 получили оба его view-файла.
    'js/profile.js': 0,
    'js/profile.view/settings.js': 0,
    'js/profile.view.js': 0,
    'js/workout-ai.view.js': 3,
    'js/workout.view/handlers.js': 4,
    'js/workout.view/render.js': 2,
  };

  const files = walkJs(JS_ROOT, [])
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter(isViewFile);

  test('sanity: список view-файлов не пуст', () => {
    assert.ok(files.length > 0, 'isViewFile не нашёл ни одного файла — паттерн протух?');
  });

  test('sanity: baseline покрывает те же файлы, что реально существуют', () => {
    const missing = Object.keys(BASELINE).filter((f) => !files.includes(f));
    assert.deepEqual(missing, [], 'baseline ссылается на файл, которого нет: ' + missing.join(', '));
  });

  for (const rel of files) {
    const allowed = BASELINE[rel] ?? 0;
    test(`${rel}: прямых DB.* не больше baseline (${allowed})`, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const count = countDbCalls(src);
      assert.ok(
        count <= allowed,
        `${rel} зовёт DB.* ${count} раз(а), baseline — ${allowed}. ` +
        'Новый вызов из view — перенести логику в *.store.js и звать его оттуда.',
      );
    });
  }
});
