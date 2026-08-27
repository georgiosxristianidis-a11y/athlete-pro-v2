/**
 * Гейт свежести базы, когда сессия идёт на `main` (карточка FLOW-5).
 *
 * Мина. `preflight` печатал `[OK] база ветки: сессия на main` по одному лишь
 * имени ветки — отставание не считалось вообще (`scripts/preflight.mjs:144` до
 * этой карточки). Между тем корневой чекаут почти всегда стоит на `main`, и
 * именно из него читаются правила: `CLAUDE.md`, `.claude/rules/*`, скиллы.
 * Протухшее дерево отдаёт протухшие правила, а старт сессии рапортует «чист».
 *
 * Стоимость промаха замерена 2026-08-27: корень отставал на девять коммитов,
 * `preflight` был зелёный, и `agent-brief` прочитался без полей ФАЙЛЫ/ГЕЙТ —
 * то есть в версии, где закрытая карточка выглядит открытой.
 *
 * Почему тест, а не «поправили и ладно»: проверка живёт в чекауте и умереть
 * может так же молча, как молчала сама.
 *
 * Красный baseline воспроизводится без ребейза назад:
 *   git stash && node --test test/preflight-main-freshness.test.js
 *
 * Прогон идёт в синтетическом репозитории во временной папке (bare origin +
 * клон): ни сети, ни GitHub не нужно — `origin` не github.com, и сетевые
 * проверки preflight сами уходят в WARN. Прочие FAIL того прогона (в temp-папке
 * нет node_modules) к делу не относятся — судится одна строка отчёта.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFLIGHT = path.join(REPO_ROOT, 'scripts', 'preflight.mjs');

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'main-freshness-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/** @param {string} cwd */
const git =
  (cwd) =>
  (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Синтетический репозиторий: bare origin с веткой `main` + клон на ней. */
function makeRepo() {
  const root = path.join(sandbox, `case-${++seq}`);
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  mkdirSync(root);

  execFileSync('git', ['init', '--bare', '-b', 'main', '-q', origin]);
  execFileSync('git', ['clone', '-q', origin, work]);
  const g = git(work);
  g('config', 'user.email', 'agent@example.com');
  g('config', 'user.name', 'Agent');
  g('config', 'core.hooksPath', '.githooks');
  mkdirSync(path.join(work, '.githooks'));

  writeFileSync(path.join(work, 'README.md'), 'base\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('push', '-q', 'origin', 'main');

  return { work, g };
}

/**
 * Двигает `origin/main` вперёд и оставляет локальную ветку на прежнем коммите —
 * ровно та картина, в которой чекаут отстаёт, а имя ветки не меняется.
 * @param {(...args: string[]) => string} g
 * @param {string} work
 * @param {number} n
 */
function advanceOrigin(g, work, n) {
  const before = g('rev-parse', 'HEAD');
  for (let i = 1; i <= n; i++) {
    writeFileSync(path.join(work, `ahead-${i}.md`), `ahead ${i}\n`);
    g('add', '-A');
    g('commit', '-qm', `main moves on ${i}`);
  }
  g('push', '-q', 'origin', 'main');
  g('reset', '-q', '--hard', before);
}

/** @returns {{ code: number|null, out: string }} */
function runPreflight(cwd) {
  const res = spawnSync(process.execPath, [PREFLIGHT], { cwd, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

/** Строка отчёта про базу ветки — только она и судится. */
const baseLine = (out) => out.split('\n').find((l) => l.includes('база ветки')) || '';

test('main вровень с origin/main — OK', () => {
  const { work } = makeRepo();

  const line = baseLine(runPreflight(work).out);
  assert.match(line, /\[OK/, `свежий main обязан быть зелёным\n${line}`);
});

test('main отстал — WARN с числом коммитов и командой выхода', () => {
  const { work, g } = makeRepo();
  advanceOrigin(g, work, 2);

  const { out } = runPreflight(work);
  const line = baseLine(out);
  assert.match(line, /\[WARN/, `baseline FLOW-5: здесь стояло "[OK] сессия на main"\n${out}`);
  assert.match(line, /\b2\b/, 'в отчёте обязано стоять расстояние, иначе непонятен масштаб');
  assert.match(out, /--ff-only/, 'WARN без команды выхода — половина гарда');
});

test('отставание на main не роняет сессию — это WARN, а не FAIL', () => {
  const { work, g } = makeRepo();
  advanceOrigin(g, work, 1);

  const { out } = runPreflight(work);
  assert.doesNotMatch(
    baseLine(out),
    /\[FAIL/,
    'протухший чекаут чинится одной командой, не стопом'
  );
});

test('ветка от отставшей базы судится прежней проверкой — про rebase, не про ff', () => {
  const { work, g } = makeRepo();
  advanceOrigin(g, work, 1);
  g('checkout', '-q', '-b', 'claude/card');

  const { out } = runPreflight(work);
  const line = baseLine(out);
  assert.match(line, /\[WARN/, 'ветка на старой базе — прежний сигнал, карточка его не трогает');
  assert.match(out, /rebase origin\/main/, 'для ветки выход — rebase: ff тут не при чём');
});
