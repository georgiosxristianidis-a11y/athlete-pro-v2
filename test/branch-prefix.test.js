/**
 * Гейт для гарда префикса ветки (карточка AGENT-8).
 *
 * Мина карточки: Cursor работал в `claude/launch-5-dashboard-i18n` и
 * `claude/launch-3a-legal-docs`. Имя ветки читают `npm run inventory`, гард
 * дрейфа и человек в списке PR — и всем троим оно врало, пока единственный
 * честный источник (трейлер `Co-Authored-By:`) лежал внутри коммитов.
 *
 * Два слоя, как у гарда дрейфа:
 *   - ЛОГИКА (`verdict`, `executorOf`) — чистые функции, без git и без сети;
 *   - ПРОВОДКА (`run` на синтетическом репозитории) — что гард действительно
 *     читает коммиты ветки, а не рассуждает о строке.
 *
 * Кейсы на ПРОХОД здесь не менее важны, чем на отказ: гард, запрещающий всё,
 * первым же ложным блоком приучает тянуться к обходу — и тогда он не защищает
 * ничего (урок `.cursor/deny-push.mjs`, AGENT-9).
 *
 * Красный baseline воспроизводится так:
 *   git stash && node --test test/branch-prefix.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  branchesToCheck,
  executorOf,
  formatFailure,
  isExempt,
  run,
  shortBranch,
  verdict,
} from '../scripts/check-branch-prefix.mjs';
import { sandboxGit, sandboxGitIn } from './git-sandbox.js';

const CURSOR = 'fix(train): x\n\nCo-Authored-By: Cursor <noreply@cursor.com>';
const CLAUDE = 'docs(handoff): y\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>';
const PLAIN = 'chore: bump deps';

// --- Слой 1: логика ---------------------------------------------------------

test('исполнитель — первый известный трейлер, коммиты LEAD поверх не меняют владельца', () => {
  assert.equal(executorOf([CURSOR, CLAUDE, CLAUDE]), 'cursor');
  assert.equal(executorOf([CLAUDE, CURSOR]), 'claude');
});

test('трейлер до первого известного может быть чужим или отсутствовать', () => {
  assert.equal(executorOf([PLAIN, PLAIN, CURSOR]), 'cursor');
  assert.equal(executorOf([PLAIN, PLAIN]), null);
  assert.equal(executorOf([]), null);
});

test('имя трейлера матчится по началу, адрес косметика', () => {
  assert.equal(executorOf(['x\n\nCo-Authored-By: Cursor Agent <a@b.c>']), 'cursor');
  assert.equal(executorOf(['x\n\nCo-Authored-By: claude <whoever@example.com>']), 'claude');
});

test('совпадение имени и трейлера — проход', () => {
  assert.equal(verdict('cursor/agent-8-prefix', 'cursor').ok, true);
  assert.equal(verdict('claude/agent-8-prefix', 'claude').ok, true);
  assert.equal(verdict('refs/heads/cursor/x', 'cursor').ok, true);
});

test('чужой префикс — блок с именем обоих инструментов', () => {
  const v = verdict('claude/launch-5-dashboard-i18n', 'cursor');
  assert.equal(v.ok, false);
  assert.equal(v.code, 'wrong-tool');
  assert.equal(v.expected, 'cursor/');
  assert.equal(v.actual, 'claude/');
});

test('префикса нет вовсе — тоже блок', () => {
  const v = verdict('launch-5-dashboard-i18n', 'cursor');
  assert.equal(v.ok, false);
  assert.equal(v.code, 'no-prefix');
});

test('ветка без известного трейлера не блокируется — это графа unsigned, не этот гард', () => {
  assert.equal(verdict('dependabot/npm_and_yarn/vite-7.1.9', null).ok, true);
  assert.equal(verdict('какая-угодно-ветка', null).code, 'unsigned');
});

test('main и HEAD гард не касается', () => {
  assert.equal(isExempt('main'), true);
  assert.equal(isExempt('HEAD'), true);
  assert.equal(isExempt('cursor/x'), false);
  assert.equal(verdict('main', 'cursor').ok, true);
});

test('короткое имя добывается из полного ref', () => {
  assert.equal(shortBranch('refs/heads/cursor/a-b'), 'cursor/a-b');
  assert.equal(shortBranch('cursor/a-b'), 'cursor/a-b');
});

test('сообщение отказа несёт и переименование, и обход', () => {
  const text = formatFailure('launch-5', verdict('launch-5', 'cursor')).join('\n');
  assert.match(text, /git branch -m cursor\//);
  assert.match(text, /PREFIX_OK=1/);
});

test('источник имени: аргумент → GITHUB_HEAD_REF → текущая ветка', () => {
  assert.deepEqual(branchesToCheck(['cursor/a'], { GITHUB_HEAD_REF: 'claude/b' }), ['cursor/a']);
  assert.deepEqual(branchesToCheck([], { GITHUB_HEAD_REF: 'refs/heads/claude/b' }), ['claude/b']);
  assert.deepEqual(branchesToCheck(['--json'], { GITHUB_HEAD_REF: 'claude/b' }), ['claude/b']);
});

// --- Слой 2: проводка на синтетическом репозитории ---------------------------

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'branch-prefix-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/** bare origin с `main` + клон, где можно отрастить ветку с нужными трейлерами. */
function makeRepo() {
  const root = path.join(sandbox, `case-${++seq}`);
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  mkdirSync(root);

  sandboxGit(['init', '--bare', '-b', 'main', '-q', origin]);
  sandboxGit(['clone', '-q', origin, work]);
  const g = sandboxGitIn(work);
  g('config', 'user.email', 'agent@example.com');
  g('config', 'user.name', 'Agent');

  writeFileSync(path.join(work, 'README.md'), 'base\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('push', '-q', 'origin', 'main');
  return { work, g };
}

/** Ветка с заданными телами коммитов поверх origin/main. */
function branchWith(g, work, name, bodies) {
  g('checkout', '-q', '-b', name, 'origin/main');
  const slug = name.replace(/\W/g, '_');
  bodies.forEach((body, i) => {
    writeFileSync(path.join(work, `${slug}-${i}.js`), `export const n = ${i};\n`);
    g('add', '-A');
    g('commit', '-qm', body);
  });
}

/** Прогон гарда в песочнице; возвращает код и весь вывод одной строкой. */
function runIn(work, { argv = [], env = {} } = {}) {
  const lines = [];
  const sink = { log: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) };
  const code = run({ argv, env, out: sink, cwd: work });
  return { code, text: lines.join('\n') };
}

test('проводка: ветка Cursor под именем claude/* — отказ', () => {
  const { work, g } = makeRepo();
  branchWith(g, work, 'claude/launch-5-dashboard-i18n', [CURSOR, CURSOR]);

  const { code, text } = runIn(work, { argv: ['claude/launch-5-dashboard-i18n'] });
  assert.equal(code, 1, 'baseline AGENT-8: гарда не было, такая ветка уезжала молча');
  assert.match(text, /Prefix Block/);
});

test('проводка: та же работа под своим именем — проход', () => {
  const { work, g } = makeRepo();
  branchWith(g, work, 'cursor/launch-5-dashboard-i18n', [CURSOR, CURSOR]);

  assert.equal(runIn(work, { argv: ['cursor/launch-5-dashboard-i18n'] }).code, 0);
});

test('проводка: LEAD добил ветку Cursor — владелец не меняется, имя остаётся cursor/*', () => {
  const { work, g } = makeRepo();
  branchWith(g, work, 'cursor/launch-9-f11', [CURSOR, CLAUDE, CLAUDE]);

  assert.equal(runIn(work, { argv: ['cursor/launch-9-f11'] }).code, 0);
});

test('проводка: коммиты, уже влитые в main, владельца ветке не назначают', () => {
  const { work, g } = makeRepo();
  // Cursor-коммит уезжает в main, затем LEAD отращивает свою ветку от свежей базы.
  branchWith(g, work, 'cursor/earlier', [CURSOR]);
  g('push', '-q', 'origin', 'HEAD:main');
  g('fetch', '-q', 'origin');
  branchWith(g, work, 'claude/later', [CLAUDE]);

  assert.equal(
    runIn(work, { argv: ['claude/later'] }).code,
    0,
    'считать коммиты от origin/main, а не от корня истории'
  );
});

test('проводка: имени ветки нет — гард молчит, а не падает', () => {
  const { work, g } = makeRepo();
  g('checkout', '-q', '--detach');

  const { code, text } = runIn(work, { argv: [], env: {} });
  assert.equal(code, 0);
  assert.ok(text.length > 0, 'молчание должно быть объяснённым');
});

test('проводка: PREFIX_OK=1 — осознанный обход, но вслух', () => {
  const { work, g } = makeRepo();
  branchWith(g, work, 'launch-5', [CURSOR]);

  const { code, text } = runIn(work, { argv: ['launch-5'], env: { PREFIX_OK: '1' } });
  assert.equal(code, 0);
  assert.match(text, /PREFIX_OK=1/);
});

test('проводка: имя берётся из GITHUB_HEAD_REF, когда HEAD detached (случай CI)', () => {
  const { work, g } = makeRepo();
  branchWith(g, work, 'claude/wrong-owner', [CURSOR]);
  g('checkout', '-q', '--detach');

  const { code } = runIn(work, { env: { GITHUB_HEAD_REF: 'claude/wrong-owner' } });
  assert.equal(code, 1);
});
