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
  EXCEPTIONS,
  EXIT,
  ON_UNAVAILABLE,
  OUTCOME,
  REASON,
  applyExceptions,
  classify,
  exceptionCandidates,
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

// --- Слой 4: узкие исключения (карточка SCA-1) ------------------------------
//
// Мина 2026-10-04: GHSA-vfj7-8cjw-p6xm (braces <= 3.0.3, DoS через вложенный
// паттерн) вышел без патча. braces только в dev-цепочке stylelint, но npm метит
// high все пять записей, и шаг CI с dev-зависимостями покраснел на самом main.
//
// Исключение действует, пока гард сам подтверждает три условия: адвайзори нет в
// прогоне --omit-dev, `fixAvailable` не `true`, дата пересмотра не наступила.
// Транзитивные записи сводятся к корням по `via`; один чужой high-корень — блок.
//
// BASELINE: тот же отчёт без списка исключений (`exceptions: []`) — exit 1,
// ровно как шаг CI на main 9326e1a2.
//
// Исключение в тестах своё, а не из EXCEPTIONS: снятие живой записи (выйдет
// braces 3.0.4) не должно ломать проверку механизма.

/** Адвайзори из живого `npm audit --json` 2026-10-04 (worktree на 9326e1a2). */
const BRACES_ADVISORY = {
  source: 1240992,
  name: 'braces',
  dependency: 'braces',
  title: 'braces vulnerable to stack-exhaustion denial of service through deeply nested patterns',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
  severity: 'high',
  cwe: ['CWE-674'],
  cvss: { score: 7.5, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' },
  range: '<=3.0.3',
};

/** «Фикс» npm в тот день — откат stylelint на мажоры назад, не патч. */
const STYLELINT_FIX = { name: 'stylelint', version: '7.7.0', isSemVerMajor: true };

const BRACES_EXCEPTION = Object.freeze({
  id: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  reason: 'тестовая запись',
  review: '2026-11-04',
});

const BEFORE_REVIEW = new Date('2026-10-04T12:00:00Z');

/** Цепочка stylelint → micromatch/fast-glob/globby → braces, как в живом отчёте. */
function bracesChain({ fixAvailable = STYLELINT_FIX } = {}) {
  const entry = (name, via, extra = {}) => ({
    name,
    severity: 'high',
    isDirect: false,
    via,
    fixAvailable,
    ...extra,
  });
  return {
    braces: entry('braces', [BRACES_ADVISORY], { effects: ['micromatch'], range: '*' }),
    'fast-glob': entry('fast-glob', ['micromatch'], { effects: ['globby', 'stylelint'] }),
    globby: entry('globby', ['fast-glob', 'micromatch'], { effects: ['stylelint'] }),
    micromatch: entry('micromatch', ['braces'], { effects: ['fast-glob', 'globby', 'stylelint'] }),
    stylelint: entry('stylelint', ['fast-glob', 'globby', 'micromatch'], { isDirect: true }),
  };
}

/** Чужой high-адвайзори на отдельном пакете. */
function foreignAdvisory(name, severity = 'high') {
  return {
    source: 9999999,
    name,
    dependency: name,
    title: `${name} test advisory`,
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
    severity,
    range: '*',
  };
}

/** Результат прогона `npm audit --json`: карта по алфавиту, как у npm, metadata — по карте. */
function auditResult(map) {
  const vulnerabilities = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  const list = Object.values(vulnerabilities);
  const count = (level) => list.filter((v) => v.severity === level).length;
  return {
    code: list.length ? 1 : 0,
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities,
      metadata: {
        vulnerabilities: {
          info: 0,
          low: count('low'),
          moderate: count('moderate'),
          high: count('high'),
          critical: count('critical'),
          total: list.length,
        },
        dependencies: { prod: 140, dev: 195, total: 334 },
      },
    }),
    stderr: '',
  };
}

const DEV_BRACES = auditResult(bracesChain());

/** Подменный npm, отвечающий по области: dev-прогон и прогон --omit-dev раздельно. */
function auditByScope({ dev, prod }) {
  const calls = [];
  return {
    calls,
    audit: (opts) => {
      calls.push(opts);
      return opts.omitDev ? prod : dev;
    },
  };
}

async function runScoped({
  dev,
  prod = CLEAN_REPORT,
  argv = ['--retries=0'],
  env = {},
  now = BEFORE_REVIEW,
  exceptions = [BRACES_EXCEPTION],
}) {
  const { lines, out } = sink();
  const { audit, calls } = auditByScope({ dev, prod });
  const code = await run({ argv, env, out, audit, now, exceptions });
  return { code, calls, text: lines.join('\n') };
}

test('SCA-1: только исключённый адвайзори в dev-дереве — чисто, но вслух', async () => {
  // Baseline: без списка исключений тот же отчёт красит, как шаг CI на main.
  const base = await runScoped({ dev: DEV_BRACES, exceptions: [] });
  assert.equal(base.code, EXIT.FINDING);
  assert.match(base.text, /high 5/);

  const r = await runScoped({ dev: DEV_BRACES });
  assert.equal(r.code, EXIT.CLEAN);
  assert.deepEqual(
    r.calls.map((c) => c.omitDev),
    [false, true],
    'исключение обязано сверяться с прогоном --omit-dev'
  );
  assert.match(r.text, /\[SCA Pass\]/);
  assert.match(
    r.text,
    /^\[SCA Exception\] GHSA-vfj7-8cjw-p6xm \(braces\) пропущен до 2026-11-04: тестовая запись\. Записи: braces, fast-glob, globby, micromatch, stylelint\.$/m
  );
  assert.doesNotMatch(r.text, /::warning/, 'аннотация — только в CI');

  const ci = await runScoped({ dev: DEV_BRACES, env: { GITHUB_ACTIONS: 'true' } });
  assert.equal(ci.code, EXIT.CLEAN);
  assert.match(
    ci.text,
    /^::warning title=SCA исключение GHSA-vfj7-8cjw-p6xm::braces пропущен до 2026-11-04/m
  );
});

test('SCA-1: исключённое + любая другая high — блок, чужая находка не тонет', async () => {
  const dev = auditResult({
    ...bracesChain(),
    express: {
      name: 'express',
      severity: 'high',
      isDirect: true,
      via: [foreignAdvisory('express')],
      fixAvailable: false,
    },
  });
  const r = await runScoped({ dev });
  assert.equal(r.code, EXIT.FINDING);
  assert.match(r.text, /\[SCA Block\]/);
  assert.match(r.text, /Найдено: critical 0, high 1/);
  assert.match(r.text, /^ {3}Пакеты: express \(high\)$/m);

  const v = applyExceptions(classify(dev), {
    prod: classify(CLEAN_REPORT),
    now: BEFORE_REVIEW,
    exceptions: [BRACES_EXCEPTION],
  });
  assert.equal(v.outcome, OUTCOME.FINDING);
  assert.deepEqual(v.counts.packages, ['express (high)']);
});

test('SCA-1: адвайзори есть в прогоне --omit-dev — исключение не действует', async () => {
  const r = await runScoped({ dev: DEV_BRACES, prod: DEV_BRACES });
  assert.equal(r.code, EXIT.FINDING);
  assert.match(r.text, /не действует: адвайзори есть в production-дереве/);
  assert.doesNotMatch(r.text, /\[SCA Exception\]/);

  // pre-push сам смотрит production-дерево: второго прогона нет, исключения тоже.
  const hook = await runScoped({
    dev: DEV_BRACES,
    prod: DEV_BRACES,
    argv: ['--omit-dev', '--retries=0'],
  });
  assert.equal(hook.code, EXIT.FINDING);
  assert.deepEqual(
    hook.calls.map((c) => c.omitDev),
    [true]
  );
});

test('SCA-1: прогон --omit-dev не удался — условие не доказано, блок', async () => {
  const r = await runScoped({ dev: DEV_BRACES, prod: ENDPOINT_400 });
  assert.equal(r.code, EXIT.FINDING);
  assert.match(r.text, /не действует: production-дерево не проверено/);
});

test('SCA-1: вышел патч (fixAvailable: true) — блок, чинить локом', async () => {
  const r = await runScoped({ dev: auditResult(bracesChain({ fixAvailable: true })) });
  assert.equal(r.code, EXIT.FINDING);
  assert.match(r.text, /не действует: патч есть/);
  assert.match(r.text, /Найдено: critical 0, high 5/);
});

test('SCA-1: фикс-объект с isSemVerMajor: false — тоже патч; с true — нет', async () => {
  // Решение LEAD 04.10: неломающий фикс-объект значит «патч есть», как и `true`.
  // Живой случай 04.10 — откат stylelint на 7.7.0 (isSemVerMajor: true) — проходит.
  const live = await runScoped({ dev: auditResult(bracesChain({ fixAvailable: STYLELINT_FIX })) });
  assert.equal(live.code, EXIT.CLEAN, 'мажорный откат — не патч');

  // У носителя адвайзори: исключение снимается целиком.
  const carrier = bracesChain();
  carrier.braces = {
    ...carrier.braces,
    fixAvailable: { name: 'braces', version: '3.0.4', isSemVerMajor: false },
  };
  const r1 = await runScoped({ dev: auditResult(carrier) });
  assert.equal(r1.code, EXIT.FINDING);
  assert.match(r1.text, /не действует: патч есть/);
  assert.match(r1.text, /Найдено: critical 0, high 5/);

  // У транзитивной записи: исключение действует, но эту запись не пропускает.
  const transitive = bracesChain();
  transitive.stylelint = {
    ...transitive.stylelint,
    fixAvailable: { name: 'stylelint', version: '17.99.0', isSemVerMajor: false },
  };
  const r2 = await runScoped({ dev: auditResult(transitive) });
  assert.equal(r2.code, EXIT.FINDING);
  assert.match(r2.text, /^ {3}Пакеты: stylelint \(high\)$/m);
  assert.match(r2.text, /Записи: braces, fast-glob, globby, micromatch\./);
});

test('SCA-1: дата пересмотра наступила — блок', async () => {
  const lastDay = await runScoped({ dev: DEV_BRACES, now: new Date('2026-11-03T23:59:59Z') });
  assert.equal(lastDay.code, EXIT.CLEAN, 'накануне пересмотра исключение ещё действует');

  const reviewDay = await runScoped({ dev: DEV_BRACES, now: new Date('2026-11-04T00:00:00Z') });
  assert.equal(reviewDay.code, EXIT.FINDING);
  assert.match(reviewDay.text, /не действует: дата пересмотра 2026-11-04 наступила/);

  // Битая дата не может значить «бессрочно».
  const broken = await runScoped({
    dev: DEV_BRACES,
    exceptions: [{ ...BRACES_EXCEPTION, review: '2026-02-30' }],
  });
  assert.equal(broken.code, EXIT.FINDING);
});

test('SCA-1: транзитив с двумя корнями (исключённый + чужой high) — блок', async () => {
  const chain = bracesChain();
  chain.stylelint = { ...chain.stylelint, via: [...chain.stylelint.via, 'postcss'] };
  const dev = auditResult({
    ...chain,
    postcss: {
      name: 'postcss',
      severity: 'high',
      isDirect: false,
      via: [foreignAdvisory('postcss')],
      fixAvailable: false,
    },
  });
  const r = await runScoped({ dev });
  assert.equal(r.code, EXIT.FINDING);
  assert.match(r.text, /^ {3}Пакеты: postcss \(high\), stylelint \(high\)$/m);
  // Записи, все корни которых — исключённый braces, по-прежнему пропущены.
  assert.match(r.text, /Записи: braces, fast-glob, globby, micromatch\./);
});

test('SCA-1: moderate-корень рядом с исключённым не делает запись блокирующей', () => {
  // Порог блока прежний: moderate не красит ни сам, ни через транзитив.
  const chain = bracesChain();
  chain.stylelint = { ...chain.stylelint, via: [...chain.stylelint.via, 'postcss'] };
  const dev = auditResult({
    ...chain,
    postcss: {
      name: 'postcss',
      severity: 'moderate',
      via: [foreignAdvisory('postcss', 'moderate')],
      fixAvailable: false,
    },
  });
  const v = applyExceptions(classify(dev), {
    prod: classify(CLEAN_REPORT),
    now: BEFORE_REVIEW,
    exceptions: [BRACES_EXCEPTION],
  });
  assert.equal(v.outcome, OUTCOME.CLEAN);
});

test('SCA-1: цепочку свести некуда — исключать нечем, блок без зависания', () => {
  const dev = auditResult({
    a: { name: 'a', severity: 'high', via: ['b'] },
    b: { name: 'b', severity: 'high', via: ['a', 'missing'] },
  });
  assert.deepEqual(exceptionCandidates(classify(dev).report, [BRACES_EXCEPTION]), []);
  const v = applyExceptions(classify(dev), {
    prod: classify(CLEAN_REPORT),
    now: BEFORE_REVIEW,
    exceptions: [BRACES_EXCEPTION],
  });
  assert.equal(v.outcome, OUTCOME.FINDING);
});

test('SCA-1: находка без исключений — второго прогона нет', async () => {
  const r = await runScoped({ dev: FINDING_REPORT });
  assert.equal(r.code, EXIT.FINDING);
  assert.deepEqual(
    r.calls.map((c) => c.omitDev),
    [false]
  );
});

test('SCA-1: живой список исключений — данные, а не флаг', () => {
  assert.ok(Object.isFrozen(EXCEPTIONS));
  for (const e of EXCEPTIONS) {
    assert.ok(Object.isFrozen(e));
    assert.match(e.id, /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/, 'id — адвайзори GHSA');
    assert.ok(typeof e.package === 'string' && e.package.length > 0, 'пакет назван');
    assert.ok(typeof e.reason === 'string' && e.reason.length > 0, 'причина есть');
    assert.doesNotMatch(e.reason, /[\r\n]/, 'причина — одной строкой');
    assert.match(e.review, /^\d{4}-\d{2}-\d{2}$/, 'дата пересмотра YYYY-MM-DD');
    const d = new Date(`${e.review}T00:00:00Z`);
    assert.equal(d.toISOString().slice(0, 10), e.review, 'дата пересмотра существует');
  }
});
