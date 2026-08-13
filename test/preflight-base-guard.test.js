/**
 * Гейт для проверки 3b в `scripts/preflight.mjs` (карточка BASE-1).
 *
 * Мина. Ворктри агента трижды подряд приезжал нарезанным от `elite-hud-wow` —
 * линии, по которой 2026-08-11 вынесен вердикт «не вливать» (утечка BYOK-ключа
 * в неаутентифицированный эндпоинт, синк мимо `airgap`, ослабленный `air-guard`).
 * Каждый раз это ловил агент, который посмотрел сам; `preflight` молчал, а
 * единственное предупреждение жило строкой в очереди HUD в `NEXT_SESSION.md` —
 * то есть правилом-в-чекауте, которое дрейфует вместе с чекаутом.
 *
 * Почему тест, а не «проверено руками»: сам гард — тоже правило в чекауте, и
 * умереть он может ровно так же молча, как умирали хуки. Красный baseline
 * воспроизводится без ребейза назад:
 *
 *   git stash && node --test test/preflight-base-guard.test.js   # до правки — красный
 *
 * Как проверяется: preflight запускается в синтетическом репозитории во
 * временной папке (bare origin + клон), поэтому ни сети, ни настоящего GitHub
 * не нужно — `origin` не github.com, и сетевые проверки 6-7 сами уходят в WARN.
 * Остальные FAIL этого прогона (node_modules во временной папке нет) к делу не
 * относятся, поэтому судим по строке отчёта, а не по коду выхода.
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
const TAINT_TAG = 'checkpoint-elite-hud-wow';

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'preflight-base1-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

/** @param {string} cwd */
const git =
  (cwd) =>
  (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Синтетический репозиторий: bare origin с веткой `main` + клон с одним
 * коммитом «отвергнутой линии» в стороне, помеченным той же меткой, что и в
 * настоящем проекте.
 */
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
  // Хуки проекта во временном репозитории не нужны и не должны мешать.
  g('config', 'core.hooksPath', '.githooks');
  mkdirSync(path.join(work, '.githooks'));

  writeFileSync(path.join(work, 'README.md'), 'base\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('push', '-q', 'origin', 'main');

  // Линия-донор: коммит в стороне от main, помеченный меткой.
  g('checkout', '-q', '-b', 'donor');
  writeFileSync(path.join(work, 'leak.js'), 'const key = process.env.ANTHROPIC_API_KEY;\n');
  g('add', '-A');
  g('commit', '-qm', 'donor line');
  g('tag', TAINT_TAG);
  g('checkout', '-q', 'main');

  return { work, g };
}

/** @returns {{ code: number|null, out: string }} */
function runPreflight(cwd) {
  const res = spawnSync(process.execPath, [PREFLIGHT], { cwd, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

/** Строка отчёта про донорские линии — только она и судится. */
function donorLine(out) {
  return out.split('\n').find((l) => l.includes('донорские линии')) || '';
}

test('ворктри нарезан от отвергнутой линии — FAIL с именем метки', () => {
  const { work, g } = makeRepo();
  g('checkout', '-q', '-b', 'claude/hud-3', TAINT_TAG);

  const { out } = runPreflight(work);
  const line = donorLine(out);
  assert.match(line, /\[FAIL/, `baseline BASE-1: здесь preflight молчал\n${out}`);
  assert.match(line, new RegExp(TAINT_TAG), 'в отчёте обязано стоять имя линии, а не «база плохая»');
  assert.match(out, /нарезать ворктри заново|rebase --onto/, 'FAIL без действия — половина гарда');
});

test('ветка от свежего origin/main — гард молчит', () => {
  const { work, g } = makeRepo();
  g('checkout', '-q', '-b', 'claude/hud-3', 'origin/main');

  const line = donorLine(runPreflight(work).out);
  assert.match(line, /\[OK/, 'легальная ветка не должна краснеть');
});

test('отставание от main без метки — по-прежнему WARN, а не FAIL', () => {
  const { work, g } = makeRepo();
  // main уехал вперёд, ветка отросла от старой базы — законный случай.
  const oldBase = g('rev-parse', 'HEAD');
  writeFileSync(path.join(work, 'other.js'), 'export const ahead = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'main moves on');
  g('push', '-q', 'origin', 'main');

  g('checkout', '-q', '-b', 'claude/old-base', oldBase);
  writeFileSync(path.join(work, 'feature.js'), 'export const ok = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'feature');

  const out = runPreflight(work).out;
  assert.match(donorLine(out), /\[OK/, 'отставание само по себе — не отвергнутая линия');
  assert.match(out, /база ветки: .*отста[её]т/, 'проверка 3 обязана остаться WARN-ом об отставании');
});

test('метки нет в репозитории — проверка не падает и не врёт', () => {
  const { work, g } = makeRepo();
  g('tag', '-d', TAINT_TAG);
  g('branch', '-q', '-D', 'donor');

  const line = donorLine(runPreflight(work).out);
  assert.match(line, /\[OK/, 'недостижимого объекта не может быть в предках HEAD');
});

test('линия влита в main — гард замолкает сам, без правки списка', () => {
  const { work, g } = makeRepo();
  g('merge', '-q', '--no-ff', '-m', 'merge donor', TAINT_TAG);
  g('push', '-q', 'origin', 'main');
  g('checkout', '-q', '-b', 'claude/next', 'origin/main');

  const line = donorLine(runPreflight(work).out);
  assert.match(line, /\[OK/, 'то, что лежит в main, отвергнутым больше не считается');
});
