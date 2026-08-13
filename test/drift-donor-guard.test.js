/**
 * Гейт для донорского блока в `scripts/check-branch-drift.mjs` (BASE-1, слой 2).
 *
 * Почему проверка вообще попала в скрипт дрейфа: он единственный в проекте
 * вызывается из ОБОИХ слоёв — `.githooks/pre-push` (ловит до того, как код
 * уедет) и job `drift` в CI (слой, которому протухший чекаут не страшен;
 * CLAUDE.md § Multi-Agent Protocol: правила, живущие в чекауте, дрейфуют вместе
 * с ним, поэтому дубль в CI обязателен). Одна вставка — оба слоя.
 *
 * Что здесь по-настоящему сторожится, кроме самого блока:
 *
 * 1. `DRIFT_OK=1` НЕ снимает донорский блок. Рутинный обход дрейфа набирается
 *    на автомате, и если он заодно глушит «под тобой отвергнутый код с утечкой
 *    ключа» — гарда нет. Инцидент O-9 куплен ровно этим: один обход снял один
 *    гард, второй остался, и это было замечено только постфактум.
 * 2. Донорская проверка идёт РАНЬШЕ выхода по `DRIFT_OK` и раньше сетевых
 *    шагов — то есть порядок в файле сам является предметом теста.
 * 3. `DONOR_OK=1` обход оставляет: донорская ветка хранится намеренно, и её
 *    иногда нужно запушить. Гард без выхода = привычка тянуться к `--no-verify`,
 *    который глушит уже все проверки сразу.
 *
 * Кейсы с настоящей линией требуют живого объекта `8e23fd6` и пропускаются в
 * неполном клоне; логика самого поиска покрыта в `preflight-base-guard.test.js`
 * на подставном списке.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REJECTED_LINES } from '../scripts/rejected-lines.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIFT = path.join(REPO_ROOT, 'scripts', 'check-branch-drift.mjs');
const realSha = REJECTED_LINES[0].sha;

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'drift-donor-'));
let seq = 0;

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

const git =
  (cwd) =>
  (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

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

  writeFileSync(path.join(work, 'README.md'), 'base\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('push', '-q', 'origin', 'main');
  return { work, g };
}

/** @param {{ cwd: string, env?: Record<string,string> }} opts */
function runDrift({ cwd, env = {} }) {
  const res = spawnSync(process.execPath, [DRIFT], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DRIFT_OK: '', DONOR_OK: '', CI: '', ...env },
  });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

/**
 * База с настоящей отвергнутой линией: рефы тянем из репозитория проекта
 * целиком. Не `fetch <sha>` — по голому SHA сервер отдаёт объект только при
 * uploadpack.allowAnySHA1InWant, и разница молча разъехалась бы между локальным
 * прогоном и CI.
 */
function repoOnDonorLine() {
  const { work, g } = makeRepo();
  g('fetch', '-q', REPO_ROOT, '+refs/*:refs/remotes/src/*');
  g('checkout', '-q', '-b', 'claude/hud-3', realSha);
  return work;
}

const objectMissing = spawnSync('git', ['cat-file', '-e', `${realSha}^{commit}`], { cwd: REPO_ROOT })
  .status;
const opts = { skip: objectMissing ? `объекта ${realSha.slice(0, 7)} нет в этом клоне` : false };

test('база на отвергнутой линии — Donor Block и ненулевой выход', opts, () => {
  const { code, out } = runDrift({ cwd: repoOnDonorLine() });
  assert.match(out, /\[Donor Block\]/, `baseline: гард жил только в preflight\n${out}`);
  assert.match(out, new RegExp(realSha.slice(0, 7)), 'блок обязан называть SHA линии');
  assert.equal(code, 1);
});

test('DRIFT_OK=1 донорский блок НЕ снимает', opts, () => {
  const { code, out } = runDrift({ cwd: repoOnDonorLine(), env: { DRIFT_OK: '1' } });
  assert.match(out, /\[Donor Block\]/, 'рутинный обход дрейфа не должен глушить серьёзный гард');
  assert.equal(code, 1, 'иначе достаточно привычного DRIFT_OK=1, и защиты нет');
});

test('DONOR_OK=1 — осознанный обход, и он проговаривается вслух', opts, () => {
  const { out } = runDrift({ cwd: repoOnDonorLine(), env: { DONOR_OK: '1' } });
  assert.doesNotMatch(out, /\[Donor Block\]/, 'пуш самой донорской ветки должен оставаться возможным');
  assert.match(out, /DONOR_OK=1/, 'молчаливый обход неотличим от сломанного гарда');
});

test('чистая база донорским блоком не задевается', () => {
  const { work, g } = makeRepo();
  g('checkout', '-q', '-b', 'claude/card', 'origin/main');

  const { out } = runDrift({ cwd: work });
  assert.doesNotMatch(out, /\[Donor Block\]/, 'ложный блок дороже отсутствия проверки');
});

test('порядок в файле: донорская проверка стоит РАНЬШЕ выхода по DRIFT_OK', () => {
  // Кейс с настоящей линией пропускается в неполном клоне, а порядок строк —
  // ровно то, от чего зависит вся конструкция. Его судим по исходнику, чтобы
  // проверка шла везде и всегда.
  const src = readFileSync(DRIFT, 'utf8');
  const donorAt = src.indexOf('scanBase(');
  const driftBypassAt = src.indexOf("process.env.DRIFT_OK === '1'");

  assert.ok(donorAt > -1 && driftBypassAt > -1, 'обе конструкции обязаны существовать');
  assert.ok(
    donorAt < driftBypassAt,
    'DRIFT_OK выходит из скрипта целиком — ниже него донорская проверка просто не выполнится',
  );
});
