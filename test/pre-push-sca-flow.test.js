/**
 * Гейт для порядка проверок в `.githooks/pre-push` (карточка SCA-1): недоступный
 * реестр не имеет права снимать SAST.
 *
 * BASELINE. В хуке стоял airgap-режим: пинг `registry.npmjs.org`, и на неудачу —
 * `exit 0` НА ВЕСЬ ХУК. То есть обрыв сети молча отключал ещё и статический
 * анализ, которому сеть не нужна вовсе. Вторая половина той же ветки: пинг жил
 * своей жизнью — 2026-09-19 ICMP отвечал нормально ровно в тот день, когда
 * HTTPS-аудит был мёртв (503 на bulk, 400 на legacy), поэтому «сеть активна»
 * доказывало не то, что проверяли, и хук уходил в `npm audit`, чей ненулевой код
 * он читал как находку.
 *
 * Красный baseline воспроизводится без ребейза назад — путь к хуку
 * переопределяется переменной окружения, как в `pre-push-refspec.test.js`:
 *
 *   git show 46841fe2:.githooks/pre-push > /tmp/old-hook
 *   PRE_PUSH_HOOK=/tmp/old-hook node --test test/pre-push-sca-flow.test.js
 *
 * Старый хук красит оба ключевых кейса и при живой сети, и без неё: с сетью он
 * уходит в настоящий `npm audit` (в песочнице без lock-файла тот падает — и
 * падение печатается как «[SCA Block] High or Critical vulnerabilities found»),
 * без сети — выходит нулём до строки с SAST. Маркера SAST нет ни там, ни там.
 *
 * Как это проверяется без сети и без настоящих гардов: хук — обычный sh-скрипт,
 * и в песочнице рядом с ним лежат подставные `scripts/*.mjs` с заданным кодом
 * выхода плюс `package.json`, чей `lint` печатает маркер. Проверяется поток
 * управления хука, а не то, что делают настоящие гарды, — у каждого из них
 * гейт свой.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SRC = process.env.PRE_PUSH_HOOK || path.join(REPO_ROOT, '.githooks', 'pre-push');

const SHA_A = '1111111111111111111111111111111111111111';
const SHA_B = '2222222222222222222222222222222222222222';
const PUSH = `refs/heads/claude/feature ${SHA_A} refs/heads/claude/feature ${SHA_B}\n`;

const SAST_MARKER = 'SAST-RAN-MARKER';

const shMissing = spawnSync('sh', ['-c', 'exit 0']).error
  ? 'sh недоступен в этой оболочке — хук sh-скрипт, проверять нечем'
  : false;

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'prepush-sca-'));

/** CRLF в рабочем дереве Windows не должен попадать под тест — см. pre-push-refspec. */
const hookPath = path.join(sandbox, 'pre-push');
writeFileSync(hookPath, readFileSync(HOOK_SRC, 'utf8').replace(/\r\n/g, '\n'));

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

let caseId = 0;

/**
 * Рабочая директория, где хук доходит до SCA: дрейф и префикс подставные и
 * зелёные, `npm run lint` печатает маркер.
 * @param {{ sca?: { code: number, say: string } | null }} opts `sca: null` — скрипта нет вовсе
 */
function makeCwd({ sca = { code: 0, say: '[SCA Unknown] реестр недоступен' } } = {}) {
  const cwd = path.join(sandbox, `case-${++caseId}`);
  mkdirSync(path.join(cwd, 'scripts'), { recursive: true });

  const stub = (say, code) =>
    `console.log(${JSON.stringify(say)});\nprocess.exit(${code});\n`;

  writeFileSync(path.join(cwd, 'scripts', 'check-branch-drift.mjs'), stub('[drift stub]', 0));
  writeFileSync(path.join(cwd, 'scripts', 'check-branch-prefix.mjs'), stub('[prefix stub]', 0));
  if (sca) writeFileSync(path.join(cwd, 'scripts', 'check-sca.mjs'), stub(sca.say, sca.code));

  // Маркер печатает ОТДЕЛЬНЫЙ файл, а не строка в `scripts.lint`. Причина: npm
  // эхом печатает саму команду перед запуском, и маркер внутри неё делал бы
  // тест зелёным даже когда SAST не выполнился. Форма `npm run lint -- --cache`
  // (её зовёт хук) по той же причине требует скрипта, принимающего лишний
  // аргумент: `node -e '...' --cache` — это `node: bad option`.
  writeFileSync(path.join(cwd, 'scripts', 'fake-lint.mjs'), `console.log(${JSON.stringify(SAST_MARKER)});\n`);
  writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify(
      { name: 'sandbox', private: true, scripts: { lint: 'node scripts/fake-lint.mjs' } },
      null,
      2
    )
  );
  return cwd;
}

function runHook(cwd) {
  const res = spawnSync('sh', [hookPath], {
    input: PUSH,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, MAIN_PUSH_OK: '', DRIFT_OK: '', PREFIX_OK: '', SCA_STRICT: '' },
  });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

const opts = { skip: shMissing };

test('SCA не смог проверить — SAST всё равно бежит, пуш проходит', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: { code: 0, say: '[SCA Unknown] реестр недоступен' } }));
  assert.match(out, /\[SCA Unknown\]/, 'вердикт гарда обязан быть виден в выводе хука');
  assert.match(out, new RegExp(SAST_MARKER), 'baseline: airgap-ветка делала exit 0 и снимала SAST');
  assert.equal(code, 0, out);
});

test('SCA нашёл уязвимости — пуш блокируется, до SAST дело не доходит', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: { code: 1, say: '[SCA Block] critical: 1' } }));
  assert.equal(code, 1, 'настоящая находка обязана блокировать');
  assert.doesNotMatch(out, new RegExp(SAST_MARKER), 'блок — это выход, а не продолжение');
});

test('SCA чист — хук идёт дальше к SAST', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: { code: 0, say: '[SCA Pass] чисто' } }));
  assert.match(out, new RegExp(SAST_MARKER));
  assert.equal(code, 0, out);
});

test('гарда нет в чекауте — пропуск проговаривается, SAST не теряется', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: null }));
  assert.match(out, /\[SCA Skip\]/, 'молчаливый пропуск читался бы как «проверено»');
  assert.match(out, new RegExp(SAST_MARKER));
  assert.equal(code, 0, out);
});

test('в хуке не осталось пинга как признака доступности реестра', opts, () => {
  const hook = readFileSync(hookPath, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(
    hook,
    /\bping\b/,
    'ICMP отвечал в день, когда audit-эндпоинт был мёртв — живой пинг доказывал не то'
  );
});
