/**
 * Гейт для обёртки юнит-прогона (карточка GATE-DESCRIBE): упавший `describe`
 * краснит `npm test`.
 *
 * Находка 17.10, Node 22.22.2: тело `describe()`, бросающее до первого `it()`,
 * даёт `not ok 1 - <имя>`, но `# tests 0`, `# fail 0` и exit 0 — сюита
 * исчезает из счёта молча. На фикстуре boom это воспроизводится голым
 * `node --test` (exit 0); здесь проверяется, что обёртка на ней красная.
 *
 * Слоёв два:
 *   - ПРОГОН — обёртка как процесс на фикстурах test/fixtures/gate-describe/
 *     (расширение .fixture.js мимо юнит-глоба). Тест сам бежит внутри
 *     node --test, то есть с NODE_TEST_CONTEXT в окружении: если обёртка
 *     перестанет его вычищать, вложенный прогон пропустит файлы и boom
 *     позеленеет — кейс ниже это поймает;
 *   - РАЗБОР — `findFailures` на синтетическом TAP: вложенность, директивы,
 *     экранированный `#` в имени.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_GLOB, buildArgs, findFailures } from '../scripts/run-unit-tests.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRAPPER = path.join('scripts', 'run-unit-tests.mjs');
const FIXTURES = 'test/fixtures/gate-describe';

function runWrapper(fixture) {
  return spawnSync(process.execPath, [WRAPPER, `${FIXTURES}/${fixture}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

// --- Прогон ------------------------------------------------------------------

test('gate-describe: бросающий describe — обёртка красная и называет сюиту', () => {
  const res = runWrapper('boom.fixture.js');

  assert.match(res.stdout, /^not ok 1 - boom$/m, 'фикстура обязана дать not ok в TAP');
  assert.notEqual(res.status, 0, `обёртка зелёная на упавшей сюите:\n${res.stdout}`);
  assert.match(res.stderr, /КРАСНЫЙ.*\bboom\b/);
});

test('gate-describe: чистая сюита — обёртка зелёная', () => {
  const res = runWrapper('clean.fixture.js');

  assert.match(res.stdout, /^# pass 1$/m, 'фикстура обязана реально прогнаться');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stderr, '');
});

test('gate-describe: упавший todo и skip — обёртка зелёная', () => {
  const res = runWrapper('todo.fixture.js');

  assert.match(res.stdout, /^\s*not ok \d+ - .* # TODO$/m, 'todo обязан упасть, иначе кейс пустой');
  assert.match(res.stdout, /^\s*ok \d+ - .* # SKIP$/m);
  assert.equal(res.status, 0, res.stderr);
});

// --- Разбор ------------------------------------------------------------------

test('gate-describe: not ok ловится на любой вложенности', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: outer',
    '    # Subtest: inner',
    '        not ok 1 - deep',
    '    ok 1 - inner',
    'ok 1 - outer',
    '# fail 0',
  ].join('\n');

  assert.deepEqual(findFailures(tap), ['deep']);
});

test('gate-describe: директивы TODO и SKIP не краснят, экранированный # — часть имени', () => {
  const tap = [
    'not ok 1 - todo case # TODO',
    'not ok 2 - skipped case # SKIP not ready',
    'not ok 3 - has \\# TODO in name',
    'ok 4 - fine',
    '# not ok 5 - console.log из теста — комментарий TAP',
    'not ok 6 - not a directive # FIXME',
  ].join('\r\n');

  // TAP 13 знает только TODO и SKIP: прочий текст после `#` падение не снимает.
  assert.deepEqual(findFailures(tap), ['has # TODO in name', 'not a directive']);
});

test('gate-describe: без глобов — юнит-глоб, не голый node --test', () => {
  assert.equal(DEFAULT_GLOB, 'test/*.test.js');
  assert.deepEqual(buildArgs([]), ['--test', '--test-reporter=tap', 'test/*.test.js']);
  assert.deepEqual(buildArgs(['--test-name-pattern=x', 'a/*.js']), [
    '--test-name-pattern=x',
    '--test',
    '--test-reporter=tap',
    'a/*.js',
  ]);
});
