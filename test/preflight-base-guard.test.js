/**
 * Гейт для гарда отвергнутых линий (карточки BASE-1 и её ревизия грилежом).
 *
 * Мина. Ворктри агента трижды подряд приезжал нарезанным от `elite-hud-wow` —
 * линии, по которой 2026-08-11 вынесен вердикт «не вливать» (утечка BYOK-ключа
 * в неаутентифицированный эндпоинт, синк мимо `airgap`, ослабленный `air-guard`).
 * Каждый раз это ловил агент, который посмотрел сам; `preflight` молчал, а
 * единственное предупреждение жило строкой в очереди HUD в `NEXT_SESSION.md` —
 * то есть правилом-в-чекауте, которое дрейфует вместе с чекаутом.
 *
 * Почему тест, а не «проверено руками»: сам гард — тоже правило в чекауте, и
 * умереть он может ровно так же молча, как умирали хуки.
 *
 * Двухслойность теста — следствие SHA-якоря. Настоящий `8e23fd6` в синтетический
 * репозиторий не подложить, поэтому:
 *   - ЛОГИКА проверяется на `scanBase` с подставным списком линий: полный набор
 *     кейсов, без сети и без истории проекта — то есть везде, включая CI;
 *   - ПРОВОДКА (что `preflight` реально зовёт модуль) — процессом: чистая база
 *     обязана давать строку отчёта, а база с настоящей линией — FAIL. Второе
 *     требует живого объекта `8e23fd6` в хранилище и честно пропускается там,
 *     где история выкачена неполной.
 *
 * Красный baseline воспроизводится без ребейза назад:
 *   git stash && node --test test/preflight-base-guard.test.js
 *
 * Прогон идёт в синтетическом репозитории во временной папке (bare origin +
 * клон), поэтому ни сети, ни настоящего GitHub не нужно — `origin` не github.com,
 * и сетевые проверки preflight сами уходят в WARN. Остальные FAIL того прогона
 * (node_modules во временной папке нет) к делу не относятся, поэтому судим по
 * строке отчёта, а не по коду выхода.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REJECTED_LINES, scanBase } from '../scripts/rejected-lines.mjs';
import { sandboxGit, sandboxGitIn } from './git-sandbox.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFLIGHT = path.join(REPO_ROOT, 'scripts', 'preflight.mjs');

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'base-guard-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/**
 * Синтетический репозиторий: bare origin с веткой `main` + клон, где в стороне
 * от main лежит коммит «отвергнутой линии».
 */
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
  g('config', 'core.hooksPath', '.githooks');
  mkdirSync(path.join(work, '.githooks'));

  writeFileSync(path.join(work, 'README.md'), 'base\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('push', '-q', 'origin', 'main');

  // Линия-донор: коммит в стороне от main.
  g('checkout', '-q', '-b', 'donor');
  writeFileSync(path.join(work, 'leak.js'), 'const key = process.env.ANTHROPIC_API_KEY;\n');
  g('add', '-A');
  g('commit', '-qm', 'donor line');
  const donorSha = g('rev-parse', 'HEAD');
  g('checkout', '-q', 'main');

  /** Список в форме, которую ждёт scanBase — с настоящим SHA этого репозитория. */
  const lines = [{ sha: donorSha, name: 'synthetic-donor', why: 'тестовая линия' }];
  return { work, g, donorSha, lines };
}

// --- Слой 1: логика модуля (идёт везде, история проекта не нужна) ------------

test('линия в базе — найдена', () => {
  const { work, g, lines } = makeRepo();
  g('checkout', '-q', '-b', 'claude/card', lines[0].sha);

  const { hits } = scanBase({ cwd: work, lines });
  assert.equal(hits.length, 1, 'baseline BASE-1: здесь гард молчал');
  assert.equal(hits[0].name, 'synthetic-donor');
});

test('ветка от свежего origin/main — чисто', () => {
  const { work, g, lines } = makeRepo();
  g('checkout', '-q', '-b', 'claude/card', 'origin/main');

  assert.deepEqual(scanBase({ cwd: work, lines }).hits, []);
});

test('отставание от main без линии — не находка', () => {
  const { work, g, lines } = makeRepo();
  const oldBase = g('rev-parse', 'HEAD');
  writeFileSync(path.join(work, 'other.js'), 'export const ahead = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'main moves on');
  g('push', '-q', 'origin', 'main');
  g('checkout', '-q', '-b', 'claude/old-base', oldBase);

  assert.deepEqual(
    scanBase({ cwd: work, lines }).hits,
    [],
    'отставание — законный случай, за него отвечает отдельная проверка',
  );
});

test('линия влита в main — гард замолкает сам, без правки списка', () => {
  const { work, g, lines } = makeRepo();
  g('merge', '-q', '--no-ff', '-m', 'merge donor', lines[0].sha);
  g('push', '-q', 'origin', 'main');
  g('checkout', '-q', '-b', 'claude/next', 'origin/main');

  assert.deepEqual(scanBase({ cwd: work, lines }).hits, []);
});

test('объекта нет в хранилище — это ответ «чисто», а не падение', () => {
  const { work, g } = makeRepo();
  g('checkout', '-q', 'main');
  const absent = [{ sha: '0'.repeat(40), name: 'never-fetched', why: 'нет объекта' }];

  assert.deepEqual(scanBase({ cwd: work, lines: absent }).hits, []);
});

test('origin/main недоступен — линия всё равно найдена, но флаг сброшен', () => {
  const { work, g, lines } = makeRepo();
  g('checkout', '-q', '-b', 'claude/card', lines[0].sha);

  const res = scanBase({ cwd: work, lines, mainRef: 'origin/does-not-exist' });
  assert.equal(res.mainKnown, false);
  assert.equal(res.hits.length, 1, 'без main влитость не проверить, но линия под ногами — факт');
});

test('боевой список несёт полный 40-символьный SHA, а не имя метки', () => {
  assert.ok(REJECTED_LINES.length >= 1);
  for (const line of REJECTED_LINES) {
    assert.match(line.sha, /^[0-9a-f]{40}$/, 'якорь — SHA: имя ref можно удалить или не запушить');
    assert.ok(line.name && line.why, 'FAIL обязан называть линию и причину вердикта');
  }
});

// --- Слой 2: проводка preflight (процессом) ---------------------------------

/** @returns {{ code: number|null, out: string }} */
function runPreflight(cwd) {
  const res = spawnSync(process.execPath, [PREFLIGHT], { cwd, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

/** Строка отчёта про донорские линии — только она и судится. */
const donorLine = (out) => out.split('\n').find((l) => l.includes('донорские линии')) || '';

test('preflight зовёт модуль: на чистой базе строка отчёта есть', () => {
  const { work, g } = makeRepo();
  g('checkout', '-q', '-b', 'claude/card', 'origin/main');

  const line = donorLine(runPreflight(work).out);
  assert.match(line, /\[OK/, 'нет строки — значит проверку выкинули из отчёта');
});

/** Настоящая линия проекта: нужен живой объект, в неполном клоне его нет. */
const realSha = REJECTED_LINES[0].sha;
const objectMissing = spawnSync('git', ['cat-file', '-e', `${realSha}^{commit}`], { cwd: REPO_ROOT })
  .status;

test(
  'preflight на настоящей отвергнутой линии — FAIL с SHA и командой выхода',
  { skip: objectMissing ? `объекта ${realSha.slice(0, 7)} нет в этом клоне` : false },
  () => {
    const { work, g } = makeRepo();
    // Тянем настоящий коммит линии из репозитория проекта — синтезировать его
    // нельзя, а проверять проводку на подставном SHA бессмысленно. Забираем
    // рефы целиком, а не `fetch <sha>`: fetch по голому SHA сервер разрешает
    // только при uploadpack.allowAnySHA1InWant, и это молча разъехалось бы
    // между локальным прогоном и CI.
    g('fetch', '-q', REPO_ROOT, '+refs/*:refs/remotes/src/*');
    g('checkout', '-q', '-b', 'claude/hud-3', realSha);

    const { out } = runPreflight(work);
    const line = donorLine(out);
    assert.match(line, /\[FAIL/, `baseline BASE-1: здесь preflight молчал\n${out}`);
    assert.match(line, new RegExp(realSha.slice(0, 7)), 'в отчёте обязан стоять SHA линии');
    assert.match(out, /нарезать ворктри заново|rebase --onto/, 'FAIL без действия — половина гарда');
  },
);
