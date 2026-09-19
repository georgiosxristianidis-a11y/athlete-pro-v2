/**
 * Гейт для ПОТОКА УПРАВЛЕНИЯ `.githooks/pre-push` вокруг SCA.
 *
 * `test/sca-audit.test.js` кроет сам гард — вердикты, причины, коды выхода.
 * Здесь проверяется другое: что хук эти коды читает правильно. Между ними
 * ровно тот стык, на котором карточка и сгорела: гард может быть безупречен, а
 * хук — закончить бодрым «Security Pass» на непроведённой проверке или увести
 * пуш мимо SAST.
 *
 * ЧТО ИМЕННО ЗАКРЕПЛЕНО:
 *  - код 3 («не проверено») — пуш продолжается, SAST бежит, финальная строка
 *    напоминает, что SCA не выполнен;
 *  - код 1 (находка) — хук обрывается до SAST;
 *  - код 0 — обычный проход;
 *  - гарда нет в чекауте — пропуск проговаривается, SAST не теряется;
 *  - хук зовёт гард именно с `--on-unavailable=signal`: без этого флага гард на
 *    отказе проверки вернёт 0, и хук напечатает «Security Pass» там, где
 *    проверки не было. Флаг — это контракт между двумя файлами, и держать его
 *    обязан тест, а не комментарий;
 *  - в хуке не осталось `ping` как признака доступности реестра.
 *
 * BASELINE. Две разные версии красят разные кейсы, и обе стоит помнить:
 *
 *   # до карточки SCA (голый npm audit, airgap-ветка с exit 0 на весь хук)
 *   git show 4f723990:.githooks/pre-push > /tmp/old-hook
 *   PRE_PUSH_HOOK=/tmp/old-hook node --test test/pre-push-sca-flow.test.js
 *   # → 5 красных из 6: зелен только «код 1 блокирует», и тот по совпадению —
 *   #   старый хук падает на настоящем npm audit в песочнице без локфайла
 *
 *   # версия с гардом, но ещё с пингом
 *   git show 3d36965a:.githooks/pre-push > /tmp/ping-hook
 *   PRE_PUSH_HOOK=/tmp/ping-hook node --test test/pre-push-sca-flow.test.js
 *   # → красный «нет пинга»
 *
 * Сети и настоящих гардов здесь нет: в песочнице рядом с хуком лежат подставные
 * `scripts/*.mjs` с заданным кодом выхода и `package.json`, чей `lint` печатает
 * маркер. Проверяется поток управления хука, а не работа гардов, — у каждого из
 * них гейт свой.
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
/** Стаб гарда печатает свои аргументы этим префиксом — так виден контракт вызова. */
const ARGV_MARKER = 'SCA-ARGV:';

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
 * @param {{ sca?: { code: number, say: string } | null }} opts `sca: null` — гарда нет вовсе
 */
function makeCwd({ sca = { code: 0, say: '[SCA Pass] чисто' } } = {}) {
  const cwd = path.join(sandbox, `case-${++caseId}`);
  mkdirSync(path.join(cwd, 'scripts'), { recursive: true });

  const stub = (say, code) => `console.log(${JSON.stringify(say)});\nprocess.exit(${code});\n`;

  writeFileSync(path.join(cwd, 'scripts', 'check-branch-drift.mjs'), stub('[drift stub]', 0));
  writeFileSync(path.join(cwd, 'scripts', 'check-branch-prefix.mjs'), stub('[prefix stub]', 0));
  if (sca) {
    writeFileSync(
      path.join(cwd, 'scripts', 'sca-audit.mjs'),
      `console.log(${JSON.stringify(ARGV_MARKER)} + process.argv.slice(2).join(' '));\n` +
        stub(sca.say, sca.code)
    );
  }

  // Маркер печатает ОТДЕЛЬНЫЙ файл, а не строка в `scripts.lint`. Причина: npm
  // эхом печатает саму команду перед запуском, и маркер внутри неё делал бы тест
  // зелёным даже когда SAST не выполнился. Форма `npm run lint -- --cache` (её
  // зовёт хук) по той же причине требует скрипта, принимающего лишний аргумент:
  // `node -e '...' --cache` — это `node: bad option`.
  writeFileSync(
    path.join(cwd, 'scripts', 'fake-lint.mjs'),
    `console.log(${JSON.stringify(SAST_MARKER)});\n`
  );
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
    env: { ...process.env, MAIN_PUSH_OK: '', DRIFT_OK: '', PREFIX_OK: '' },
  });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

const opts = { skip: shMissing };

test('код 3 — SAST всё равно бежит, а финал напоминает о непроверенном', opts, () => {
  const { code, out } = runHook(
    makeCwd({ sca: { code: 3, say: '[SCA Skip] Проверка НЕ выполнена: до registry не дозвонились.' } })
  );
  assert.match(out, new RegExp(SAST_MARKER), 'baseline: airgap-ветка делала exit 0 и уносила SAST');
  assert.match(out, /SCA в этом пуше НЕ выполнен/, 'бодрый «Security Pass» здесь и есть та самая ложь');
  assert.equal(code, 0, out);
});

test('код 1 — пуш блокируется, до SAST дело не доходит', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: { code: 1, say: '[SCA Block] critical: 1' } }));
  assert.equal(code, 1, 'настоящая находка обязана блокировать');
  assert.doesNotMatch(out, new RegExp(SAST_MARKER), 'блок — это выход, а не продолжение');
});

test('код 0 — обычный проход, без напоминания', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: { code: 0, say: '[SCA Pass] чисто' } }));
  assert.match(out, new RegExp(SAST_MARKER));
  assert.doesNotMatch(out, /НЕ выполнен/, 'напоминание на чистом прогоне — шум, который перестают читать');
  assert.equal(code, 0, out);
});

test('гарда нет в чекауте — пропуск проговаривается, SAST не теряется', opts, () => {
  const { code, out } = runHook(makeCwd({ sca: null }));
  assert.match(out, /\[SCA Skip\]/, 'молчаливый пропуск читался бы как «проверено»');
  assert.match(out, new RegExp(SAST_MARKER));
  assert.match(out, /SCA в этом пуше НЕ выполнен/);
  assert.equal(code, 0, out);
});

test('хук зовёт гард с --on-unavailable=signal и --omit-dev', opts, () => {
  const { out } = runHook(makeCwd({ sca: { code: 0, say: '[SCA Pass] чисто' } }));
  const argv = out.split('\n').find((l) => l.includes(ARGV_MARKER)) ?? '';
  assert.match(argv, /--on-unavailable=signal/, 'без флага отказ проверки вернёт 0 и станет неотличим от «чисто»');
  assert.match(argv, /--omit-dev/, 'pre-push судит прод-зависимости; dev-цепочку добирает CI');
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
