/**
 * Гейт для хук-гарда сессии (FLOW-1/2/3) — сдвиг проверки дрейфа влево,
 * с pre-push на момент правки файла.
 *
 * ЧТО ЗДЕСЬ ВОСПРОИЗВОДИТСЯ. Первый тест — не проверка кода, а baseline PP-6:
 * ветка от старого main, файл переписан в main, агент правит его же. До FLOW-2
 * этот сценарий доезжал до pre-push, то есть до момента, когда работа уже
 * сделана по июньскому файлу. Тест обязан ловить его на входе в Edit.
 *
 * ЧТО СТОРОЖИТСЯ, КРОМЕ САМОГО ВЕРДИКТА:
 *
 * 1. Молчание отличается от «чисто». `fileDrift` возвращает `skip` с причиной,
 *    а не голое `false`: PP-6 прошёл именно потому, что гард не сказал «нет» —
 *    он не сказал ничего. Причина пропуска обязана быть названа.
 * 2. Ноль ложных срабатываний. Файл, которого main не трогал, и новый файл не
 *    должны спрашивать ни о чём: гард, который дёргает на каждой правке,
 *    отключают целиком, и вместе с ним настоящий случай.
 * 3. Вердикт — `deny` с готовой командой снятия. `escalate`/`ask` под
 *    defaultMode auto молча пропускали правку (замер 25.09, FLOW-3): до человека
 *    диалог не доходил. Агент останавливается, спрашивает в чате и только после
 *    явного «да» снимает блок командой `ack`. Выполнить её может и сам агент —
 *    граница доверия сдвинута на него осознанно (решение Gio 25.09); env-обхода нет.
 * 4. Правки вне рабочего дерева не трогаются вообще — хук стоит глобально.
 * 5. Репо определяется по файлу, а не по cwd сессии: сессия из корня правит
 *    файлы ворктри по абсолютному пути, и cwd указывал бы не на тот репозиторий.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fileDrift } from '../scripts/drift-core.mjs';
import { relevantLines } from '../scripts/session-guard.mjs';
import { sandboxGit, sandboxGitIn } from './git-sandbox.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(REPO_ROOT, 'scripts', 'session-guard.mjs');

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'session-guard-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/**
 * Сцена PP-6 в миниатюре: ветка отросла от старого main, за это время main
 * переписал js/profile.js. Возвращает рабочее дерево, стоящее на этой ветке.
 */
function repoWithDrift() {
  const root = path.join(sandbox, `case-${++seq}`);
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  mkdirSync(root);

  sandboxGit(['init', '--bare', '-b', 'main', '-q', origin]);
  sandboxGit(['clone', '-q', origin, work]);
  const g = sandboxGitIn(work);
  g('config', 'user.email', 'agent@example.com');
  g('config', 'user.name', 'Agent');

  mkdirSync(path.join(work, 'js'));
  writeFileSync(path.join(work, 'js', 'profile.js'), 'export const v = 1;\n');
  writeFileSync(path.join(work, 'js', 'untouched.js'), 'export const u = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('push', '-q', 'origin', 'main');

  // Ветка агента отрастает здесь — это и есть «база от 28 июня».
  g('branch', 'claude/old-base');

  // main уезжает вперёд и переписывает ровно тот файл, который агент будет править.
  writeFileSync(path.join(work, 'js', 'profile.js'), 'export const v = 2; // TYPE-1\n');
  g('commit', '-aqm', 'refactor(profile): токены типографики');
  g('push', '-q', 'origin', 'main');

  g('checkout', '-q', 'claude/old-base');
  g('fetch', '-q', 'origin', 'main');
  return work;
}

function runGuard(cwd, payload) {
  const res = spawnSync(process.execPath, [GUARD], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  let json;
  try {
    json = res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    json = null;
  }
  return { code: res.status, out: res.stdout || '', err: res.stderr || '', json };
}

const preToolUse = (file) => ({
  hook_event_name: 'PreToolUse',
  session_id: 'test-session',
  tool_name: 'Edit',
  tool_input: { file_path: file },
});

// --- baseline PP-6 -----------------------------------------------------------

test('PP-6: файл переписан в main с базы ветки — дрейф найден', () => {
  const work = repoWithDrift();
  const verdict = fileDrift(path.join(work, 'js', 'profile.js'), { cwd: work });

  assert.equal(
    verdict.drift,
    true,
    'baseline: до FLOW-2 этот случай доезжал до pre-push, то есть до готового кода',
  );
  assert.equal(verdict.file, 'js/profile.js', 'вердикт обязан называть файл');
  assert.equal(verdict.behind, 1);
  assert.equal(verdict.commits.length, 1, 'и коммит main, который его переписал');
  assert.match(verdict.commits[0], /refactor\(profile\)/, 'и называет его человеческим сабджектом');
});

test('PP-6: хук отдаёт deny — правка стоит, пока не спросили человека', () => {
  const work = repoWithDrift();
  const { code, json } = runGuard(work, preToolUse(path.join(work, 'js', 'profile.js')));

  assert.equal(code, 0, 'хук не блокирует выходом — вердикт передаётся JSON-ом');
  assert.equal(json?.hookSpecificOutput?.hookEventName, 'PreToolUse');
  assert.equal(
    json?.hookSpecificOutput?.permissionDecision,
    'deny',
    'escalate/ask под defaultMode auto молча пропускали правку (замер 25.09)',
  );
  const reason = json.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /js\/profile\.js/);
  assert.match(reason, /git rebase origin\/main/, 'отказ без лечения — это просто препятствие');
  assert.match(reason, /спросить человека/, 'агенту обязано быть сказано, что решает не он');
  assert.match(reason, / ack "test-session" "js\/profile\.js" /, 'и чем снять блок после «да»');
});

test('сессия из корня правит файл ворктри — репо судим по файлу, не по cwd', () => {
  const work = repoWithDrift();
  const outer = path.dirname(work);
  sandboxGit(['init', '-q', '-b', 'main', outer]);

  const { json } = runGuard(outer, { ...preToolUse(path.join(work, 'js', 'profile.js')), cwd: outer });
  assert.equal(
    json?.hookSpecificOutput?.permissionDecision,
    'deny',
    'до FLOW-3 здесь была тишина: репо искался по cwd сессии, а файл лежал в другом',
  );
});

// --- ноль ложных срабатываний ------------------------------------------------

test('файл, которого main не трогал, — молча пропускаем', () => {
  const work = repoWithDrift();
  const verdict = fileDrift(path.join(work, 'js', 'untouched.js'), { cwd: work });
  assert.equal(verdict.drift, false, 'отставание само по себе не повод (BASE-1)');

  const { code, out } = runGuard(work, preToolUse(path.join(work, 'js', 'untouched.js')));
  assert.equal(code, 0);
  assert.equal(out, '', 'чистый случай обязан быть бесшумным');
});

test('новый файл — дрейфовать нечему', () => {
  const work = repoWithDrift();
  const verdict = fileDrift(path.join(work, 'js', 'brand-new.js'), { cwd: work });
  assert.equal(verdict.drift, false);
});

test('сессия на main — проверять нечего, и причина названа', () => {
  const work = repoWithDrift();
  sandboxGitIn(work)('checkout', '-q', 'main');
  const verdict = fileDrift(path.join(work, 'js', 'profile.js'), { cwd: work });
  assert.equal(verdict.drift, false);
  assert.equal(verdict.skip, 'сессия на main', 'пропуск без причины неотличим от поломки');
});

test('файл вне рабочего дерева не трогаем — хук стоит глобально', () => {
  const work = repoWithDrift();
  const outside = path.join(os.tmpdir(), 'somewhere-else.js');
  const verdict = fileDrift(outside, { cwd: work });
  assert.equal(verdict.drift, false);
  assert.equal(verdict.skip, 'файл вне рабочего дерева');
});

// --- подтверждение держится до конца сессии ----------------------------------

test('команда из текста блока снимает его до конца сессии — и только для неё', () => {
  const work = repoWithDrift();
  const file = path.join(work, 'js', 'profile.js');

  const first = runGuard(work, preToolUse(file));
  assert.equal(first.json?.hookSpecificOutput?.permissionDecision, 'deny');

  // Состоявшаяся правка больше не выдаётся за одобрение человека: под auto
  // «правка прошла» не значило «человек разрешил».
  runGuard(work, { ...preToolUse(file), hook_event_name: 'PostToolUse' });
  assert.equal(runGuard(work, preToolUse(file)).json?.hookSpecificOutput?.permissionDecision, 'deny');

  const cmd = first.json.hookSpecificOutput.permissionDecisionReason.match(
    /node "([^"]+)" ack "([^"]+)" "([^"]+)" "([^"]+)"/,
  );
  assert.ok(cmd, 'в тексте блока обязана стоять готовая команда снятия');
  const res = spawnSync(process.execPath, [cmd[1], 'ack', cmd[2], cmd[3], cmd[4]], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const second = runGuard(work, preToolUse(file));
  assert.equal(second.out, '', 'гард, спрашивающий на каждой правке, превращается в cookie-баннер');

  const other = runGuard(work, { ...preToolUse(file), session_id: 'other-session' });
  assert.equal(other.json?.hookSpecificOutput?.permissionDecision, 'deny', '«да» одной сессии не распространяется на другую');
});

// --- FLOW-1: что именно едет в контекст --------------------------------------

test('в контекст едут только FAIL и WARN про базу ветки', () => {
  const stdout = [
    'Preflight — ветка claude/x',
    '',
    '[OK  ] git identity: Gio <a@b.c>',
    '[FAIL] node_modules: нет в этом рабочем дереве',
    '[WARN] база ветки: claude/x отстаёт от origin/main на 233 коммит(ов)',
    '[WARN] невлитые ветки: 71 шт. старше суток',
    '[WARN] бюджет доков: стартовая нагрузка ~8955 ток',
    '[OK  ] дефолт-ветка: GitHub default = main',
  ].join('\n');

  const lines = relevantLines(stdout);
  assert.equal(lines.length, 2, 'зелёное и фоновые WARN — отчёт по требованию, а не налог на старт');
  assert.match(lines[0], /node_modules/);
  assert.match(lines[1], /233 коммит/, 'единственный WARN, за которым стоит PP-6');
});

test('чистый preflight даёт пустой инжект — ноль токенов', () => {
  const stdout = ['[OK  ] hooksPath: указывает в свой чекаут', 'Preflight чист.'].join('\n');
  assert.deepEqual(relevantLines(stdout), []);
});
