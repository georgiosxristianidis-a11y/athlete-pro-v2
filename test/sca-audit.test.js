/**
 * Гейт для гарда SCA (карточка AGENT-10): отказ проверки не смеет выглядеть
 * находкой, а находка — исчезать.
 *
 * Мина 2026-09-19: registry ответил 503 на bulk-эндпоинт, npm откатился на
 * отставной quick, тот вернул 400 с текстом «Invalid package tree, run npm
 * install». Дерево было цело — тот же 400 ловил чистый скретч-проект с одним
 * express. Наружу всё это выходило одним битом «exit 1», и обе точки, где
 * спрашивают SCA, читали его как «найдены уязвимости»: pre-push резал любой пуш
 * в проекте, шаг `Security audit (high+)` красил обязательный чек — то есть мёрж
 * был закрыт для всех веток сразу.
 *
 * Слоёв два, как у гардов дрейфа и префикса:
 *   - ЛОГИКА (`classify`) — чистая функция на настоящем выводе npm: фикстуры
 *     сняты с живого прогона 2026-09-19 (400 от registry, ECONNREFUSED) и со
 *     стаб-registry (чистый отчёт, отчёт с high);
 *   - ПОЛИТИКА (`run` с подменённым прогоном) — что именно гард делает с каждым
 *     исходом: ретраи, коды выхода, обход, аннотация CI.
 *
 * Кейсы на ПРОХОД тут не менее важны, чем на блок: гард, который блокирует на
 * аварии сервиса, приучает тянуться к `--no-verify` — а тот снимает разом все
 * четыре гарда pre-push.
 *
 * Красный baseline воспроизводится прежней формулой гарда — «ненулевой код =
 * находка»: на фикстуре ENDPOINT_400 она даёт блок, `classify` — пропуск.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCK_LEVELS,
  BYPASS_ENV,
  EXIT,
  ON_UNAVAILABLE,
  OUTCOME,
  REASON,
  classify,
  formatLines,
  parseArgs,
  run,
} from '../scripts/sca-audit.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = path.join(REPO_ROOT, '.githooks', 'pre-push');

// --- Фикстуры: настоящий вывод npm, не выдуманный ---------------------------

/** Живой прогон 2026-09-19: bulk отдал 503, npm упал на quick, тот — 400. */
const ENDPOINT_400 = {
  code: 1,
  stdout: JSON.stringify({
    message:
      '400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Bad Request',
    method: 'POST',
    uri: 'https://registry.npmjs.org/-/npm/v1/security/audits/quick',
    statusCode: 400,
    body: {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid package tree, run  npm install  to rebuild your package-lock.json',
    },
    error: { summary: '', detail: '' },
  }),
  stderr: [
    'npm notice This endpoint is being retired. Use the bulk advisory endpoint instead.',
    'npm warn audit 400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Bad Request',
    'npm error audit endpoint returned an error',
  ].join('\n'),
};

/** Registry на закрытом порту: ответа не было вовсе, но npm печатает ту же строку про эндпоинт. */
const NETWORK_DEAD = {
  code: 1,
  stdout: JSON.stringify({
    message:
      'request to http://127.0.0.1:1/-/npm/v1/security/audits/quick failed, reason: connect ECONNREFUSED 127.0.0.1:1',
    error: { summary: '', detail: '' },
  }),
  stderr: 'npm error audit endpoint returned an error',
};

const CLEAN_REPORT = {
  code: 0,
  stdout: JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: { prod: 138, dev: 195, total: 332 },
    },
  }),
  stderr: '',
};

/** Стаб-registry отдал high на express; npm протянул его на зависимый пакет. */
const FINDING_REPORT = {
  code: 1,
  stdout: JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      express: { name: 'express', severity: 'high', isDirect: true, fixAvailable: false },
      'express-rate-limit': { name: 'express-rate-limit', severity: 'high', isDirect: true },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 },
      dependencies: { prod: 138, dev: 195, total: 332 },
    },
  }),
  stderr: '',
};

const MODERATE_ONLY = {
  code: 1,
  stdout: JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: { qs: { name: 'qs', severity: 'moderate' } },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
    },
  }),
  stderr: '',
};

// --- Слой 1: логика ---------------------------------------------------------

test('отказ audit-эндпоинта — не находка', () => {
  const v = classify(ENDPOINT_400);
  assert.equal(v.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(v.reason, REASON.ENDPOINT);
  assert.match(v.detail, /400/);
  // Прежняя формула гарда на этой же фикстуре давала блок — вот она:
  assert.equal(ENDPOINT_400.code !== 0, true);
});

test('текст отказа не выдаёт ложь registry за диагноз', () => {
  // registry советует «run npm install to rebuild your package-lock.json»;
  // дерево при этом цело, и повторять этот совет пользователю гард не должен.
  const lines = formatLines(classify(ENDPOINT_400), { omitDev: true }).join('\n');
  assert.doesNotMatch(lines, /package-lock|Invalid package tree/);
  assert.match(lines, /НЕ выполнена/);
});

test('мёртвая сеть отличается от ответа эндпоинта, хотя npm печатает одну строку', () => {
  const v = classify(NETWORK_DEAD);
  assert.equal(v.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(v.reason, REASON.NETWORK);
  assert.match(v.detail, /ECONNREFUSED/);
});

test('чистый отчёт — чисто, отчёт с high — находка', () => {
  assert.equal(classify(CLEAN_REPORT).outcome, OUTCOME.CLEAN);

  const v = classify(FINDING_REPORT);
  assert.equal(v.outcome, OUTCOME.FINDING);
  assert.equal(v.counts.high, 2);
  assert.equal(v.counts.critical, 0);
  assert.deepEqual(v.counts.packages, ['express (high)', 'express-rate-limit (high)']);
});

test('moderate ниже порога блока — проход, как у прежнего --audit-level=high', () => {
  assert.deepEqual(BLOCK_LEVELS, ['high', 'critical']);
  assert.equal(classify(MODERATE_ONLY).outcome, OUTCOME.CLEAN);
});

test('отчёт без metadata считается по карте уязвимостей', () => {
  const v = classify({
    code: 1,
    stdout: JSON.stringify({
      vulnerabilities: { foo: { name: 'foo', severity: 'critical' } },
    }),
    stderr: '',
  });
  assert.equal(v.outcome, OUTCOME.FINDING);
  assert.equal(v.counts.critical, 1);
});

test('нет лока и нечитаемый ответ — тоже отказ проверки, а не чистота', () => {
  const noLock = classify({
    code: 1,
    stdout: JSON.stringify({ error: { code: 'EAUDITNOLOCK', summary: 'Neither lock file...' } }),
    stderr: '',
  });
  assert.equal(noLock.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(noLock.reason, REASON.NO_LOCKFILE);

  const garbage = classify({ code: 127, stdout: 'npm: command not found', stderr: '' });
  assert.equal(garbage.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(garbage.reason, REASON.UNPARSEABLE);
});

test('пустой вывод не читается как чистый отчёт', () => {
  const v = classify({ code: 0, stdout: '', stderr: '' });
  assert.equal(v.outcome, OUTCOME.UNAVAILABLE);
});

test('флаги разбираются, дефолты — ретраи есть, блока по отказу нет', () => {
  assert.deepEqual(parseArgs([]), {
    omitDev: false,
    retries: 2,
    retryDelay: 2500,
    onUnavailable: ON_UNAVAILABLE.PASS,
  });
  const cfg = parseArgs([
    '--omit-dev',
    '--retries=3',
    '--retry-delay=0',
    '--on-unavailable=fail',
  ]);
  assert.equal(cfg.omitDev, true);
  assert.equal(cfg.retries, 3);
  assert.equal(cfg.retryDelay, 0);
  assert.equal(cfg.onUnavailable, ON_UNAVAILABLE.FAIL);

  // Мусор в значении не должен молча ужесточать или ослаблять политику.
  assert.equal(parseArgs(['--on-unavailable=whatever']).onUnavailable, ON_UNAVAILABLE.PASS);
});

// --- Слой 2: политика -------------------------------------------------------

function sink() {
  const lines = [];
  return {
    lines,
    out: {
      log: (...a) => lines.push(a.join(' ')),
      error: (...a) => lines.push(a.join(' ')),
    },
  };
}

/** Прогон, подменяющий npm: считает попытки, отдаёт заготовленные ответы. */
function fakeAudit(results) {
  const queue = Array.isArray(results) ? [...results] : [results];
  const calls = [];
  return {
    calls,
    audit: (opts) => {
      calls.push(opts);
      return queue.length > 1 ? queue.shift() : queue[0];
    },
  };
}

test('отказ проверки пропускает пуш — но говорит вслух', async () => {
  const { lines, out } = sink();
  const { audit, calls } = fakeAudit(ENDPOINT_400);
  const code = await run({
    argv: ['--omit-dev', '--retries=1', '--retry-delay=0'],
    env: {},
    out,
    audit,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 2, 'отказ обязан ретраиться');
  assert.match(lines.join('\n'), /\[SCA Skip\] Проверка НЕ выполнена/);
});

test('ретрай ловит моргнувший эндпоинт: второй ответ — отчёт', async () => {
  const { lines, out } = sink();
  const { audit, calls } = fakeAudit([ENDPOINT_400, CLEAN_REPORT]);
  const code = await run({ argv: ['--retries=2', '--retry-delay=0'], env: {}, out, audit });
  assert.equal(code, 0);
  assert.equal(calls.length, 2, 'после успешного ответа ретраи прекращаются');
  assert.match(lines.join('\n'), /\[SCA Pass\]/);
});

test('находка блокирует и не ретраится', async () => {
  const { lines, out } = sink();
  const { audit, calls } = fakeAudit(FINDING_REPORT);
  const code = await run({
    argv: ['--omit-dev', '--retries=2', '--retry-delay=0'],
    env: {},
    out,
    audit,
  });
  assert.equal(code, 1);
  assert.equal(calls.length, 1);
  const text = lines.join('\n');
  assert.match(text, /\[SCA Block\] Push rejected!/);
  assert.match(text, /SCA_OK=1/);
});

test('у находки есть свой обход — иначе остаётся --no-verify, глушащий все гарды', async () => {
  const { lines, out } = sink();
  const { audit } = fakeAudit(FINDING_REPORT);
  const code = await run({
    argv: ['--omit-dev', '--retries=0'],
    env: { [BYPASS_ENV]: '1' },
    out,
    audit,
  });
  assert.equal(code, 0);
  assert.match(lines.join('\n'), /пропущена осознанно/);
});

test('обход находки не делает отказ проверки тише', async () => {
  const { lines, out } = sink();
  const { audit } = fakeAudit(ENDPOINT_400);
  const code = await run({
    argv: ['--retries=0'],
    env: { [BYPASS_ENV]: '1' },
    out,
    audit,
  });
  assert.equal(code, 0);
  assert.match(lines.join('\n'), /НЕ выполнена/);
});

test('--on-unavailable=fail переключает политику отказа, не трогая остальные', async () => {
  const { audit } = fakeAudit(ENDPOINT_400);
  const { out } = sink();
  assert.equal(
    await run({ argv: ['--retries=0', '--on-unavailable=fail'], env: {}, out, audit }),
    EXIT.FINDING
  );

  const clean = fakeAudit(CLEAN_REPORT);
  assert.equal(
    await run({
      argv: ['--retries=0', '--on-unavailable=fail'],
      env: {},
      out: sink().out,
      audit: clean.audit,
    }),
    EXIT.CLEAN
  );
});

test('--on-unavailable=signal отличает «не проверено» от «чисто» кодом выхода', async () => {
  // На общем нуле pre-push заканчивался бы бодрым «Security Pass» на
  // непроверенных зависимостях: отличить их от чистого отчёта было бы нечем.
  assert.notEqual(EXIT.UNAVAILABLE, EXIT.CLEAN);
  assert.notEqual(EXIT.UNAVAILABLE, EXIT.FINDING);

  const unavailable = await run({
    argv: ['--omit-dev', '--retries=0', '--on-unavailable=signal'],
    env: {},
    out: sink().out,
    audit: fakeAudit(ENDPOINT_400).audit,
  });
  assert.equal(unavailable, EXIT.UNAVAILABLE);

  const clean = await run({
    argv: ['--omit-dev', '--retries=0', '--on-unavailable=signal'],
    env: {},
    out: sink().out,
    audit: fakeAudit(CLEAN_REPORT).audit,
  });
  assert.equal(clean, EXIT.CLEAN);

  const finding = await run({
    argv: ['--omit-dev', '--retries=0', '--on-unavailable=signal'],
    env: {},
    out: sink().out,
    audit: fakeAudit(FINDING_REPORT).audit,
  });
  assert.equal(finding, EXIT.FINDING);
});

test('pre-push зовёт гард именно в режиме signal — иначе пропуск не прозвучит', () => {
  const hook = readFileSync(HOOK_PATH, 'utf8');
  assert.match(hook, /sca-audit\.mjs --omit-dev --on-unavailable=signal/);
  // Код 3 обязан вести к продолжению (SAST ниже), а не к выходу из хука.
  assert.match(hook, /sca_code -eq 3/);
  assert.match(hook, /sca_skipped=/);
  // Прежняя инверсия: оффлайн-ветка выходила из хука нулём и уносила SAST.
  assert.doesNotMatch(hook, /Airgap Mode/);
});

test('в CI отказ помечается аннотацией — зелёный шаг обязан отличаться от выполненной проверки', async () => {
  const { lines, out } = sink();
  const { audit } = fakeAudit(ENDPOINT_400);
  await run({ argv: ['--retries=0'], env: { GITHUB_ACTIONS: 'true' }, out, audit });
  assert.match(lines.join('\n'), /^::warning title=SCA не выполнен::/m);

  const local = sink();
  await run({ argv: ['--retries=0'], env: {}, out: local.out, audit: fakeAudit(ENDPOINT_400).audit });
  assert.doesNotMatch(local.lines.join('\n'), /::warning/);
});

test('pre-push смотрит production-зависимости, CI — все', async () => {
  const hook = fakeAudit(CLEAN_REPORT);
  await run({ argv: ['--omit-dev', '--retries=0'], env: {}, out: sink().out, audit: hook.audit });
  assert.equal(hook.calls[0].omitDev, true);

  const ci = fakeAudit(CLEAN_REPORT);
  await run({ argv: ['--retries=0'], env: {}, out: sink().out, audit: ci.audit });
  assert.equal(ci.calls[0].omitDev, false);
});

// --- Слой 3: повтор судит по причине, а не по факту отказа ------------------
//
// Появилось вместе со снятием `ping` из `.githooks/pre-push`. Пинг был ложным
// признаком доступности АУДИТА — ICMP отвечал 19.09 ровно в тот день, когда
// эндпоинт был мёртв, — но одну полезную работу делал: отсекал оффлайн за две
// секунды. Без него мёртвая сеть стоила 8.9 с вместо 2 с: npm падал мгновенно, а
// гард трижды ждал по 2.5 с того, чего не будет.
//
// Разделение простое: «до хоста не дошли» (нет DNS, нет маршрута, соединение
// отвергнуто) повтором не лечится; «канал живой, но сорвался» — лечится.

/** Оборванный сокет на живом канале: ретрай тут осмыслен. */
const NETWORK_FLAKY = {
  code: 1,
  stdout: JSON.stringify({
    message:
      'request to https://registry.npmjs.org/-/npm/v1/security/audits/quick failed, reason: socket hang up',
    error: { summary: '', detail: '' },
  }),
  stderr: 'npm error code ECONNRESET\nnpm error audit endpoint returned an error',
};

test('оффлайн не ретраится — ждать DNS и маршрут нечего', async () => {
  const { lines, out } = sink();
  const { audit, calls } = fakeAudit(NETWORK_DEAD);
  const code = await run({
    argv: ['--omit-dev', '--retries=2', '--retry-delay=0', '--on-unavailable=signal'],
    env: {},
    out,
    audit,
  });
  assert.equal(calls.length, 1, 'baseline: было три попытки и 8.9 с на мёртвой сети');
  assert.equal(code, EXIT.UNAVAILABLE, 'отказ проверки остаётся отказом — молчать он не начинает');
  assert.match(lines.join('\n'), /\[SCA Skip\] Проверка НЕ выполнена/);
});

test('сорванный сокет на живом канале — ретраится', async () => {
  const { audit, calls } = fakeAudit([NETWORK_FLAKY, CLEAN_REPORT]);
  const code = await run({
    argv: ['--retries=2', '--retry-delay=0'],
    env: {},
    out: sink().out,
    audit,
  });
  assert.equal(calls.length, 2, 'ECONNRESET — не оффлайн: канал был, ответ сорвался');
  assert.equal(code, EXIT.CLEAN);
});

test('classify кладёт сетевой код полем, а не только в текст', () => {
  const dead = classify(NETWORK_DEAD);
  assert.equal(dead.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(dead.reason, REASON.NETWORK);
  assert.equal(
    dead.code,
    'ECONNREFUSED',
    'решение о повторе судит по полю: разбирать свою же строку регекспом — второй источник правды'
  );
  assert.equal(classify(NETWORK_FLAKY).code, 'ECONNRESET');
  assert.equal(classify(ENDPOINT_400).code, undefined, 'у отказа сервера сетевого кода нет');
});
