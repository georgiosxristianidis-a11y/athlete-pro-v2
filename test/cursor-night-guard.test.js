/**
 * Гард AGENT-9: хук ночного прогона обязан отказывать, а не просто существовать.
 *
 * Факт, ради которого заведён: правило, записанное в конфиг, гардом не является
 * (разбор `eslint-plugin-security`: severity warning + якорь на начало значения —
 * 43 нарушения, ловит 18, красит 0). `.cursor/cli.json` разрешает `Shell(git)`
 * целиком, потому что без него исполнитель не заведёт ветку и не закоммитит;
 * единственное, что отделяет ночь без человека от пуша в публичный репозиторий, —
 * разбор строки в `.cursor/deny-push.mjs`. Значит проверяется поведение хука на
 * входе, а не наличие файла.
 *
 * Негативная половина здесь обязательна: гард, который запрещает всё, ночь не
 * переживёт — `git commit` и `npm run build:sw` должны проходить. Отдельно закреплено,
 * что текст в кавычках — данные, а не команда: `push` здесь тип тренировки, и коммит
 * `feat(push): …` обязан проходить, иначе ночь встанет на первом же дне толчка.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(REPO_ROOT, '.cursor', 'deny-push.mjs');

/** Прогоняет строку через хук ровно так, как это делает Cursor: JSON на stdin. */
function ask(input) {
  const out = execFileSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  return JSON.parse(out);
}

const DENIED = [
  'git push -u origin HEAD',
  'npm test && git push',
  'git -C /tmp/other push --force',
  'gh pr create --fill',
  'npm run lint --no-verify',
  'git reset --hard HEAD~1',
  'git clean -fd',
  'git worktree remove ../wt',
  'git branch -D feature',
  'git checkout main',
  'git send-pack origin main',
  'git commit -an -m "wip"',
  'git commit -n -m "wip"',
  'git push origin HEAD && git stash push -m wip',
  'node -e "require(\'child_process\').execSync(\'git push\')"',
];

const ALLOWED = [
  'git commit -m "feat(train): x"',
  'git commit -m "feat(push): день толчка"',
  'git commit -m "fix(workout): не терять push-день при смене плана"',
  'git stash push -m wip',
  'git commit --amend --no-edit',
  'git log -n 5 --oneline',
  'git checkout -b cursor/card-x origin/main',
  'npm run build:sw',
  'npm test',
  'npx prettier --write js/app.js',
];

for (const command of DENIED) {
  test(`ночной хук запрещает: ${command}`, () => {
    const verdict = ask(JSON.stringify({ command }));
    assert.equal(verdict.permission, 'deny');
    assert.ok(verdict.userMessage?.length > 0, 'отказ обязан объяснять причину');
  });
}

for (const command of ALLOWED) {
  test(`ночной хук пропускает: ${command}`, () => {
    assert.equal(ask(JSON.stringify({ command })).permission, 'allow');
  });
}

test('нечитаемый вход закрывает, а не открывает', () => {
  assert.equal(ask('').permission, 'deny');
  assert.equal(ask('not json').permission, 'deny');
  assert.equal(ask(JSON.stringify({})).permission, 'deny');
});

test('hooks.json закрывается на падении хука, а не открывается', () => {
  const hooks = JSON.parse(readFileSync(path.join(REPO_ROOT, '.cursor', 'hooks.json'), 'utf8'));
  const [hook] = hooks.hooks.beforeShellExecution;
  assert.equal(hook.command, 'node .cursor/deny-push.mjs');
  assert.equal(hook.failClosed, true, 'дефолт Cursor — fail-open: краш хука пропустит команду');
});

test('cli.json запрещает запись в генерируемое и в собственный конфиг', () => {
  const cli = JSON.parse(readFileSync(path.join(REPO_ROOT, '.cursor', 'cli.json'), 'utf8'));
  for (const rule of ['Write(sw.js)', 'Write(.cursor/**)', 'Read(.env*)', 'Shell(gh)']) {
    assert.ok(cli.permissions.deny.includes(rule), `в deny должен быть ${rule}`);
  }
});
