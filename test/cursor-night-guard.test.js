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
  'git push origin refs/stash',
  'git push origin $(git stash list)',
  'git -c x.y=stash push',
  'git --config-env=user.name=stash push',
  'git --attr-source HEAD push',
  'git --super-prefix x push',
  'git "push"',
  'git "-C" . push',
  'git -c alias.x=push x',
  'git -c alias.p="push --force" p',
  'git -c "x=y stash" push',
  'git stash push -m wip $(git push origin HEAD)',
  '"C:/Program Files/Git/bin/git.exe" push',
  "node -e \"require('child_process').execSync('git push')\"",
  'node -pe "1+1"',
  'node -ep "1+1"',
  'node -epi "1+1"',
  'node "-e" "1+1"',
  'node "--eval=1+1"',
  'git http-push origin main',
  'git ${PUSH:-push}',
  'git $VERB origin main',
  'FOO=push git --config-env=alias.x=FOO x',
  'GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=push git x',
  'git -c alias.x=$FOO x',
  'git {push,fetch} origin main',
  'git pu{sh,ll} origin',
  'FOO=bar git {push,status}',
  "env FOO=push git -c alias.x='!git $FOO' x",
  'env FOO=push /usr/bin/git x',
  "git -c alias.x='!git $FOO' x",
  'GIT_DIR=/tmp/other npx git status',
  '{git,echo} pu{sh,ll} origin',
  '{git,ls} push',
];

const ALLOWED = [
  'git commit -m "feat(train): x"',
  'git commit -m "feat(push): день толчка"',
  'git commit -m "fix(workout): не терять push-день при смене плана"',
  'git stash push -m wip',
  'git commit --amend --no-edit',
  'git log -n 5 --oneline',
  'node --test test/cursor-night-guard.test.js',
  'node scripts/smoke-prod.mjs --wait 180',
  'node --experimental-vm-modules --test',
  'git -C ../athlete-pro-agent-9 stash push -m wip',
  'git stash list',
  'git commit -m "git push сделает LEAD утром, после приёмки"',
  'git stash push -m "wip push day"',
  'git checkout -b cursor/card-x origin/main',
  'npm run build:sw',
  'npm test',
  'npx prettier --write js/app.js',
  'npx prettier --write $(git diff --name-only)',
  'CI=1 npx prettier --write $(git diff --name-only)',
  'NODE_ENV=test npm test',
  'git commit -m "$(date) wip"',
  'git commit -m "node -e не звать"',
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
