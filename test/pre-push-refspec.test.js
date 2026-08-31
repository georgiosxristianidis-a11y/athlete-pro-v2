/**
 * Гейт для `.githooks/pre-push`: хук обязан судить РЕФСПЕК, а не чекаут
 * (карточка O-9, обе половины).
 *
 * Общий корень у обеих половин один: хук никогда не читал stdin, куда git
 * подаёт строки `<local ref> <local sha> <remote ref> <remote sha>` — то есть
 * ровно то, что уезжает на origin. Вместо этого он смотрел на имя HEAD и на
 * рабочее дерево, и ошибался в обе стороны сразу.
 *
 * ПОЛОВИНА 1 — пропускал то, что обязан ловить.
 * Branch-protection на приватном репо бесплатного плана недоступна (403 на
 * `branches/main/protection`), поэтому этот хук — ЕДИНСТВЕННЫЙ барьер перед
 * `main`. Проверял он при этом не ту сторону рефспека: сравнивал имя текущей
 * ветки (`git symbolic-ref --short HEAD`) со строкой `main`. Форма
 * `git push origin HEAD:main` уезжает в `main` с любой фича-ветки, а HEAD
 * называется не `main` — то есть барьер пропускал ровно тот пуш, ради запрета
 * которого стоит. Форма не теоретическая: ею пушили в этом же проекте
 * 2026-08-12, чтобы не переписывать чужую ветку.
 *
 * ПОЛОВИНА 2 — блокировал то, в чём проверять нечего.
 * Удаление уже влитой ветки (`git push origin --delete <ветка>`) упиралось
 * подряд в Drift Block и SAST Block, причём обе жалобы были про ЧУЖУЮ линию,
 * случайно лежавшую в чекауте ворктри, а удалялся ref, не несущий ни строки
 * кода. `DRIFT_OK=1` снимал только первый гард. Цена такого ложного блока — не
 * минута, а привычка тянуться к `--no-verify`, который глушит уже и настоящие
 * проверки. У удаления `local sha` — одни нули; пуш, где ВСЕ строки такие,
 * кода на origin не отправляет и проверять в нём нечего.
 *
 * Порядок двух половин важен и проверяется отдельно: удаление самого `main`
 * обязано упираться в Main Block, а не проваливаться в «удаления пропускаем».
 *
 * Как это вообще проверяется тестом (в карточке значилось «в тест не
 * переводится»): хук — обычный sh-скрипт, его можно запустить руками и подать
 * stdin. Чтобы прогон был быстрым и без сети, рабочей директорией берётся
 * пустая временная папка: проверки идут по порядку, а `Drift Block` падает от
 * отсутствия `scripts/check-branch-drift.mjs`. Поэтому «барьер промолчал»
 * доказывается появлением Drift Block, «гарды пропущены» — его отсутствием при
 * нулевом коде, и до npm audit / eslint дело не доходит ни в одном кейсе.
 *
 * Красный baseline воспроизводится без ребейза назад — путь к хуку
 * переопределяется переменной окружения:
 *
 *   git show 7b5b217:.githooks/pre-push > /tmp/old-hook   # до обеих половин
 *   PRE_PUSH_HOOK=/tmp/old-hook node --test test/pre-push-refspec.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sandboxGit } from './git-sandbox.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SRC = process.env.PRE_PUSH_HOOK || path.join(REPO_ROOT, '.githooks', 'pre-push');

const SHA_A = '1111111111111111111111111111111111111111';
const SHA_B = '2222222222222222222222222222222222222222';
const ZERO_SHA = '0'.repeat(40);
/** Тот же смысл при sha256 — хук обязан узнавать удаление по нулям, не по длине. */
const ZERO_SHA_256 = '0'.repeat(64);

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

test('удаление main ловит Main Block, а не пропуск удалений', opts, () => {
  const { code, out } = runHook({ stdin: `(delete) ${ZERO_SHA} refs/heads/main ${SHA_B}\n` });
  assert.match(out, /\[Main Block\]/, 'порядок проверок: main судится раньше, чем «это удаление»');
  assert.doesNotMatch(out, /\[Delete\]/);
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

test('удаление ветки проходит без обхода — гарды даже не стартуют', opts, () => {
  const { code, out } = runHook({
    stdin: `(delete) ${ZERO_SHA} refs/heads/claude/feature ${SHA_B}\n`,
  });
  assert.equal(code, 0, 'baseline O-9: здесь были Drift Block и SAST Block на пустой операции');
  assert.doesNotMatch(out, /\[Drift Block\]/, 'дрейф разбирает ветку, к удаляемому ref-у не относящуюся');
  assert.match(out, /\[Delete\]/, 'пропуск обязан быть проговорён, а не молчаливым');
});

test('удаление нескольких веток одним пушем — тоже без гардов', opts, () => {
  const { code } = runHook({
    stdin:
      `(delete) ${ZERO_SHA} refs/heads/claude/one ${SHA_A}\n` +
      `(delete) ${ZERO_SHA_256} refs/heads/claude/two ${SHA_B}\n`,
  });
  assert.equal(code, 0, 'нули считаются шаблоном, а не длиной — sha1 и sha256 оба');
});

test('удаление вперемешку с обычным пушем — гарды бегут', opts, () => {
  const { out } = runHook({
    stdin:
      `(delete) ${ZERO_SHA} refs/heads/claude/one ${SHA_A}\n` +
      `refs/heads/claude/two ${SHA_A} refs/heads/claude/two ${SHA_B}\n`,
  });
  assert.doesNotMatch(out, /\[Delete\]/, 'в таком пуше код УЕЗЖАЕТ — пропуск был бы дырой');
  assert.match(out, /\[Drift Block\]/);
});

test('пустой stdin (хук вызван не гитом) — откат на имя HEAD', opts, () => {
  const repo = path.join(sandbox, 'repo-main');
  mkdirSync(repo);
  sandboxGit(['init', '-q'], { cwd: repo });
  sandboxGit(['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: repo });

  const onMain = runHook({ stdin: '', cwd: repo });
  assert.match(onMain.out, /\[Main Block\]/, 'HEAD=main без рефспека — прежняя эвристика');
  assert.equal(onMain.code, 1);

  sandboxGit(['symbolic-ref', 'HEAD', 'refs/heads/claude/feature'], { cwd: repo });
  const onFeature = runHook({ stdin: '', cwd: repo });
  assert.doesNotMatch(onFeature.out, /\[Main Block\]/);
});
