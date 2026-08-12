/**
 * Гейт для проверки `Main Block` в `.githooks/pre-push` (карточка O-9).
 *
 * Branch-protection на приватном репо бесплатного плана недоступна (403 на
 * `branches/main/protection`), поэтому этот хук — ЕДИНСТВЕННЫЙ барьер перед
 * `main`. Проверял он при этом не ту сторону рефспека: сравнивал имя текущей
 * ветки (`git symbolic-ref --short HEAD`) со строкой `main`. Форма
 * `git push origin HEAD:main` уезжает в `main` с любой фича-ветки, а HEAD
 * называется не `main` — то есть барьер пропускал ровно тот пуш, ради запрета
 * которого стоит. Форма не теоретическая: ею пушили в этом же проекте
 * 2026-08-12, чтобы не переписывать чужую ветку.
 *
 * Правда о том, что уезжает на origin, есть только в stdin хука: git подаёт
 * туда строки `<local ref> <local sha> <remote ref> <remote sha>`. Проверка
 * обязана смотреть на `remote ref`.
 *
 * Как это вообще проверяется тестом (в карточке значилось «в тест не
 * переводится»): хук — обычный sh-скрипт, его можно запустить руками и подать
 * stdin. Чтобы прогон был быстрым и без сети, рабочей директорией берётся
 * пустая временная папка: `Main Block` стоит первым, а сразу за ним —
 * `Drift Block`, который падает от отсутствия `scripts/check-branch-drift.mjs`.
 * Поэтому «Main Block промолчал» доказывается появлением Drift Block, и до
 * npm audit / eslint дело не доходит.
 *
 * Красный baseline воспроизводится без ребейза назад — путь к хуку
 * переопределяется переменной окружения:
 *
 *   git show 7b5b217:.githooks/pre-push > /tmp/old-hook
 *   PRE_PUSH_HOOK=/tmp/old-hook node --test test/pre-push-main-block.test.js
 *
 * На старом хуке падает кейс «HEAD:main с фича-ветки» — он и есть дыра.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SRC = process.env.PRE_PUSH_HOOK || path.join(REPO_ROOT, '.githooks', 'pre-push');

const SHA_A = '1111111111111111111111111111111111111111';
const SHA_B = '2222222222222222222222222222222222222222';
const ZERO_SHA = '0000000000000000000000000000000000000000';

/** Git Bash есть не в каждой оболочке Windows; в CI (ubuntu) sh есть всегда. */
const shMissing = spawnSync('sh', ['-c', 'exit 0']).error
  ? 'sh недоступен в этой оболочке — хук sh-скрипт, проверять нечем'
  : false;

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'prepush-o9-'));

/**
 * Хук лежит в рабочем дереве с CRLF (`core.autocrlf=true` на Windows), а на
 * Linux — с LF. Копия с нормализованными переводами строк убирает эту разницу
 * из-под теста: проверяем логику, а не то, чем ОС закончила строку.
 */
const hookPath = path.join(sandbox, 'pre-push');
writeFileSync(hookPath, readFileSync(HOOK_SRC, 'utf8').replace(/\r\n/g, '\n'));

/** Пустая директория: `Main Block` пройден → сразу Drift Block, без сети. */
const emptyCwd = path.join(sandbox, 'empty');
mkdirSync(emptyCwd);

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/** @param {{ stdin?: string, cwd?: string, env?: Record<string,string> }} opts */
function runHook({ stdin = '', cwd = emptyCwd, env = {} } = {}) {
  const res = spawnSync('sh', [hookPath], {
    input: stdin,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, MAIN_PUSH_OK: '', DRIFT_OK: '', ...env },
  });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

const opts = { skip: shMissing };

test('HEAD:main с фича-ветки блокируется — судим по целевой стороне рефспека', opts, () => {
  const { code, out } = runHook({
    stdin: `refs/heads/claude/feature ${SHA_A} refs/heads/main ${SHA_B}\n`,
  });
  assert.match(out, /\[Main Block\]/, 'push origin HEAD:main обязан упереться в барьер');
  assert.equal(code, 1);
});

test('прямой пуш ветки main блокируется', opts, () => {
  const { code, out } = runHook({
    stdin: `refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n`,
  });
  assert.match(out, /\[Main Block\]/);
  assert.equal(code, 1);
});

test('удаление main блокируется (local sha из нулей)', opts, () => {
  const { code, out } = runHook({ stdin: `(delete) ${ZERO_SHA} refs/heads/main ${SHA_B}\n` });
  assert.match(out, /\[Main Block\]/);
  assert.equal(code, 1);
});

test('main среди нескольких рефов одного пуша не теряется', opts, () => {
  const { out } = runHook({
    stdin:
      `refs/heads/claude/feature ${SHA_A} refs/heads/claude/feature ${SHA_B}\n` +
      `refs/heads/claude/feature ${SHA_A} refs/heads/main ${SHA_B}\n`,
  });
  assert.match(out, /\[Main Block\]/, 'проверяются ВСЕ строки stdin, не первая');
});

test('пуш в фича-ветку барьер не трогает — доходит до следующего гарда', opts, () => {
  const { out } = runHook({
    stdin: `refs/heads/claude/feature ${SHA_A} refs/heads/claude/feature ${SHA_B}\n`,
  });
  assert.doesNotMatch(out, /\[Main Block\]/, 'обычный пуш не должен упираться в Main Block');
  assert.match(out, /\[Drift Block\]/, 'а дойти до следующей проверки — обязан');
});

test('MAIN_PUSH_OK=1 остаётся осознанным обходом', opts, () => {
  const { out } = runHook({
    stdin: `refs/heads/claude/feature ${SHA_A} refs/heads/main ${SHA_B}\n`,
    env: { MAIN_PUSH_OK: '1' },
  });
  assert.doesNotMatch(out, /\[Main Block\]/);
  assert.match(out, /\[Drift Block\]/);
});

test('пустой stdin (хук вызван не гитом) — откат на имя HEAD', opts, () => {
  const repo = path.join(sandbox, 'repo-main');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: repo });

  const onMain = runHook({ stdin: '', cwd: repo });
  assert.match(onMain.out, /\[Main Block\]/, 'HEAD=main без рефспека — прежняя эвристика');
  assert.equal(onMain.code, 1);

  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/claude/feature'], { cwd: repo });
  const onFeature = runHook({ stdin: '', cwd: repo });
  assert.doesNotMatch(onFeature.out, /\[Main Block\]/);
});
