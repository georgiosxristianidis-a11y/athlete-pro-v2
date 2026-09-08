/**
 * Гард проверки гейта наряда до выдачи (карточка AGENT-7).
 *
 * Мина. В наряде LAUNCH-5A стоял `prettier --check .` — красный на чистой базе
 * по 226 файлам. Исполнитель получил красный гейт, «починил» prettier по своим
 * файлам, сломал парсер теста паритета — каскад закрыл коммит-фикс `98e281a`.
 * Правило в скилл дописали 26.08; механики не было.
 *
 * Тест без сети и без полного `npm test`: разбор поля, известные мины и прогон
 * на синтетических командах через инъекцию `spawn`. Живой `git rev-parse`
 * нужен только кейсу с якорем SHA — он локальный.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  splitGateChain,
  parseGateField,
  classifyCommand,
  checkGate,
  run,
} from '../scripts/check-brief-gate.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(REPO_ROOT, '.claude', 'skills', 'agent-brief', 'SKILL.md');

test('splitGateChain — && режет, кавычки держат', () => {
  assert.deepEqual(splitGateChain('a && b && c'), ['a', 'b', 'c']);
  assert.deepEqual(splitGateChain('npm test -- "x && y" && lint'), [
    'npm test -- "x && y"',
    'lint',
  ]);
});

test('parseGateField — цепочка и якорь SHA', () => {
  assert.equal(parseGateField('нет поля'), null);
  assert.equal(parseGateField('ГЕЙТ: <цепочка>'), null);

  const plain = parseGateField('ГЕЙТ: npm run lint && npm test');
  assert.deepEqual(plain, { chain: 'npm run lint && npm test', verifiedSha: null });

  const anchored = parseGateField(
    'ГЕЙТ: npm run lint && npm test  # verified @ abcdef1 — прогон 08.09'
  );
  assert.equal(anchored.chain, 'npm run lint && npm test');
  assert.equal(anchored.verifiedSha, 'abcdef1');
});

test('classifyCommand — prettier --check . это известная мина LAUNCH-5A', () => {
  const hit = classifyCommand('npx prettier --check .');
  assert.equal(hit.known, true);
  assert.match(hit.why, /исторически/);

  assert.equal(classifyCommand('npx prettier --write css/base.css').known, false);
  assert.equal(classifyCommand('npm test').known, false);
});

test('checkGate — известная мина валит до запуска', () => {
  let spawned = 0;
  const report = checkGate('npx prettier --check . && npm test', {
    spawn: () => {
      spawned++;
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.code, 2);
  assert.equal(spawned, 0, 'известную мину не гоняем — она красна исторически');
  assert.match(report.errors.join('\n'), /prettier --check/);
});

test('checkGate — ненулевой код первой команды останавливает цепочку', () => {
  const seen = [];
  const report = checkGate('fail-me && never', {
    spawn: (cmd) => {
      seen.push(cmd);
      return { status: 7, stdout: 'out', stderr: 'boom' };
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.code, 1);
  assert.deepEqual(seen, ['fail-me']);
  assert.match(report.errors.join('\n'), /exit 7/);
});

test('checkGate — зелёная цепочка и резолв якоря', () => {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();

  const report = checkGate('ok-one && ok-two', {
    cwd: REPO_ROOT,
    sha: head,
    spawn: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.code, 0);
  assert.ok(report.sha);
  assert.ok(report.sha.startsWith(head.slice(0, 7)));
});

test('run — --from-text печатает шаблон verified @', () => {
  const lines = [];
  const errs = [];
  let code = null;
  run({
    argv: ['--from-text', 'ГЕЙТ: node -e "process.exit(0)"'],
    cwd: REPO_ROOT,
    spawn: () => ({ status: 0, stdout: '', stderr: '' }),
    stdout: { log: (...a) => lines.push(a.join(' ')) },
    stderr: { error: (...a) => errs.push(a.join(' ')) },
    exit: (c) => {
      code = c;
    },
  });
  assert.equal(code, 0);
  assert.equal(errs.length, 0);
  assert.match(lines.join('\n'), /verified @/);
});

test('скилл agent-brief требует якорь verified @ и brief:gate', () => {
  const text = readFileSync(SKILL, 'utf8');
  assert.match(
    text,
    /ГЕЙТ:.*# verified @ <sha>/,
    'шаблон без якоря снова учит выдавать непроверенный гейт'
  );
  assert.match(text, /npm run brief:gate/, 'механика должна быть названа, не только обещана');
  assert.match(
    text,
    /prettier --check \.[\s\S]*отвергает|brief:gate[\s\S]*prettier --check/,
    'мина LAUNCH-5A остаётся в тексте скилла рядом с командой проверки'
  );
});
