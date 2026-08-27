/**
 * Гейт на разрешение конфликта по сгенерированному sw.js (карточка AGENT-5).
 *
 * Мина. `sw.js` пишет `npm run build:sw`, а `CACHE_NAME` внутри — дайджест от
 * содержимого репозитория. Значит любые две ветки, тронувшие `js/` или `css/`,
 * расходятся по нему всегда, и обе стороны машинные. `PR #255` (LAUNCH-5A)
 * вставал конфликтом на каждом из четырёх своих коммитов подряд.
 *
 * Почему это нельзя было оставить на человека: выбранная руками сторона стирает
 * чужой прекеш — так из влитого PR уже терялся `/_vercel/*`. Правильный ход
 * ровно один: взять версию базы, довести ребейз, затем пересобрать — дайджест
 * посчитается от финального дерева.
 *
 * Механика: `.gitattributes` объявляет `sw.js merge=ours`, а сам драйвер `ours`
 * git не знает по имени — его заводит postinstall (`scripts/fix-hooks-path.mjs`),
 * потому что конфиг в репозиторий не коммитится. При rebase «ours» — это
 * upstream, то есть `main`: драйвер делает первый шаг, пересборка — второй.
 *
 * Тест поведенческий: синтетический репозиторий, две ветки правят `sw.js`,
 * rebase обязан пройти без конфликта. Baseline — тот же сценарий без правила:
 * если он тоже зелёный, значит проверка меряет не механику, а погоду.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTINSTALL = path.join(REPO_ROOT, 'scripts', 'fix-hooks-path.mjs');

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'sw-merge-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/** @param {string} cwd */
const git =
  (cwd) =>
  (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Репозиторий с двумя расходящимися правками `sw.js`: `main` ушёл на свою
 * версию, ветка — на свою. Ровно картина ребейза перед мёржем.
 * @param {{ attributes: boolean, driver: boolean }} opts
 */
function makeDivergence({ attributes, driver }) {
  const work = path.join(sandbox, `case-${++seq}`);
  mkdirSync(work);
  execFileSync('git', ['init', '-q', '-b', 'main', work]);
  const g = git(work);
  g('config', 'user.email', 'agent@example.com');
  g('config', 'user.name', 'Agent');

  writeFileSync(path.join(work, 'sw.js'), "const CACHE_NAME = 'ap-base';\n");
  if (attributes) {
    // Тот же файл, что в репозитории: тест судит боевое правило, а не свою копию.
    writeFileSync(
      path.join(work, '.gitattributes'),
      readFileSync(path.join(REPO_ROOT, '.gitattributes'))
    );
  }
  g('add', '-A');
  g('commit', '-qm', 'base');

  if (driver) {
    // Драйвер заводит postinstall — зовём его же, а не пишем конфиг руками:
    // иначе тест зеленел бы там, где боевой скрипт эту строку потерял.
    const res = spawnSync(process.execPath, [POSTINSTALL], { cwd: work, encoding: 'utf8' });
    assert.equal(res.status, 0, `postinstall упал:\n${res.stderr}`);
  }

  g('checkout', '-q', '-b', 'claude/card');
  writeFileSync(path.join(work, 'sw.js'), "const CACHE_NAME = 'ap-branch';\n");
  g('commit', '-qam', 'branch rebuilds sw');

  g('checkout', '-q', 'main');
  writeFileSync(path.join(work, 'sw.js'), "const CACHE_NAME = 'ap-main';\n");
  g('commit', '-qam', 'main rebuilds sw');

  g('checkout', '-q', 'claude/card');
  return { work, g };
}

/** @returns {{ ok: boolean, sw: string }} */
function rebaseOnMain(work) {
  const res = spawnSync('git', ['rebase', 'main'], { cwd: work, encoding: 'utf8' });
  const sw = readFileSync(path.join(work, 'sw.js'), 'utf8');
  if (res.status !== 0) spawnSync('git', ['rebase', '--abort'], { cwd: work });
  return { ok: res.status === 0, sw };
}

test('postinstall заводит драйвер, на который ссылается .gitattributes', () => {
  const { g } = makeDivergence({ attributes: true, driver: true });

  assert.equal(
    g('config', '--get', 'merge.ours.driver'),
    'true',
    'без объявленного драйвера правило merge=ours в .gitattributes — мёртвая строка'
  );
});

test('ребейз поверх main не конфликтует по sw.js и берёт версию базы', () => {
  const { work } = makeDivergence({ attributes: true, driver: true });

  const { ok, sw } = rebaseOnMain(work);
  assert.ok(ok, 'ребейз обязан пройти сам: конфликт по машинному файлу разрешать нечем');
  assert.match(sw, /ap-main/, 'при rebase «ours» — это upstream; свою сторону добьёт build:sw');
});

test('baseline: без правила тот же ребейз встаёт конфликтом', () => {
  const { work } = makeDivergence({ attributes: false, driver: false });

  assert.equal(
    rebaseOnMain(work).ok,
    false,
    'если и без .gitattributes чисто — тест меряет не механику, а совпадение'
  );
});

test('.gitattributes называет sw.js генерируемым и шлёт за пересборкой', () => {
  const text = readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8');

  assert.match(text, /^sw\.js merge=ours$/m, 'правило снято — конфликт вернётся молча');
  assert.match(
    text,
    /build:sw/,
    'драйвер делает половину работы; без пересборки дайджест разойдётся с деревом'
  );
});
