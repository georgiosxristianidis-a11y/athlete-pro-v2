/**
 * Гейт забытого WIP в корневом чекауте (карточка FLOW-6).
 *
 * Мина. 08.10 в корне осталось семь путей без коммита, ветки и PR (1172 строки), нашлись
 * через ~39 ч руками. Ни один слой в эту сторону не смотрел: `preflight` считал отставание
 * корня от `origin/main`, не его грязь; `session-guard` ловит дрейф на Edit; `pre-push` и CI
 * видят только дошедшее до пуша; `inventory` судит ветки, а не дерево.
 *
 * Корень делится с живой сессией, поэтому возраст судится по САМОЙ СВЕЖЕЙ правке: свежая —
 * возможно кто-то работает прямо сейчас, и молчать надо. Проверка только читает.
 *
 * Красный baseline воспроизводится без ребейза назад — вырезать блок 3c из
 * `scripts/preflight.mjs` (без `git stash`: стек общий на все worktree) и прогнать файл.
 *
 * Прогон идёт в синтетическом репозитории во временной папке (bare origin + клон +
 * линкованный worktree): ни сети, ни GitHub не нужно. Прочие FAIL того прогона (в temp-папке
 * нет node_modules) к делу не относятся — судится одна строка отчёта.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sandboxGit, sandboxGitIn } from './git-sandbox.js';
import { judgeRootWip, parsePorcelainZ } from '../scripts/root-wip.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFLIGHT = path.join(REPO_ROOT, 'scripts', 'preflight.mjs');

const HOUR = 60 * 60 * 1000;
const STALE_MS = 24 * HOUR;
const NAME = 'WIP в корне';

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'root-wip-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

// --- Чистые функции: разбор и вердикт, без git ------------------------------

test('parsePorcelainZ: имена с пробелами и кириллицей, хвостовой \\0 не запись', () => {
  const entries = parsePorcelainZ(' M docs/a b.md\0?? доки/новый.md\0');
  assert.deepEqual(entries, [
    { code: ' M', path: 'docs/a b.md' },
    { code: '??', path: 'доки/новый.md' },
  ]);
  assert.deepEqual(parsePorcelainZ(''), []);
});

test('parsePorcelainZ: у переименования старый путь — не отдельная запись', () => {
  const entries = parsePorcelainZ('R  new name.txt\0old.txt\0?? tail.md\0');
  assert.deepEqual(entries, [
    { code: 'R ', path: 'new name.txt' },
    { code: '??', path: 'tail.md' },
  ]);
});

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const judge = (items, extra = {}) =>
  judgeRootWip({ items, indexMtimeMs: null, now: NOW, staleMs: STALE_MS, maxListed: 10, ...extra });
const item = (p, hoursAgo, code = ' M') => ({
  code,
  path: p,
  mtimeMs: hoursAgo === null ? null : NOW - hoursAgo * HOUR,
});

test('judgeRootWip: пусто — OK «чист»', () => {
  const v = judge([]);
  assert.equal(v.level, 'OK');
  assert.match(v.msg, /чист/);
});

test('judgeRootWip: возраст по самой СВЕЖЕЙ правке, не по самой старой', () => {
  const v = judge([item('old.js', 100), item('fresh.js', 1)]);
  assert.equal(v.level, 'OK', 'свежий путь рядом со старым — возможно живая сессия');
  assert.match(v.msg, /правится сейчас/, 'молчащая проверка умирает так же молча — пометка обязана быть');
});

test('judgeRootWip: все старше порога — WARN с числом путей, часами и подсказкой без разрушения', () => {
  const v = judge([item('a.js', 39), item('b.js', 40), item('c.js', 41, '??')]);
  assert.equal(v.level, 'WARN');
  assert.match(v.msg, /3 пути/);
  assert.match(v.msg, /39 ч назад/, 'считается от самой свежей из трёх');
  assert.match(v.hint, /не откатывать/);
  assert.doesNotMatch(v.hint, /git (checkout|reset|clean|stash)/, 'подсказка не зовёт к разрушению');
});

test('judgeRootWip: ровно порог — уже WARN, чуть меньше — ещё нет', () => {
  assert.equal(judge([item('a.js', 24)]).level, 'WARN');
  assert.equal(judge([item('a.js', 23.9)]).level, 'OK');
});

test('judgeRootWip: список режется по maxListed, остаток — числом', () => {
  const items = Array.from({ length: 13 }, (_, i) => item(`f${i}.js`, 50));
  const v = judge(items, { maxListed: 10 });
  assert.equal(v.detail.length, 11);
  assert.equal(v.detail.at(-1), '... и ещё 3');
});

test('judgeRootWip: одни удаления — возраст по mtime индекса корня', () => {
  const gone = [item('gone.js', null, ' D')];
  assert.equal(judge(gone, { indexMtimeMs: NOW - 30 * HOUR }).level, 'WARN');
  assert.equal(judge(gone, { indexMtimeMs: NOW - 2 * HOUR }).level, 'OK');
});

test('judgeRootWip: возраст не определить — WARN, а не тишина', () => {
  const v = judge([item('gone.js', null, ' D')]);
  assert.equal(v.level, 'WARN');
  assert.match(v.msg, /возраст не определить/);
});

test('judgeRootWip: склонение «путь/пути/путей»', () => {
  const word = (n) => judge(Array.from({ length: n }, (_, i) => item(`f${i}`, 50))).msg.split(' ')[1];
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map(word), [
    'путь',
    'пути',
    'путей',
    'путей',
    'путей',
    'путь',
    'пути',
    'путей',
  ]);
});

// --- preflight целиком: синтетический репозиторий ---------------------------

/**
 * Bare origin с веткой `main`, откуда клонируется корень (`work`). `autocrlf` кладёт в корень
 * CRLF-копии файлов, лежащих в репозитории с LF, — картина Windows.
 * @param {{ autocrlf?: boolean }} [opts]
 */
function makeRepo({ autocrlf = false } = {}) {
  const root = path.join(sandbox, `case-${++seq}`);
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  const work = path.join(root, 'work');
  mkdirSync(root);

  sandboxGit(['init', '--bare', '-b', 'main', '-q', origin]);
  sandboxGit(['clone', '-q', origin, seed]);
  const s = sandboxGitIn(seed);
  s('config', 'user.email', 'agent@example.com');
  s('config', 'user.name', 'Agent');
  s('config', 'core.autocrlf', 'false');
  mkdirSync(path.join(seed, '.githooks'));
  writeFileSync(path.join(seed, '.githooks', 'pre-push'), '#!/bin/sh\n');
  writeFileSync(path.join(seed, 'README.md'), 'base\n');
  s('add', '-A');
  s('commit', '-qm', 'base');
  s('push', '-q', 'origin', 'main');

  sandboxGit(['clone', '-q', '-c', `core.autocrlf=${autocrlf}`, origin, work]);
  const g = sandboxGitIn(work);
  g('config', 'user.email', 'agent@example.com');
  g('config', 'user.name', 'Agent');
  g('config', 'core.hooksPath', '.githooks');
  return { work, g, root };
}

/** Линкованный worktree — отсюда обычно и идёт сессия. */
function addLinked({ g, root }) {
  const linked = path.join(root, 'linked');
  g('worktree', 'add', '-q', '-b', 'claude/card', linked);
  return linked;
}

/** @param {string} file @param {number} hours */
function age(file, hours) {
  const t = new Date(Date.now() - hours * HOUR);
  utimesSync(file, t, t);
}

/** Пишет файл и состаривает его. */
function put(file, hours, body = 'wip\n') {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  age(file, hours);
}

/** @returns {{ code: number|null, out: string }} */
function runPreflight(cwd) {
  const res = spawnSync(process.execPath, [PREFLIGHT], { cwd, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

/** Строка отчёта про корень — только она и судится. */
const wipLine = (out) => out.split('\n').find((l) => l.includes(NAME)) || '';

/** Строка + подсказка + список путей под ней — до следующей `[` проверки. */
function wipBlock(out) {
  const lines = out.split('\n');
  const at = lines.findIndex((l) => l.includes(NAME));
  if (at < 0) return '';
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => !l.startsWith('         '));
  return [lines[at], ...rest.slice(0, end < 0 ? rest.length : end)].join('\n');
}

test('1. чистый корень — OK', () => {
  const { work } = makeRepo();

  const { out } = runPreflight(work);
  assert.match(wipLine(out), /\[OK/, `чистый корень обязан быть зелёным\n${out}`);
});

test('2. грязный корень, правка старше суток — WARN с числом путей и подсказкой', () => {
  const { work } = makeRepo();
  put(path.join(work, 'README.md'), 30, 'dirty\n');
  put(path.join(work, 'forgotten.md'), 30);

  const { out, code } = runPreflight(work);
  const block = wipBlock(out);
  assert.match(block, /\[WARN/, `baseline FLOW-6: здесь стояла тишина\n${out}`);
  assert.match(block, /\b2 пути/);
  assert.match(block, /30 ч назад/);
  assert.match(block, /README\.md/);
  assert.match(block, /forgotten\.md/);
  assert.match(block, /не откатывать/, 'WARN без подсказки не говорит, что делать');
  assert.doesNotMatch(wipLine(out), /\[FAIL/, 'забытый WIP — повод сказать, не стопнуть сессию');
  assert.notEqual(code, null);
});

test('3. грязный корень, правка свежая — без WARN, но не молчит', () => {
  const { work } = makeRepo();
  put(path.join(work, 'README.md'), 0, 'live\n');

  const line = wipLine(runPreflight(work).out);
  assert.match(line, /\[OK/, `свежая правка — возможно живая сессия\n${line}`);
  assert.match(line, /правится сейчас/);
});

test('3b. старый путь рядом со свежим — судит свежий', () => {
  const { work } = makeRepo();
  put(path.join(work, 'old.md'), 100);
  put(path.join(work, 'fresh.md'), 0);

  assert.match(wipLine(runPreflight(work).out), /\[OK/);
});

test('4. запуск из ЛИНКОВАННОГО worktree видит корень — это и была дыра', () => {
  const repo = makeRepo();
  const linked = addLinked(repo);
  put(path.join(repo.work, 'forgotten.md'), 30);

  const { out } = runPreflight(linked);
  assert.match(wipBlock(out), /\[WARN/, `из linked корень был невидим\n${out}`);
  assert.match(wipBlock(out), /forgotten\.md/);
});

test('4b. WIP в самом линкованном worktree не считается — он там норма', () => {
  const repo = makeRepo();
  const linked = addLinked(repo);
  put(path.join(linked, 'my-card.md'), 30);

  assert.match(wipLine(runPreflight(linked).out), /\[OK/, 'своя работа в своём worktree — не мина');
});

test('5. untracked в новом каталоге считается по файлу, а не схлопывается в каталог', () => {
  const { work } = makeRepo();
  put(path.join(work, 'docs', 'specs', 'a.md'), 30);
  put(path.join(work, 'docs', 'specs', 'b.md'), 30);

  const block = wipBlock(runPreflight(work).out);
  assert.match(block, /\b2 пути/, `docs/specs/ без -uall считался бы одной записью\n${block}`);
  assert.match(block, /docs\/specs\/a\.md/);
  assert.match(block, /docs\/specs\/b\.md/);
});

test('6. чистый корень не краснеет при core.autocrlf=true (CRLF-копии на Windows)', () => {
  const { work } = makeRepo({ autocrlf: true });
  const readme = path.join(work, 'README.md');
  assert.match(
    readFileSync(readme, 'utf8'),
    /\r\n/,
    'предусловие: в корне CRLF при LF в репозитории — иначе случай ничего не проверяет'
  );
  // Состаренный mtime ломает stat-кеш индекса: git пересчитывает содержимое — именно тут
  // и рождается фантомная «правка», если читать файлы мимо git.
  age(readme, 30);

  const { out } = runPreflight(work);
  assert.match(wipLine(out), /\[OK/, `фантомные CRLF-правки не есть WIP\n${out}`);
  assert.match(wipLine(out), /чист/);
});

test('7. одни удаления — возраст по индексу корня', () => {
  const { work } = makeRepo();
  unlinkSync(path.join(work, 'README.md'));
  const index = path.join(work, '.git', 'index');

  age(index, 30);
  assert.match(wipBlock(runPreflight(work).out), /\[WARN/);

  age(index, 1);
  assert.match(wipLine(runPreflight(work).out), /\[OK/);
});

test('8. проверка только читает: индекс корня не переписан, lock не оставлен', () => {
  const { work } = makeRepo();
  // Состаренный tracked-файл = stat-грязная запись. Обычный `git status` в такой
  // ситуации молча перезапишет индекс — под ногами у чужой сессии в корне.
  put(path.join(work, 'README.md'), 30, 'dirty\n');
  const index = path.join(work, '.git', 'index');
  const before = statSync(index).mtimeMs;

  runPreflight(work);

  assert.equal(statSync(index).mtimeMs, before, 'проверка переписала индекс корня');
  assert.throws(() => statSync(path.join(work, '.git', 'index.lock')), 'остался index.lock');
});
