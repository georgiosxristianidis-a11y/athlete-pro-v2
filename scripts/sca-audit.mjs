#!/usr/bin/env node
// Гард SCA (карточка AGENT-10) — отличает НАХОДКУ от ОТКАЗА ПРОВЕРКИ.
//
// Мина 2026-09-19: registry.npmjs.org ответил 503 на bulk-эндпоинт
// (`/-/npm/v1/security/advisories/bulk`), npm откатился на отставной quick
// (`/-/npm/v1/security/audits/quick`), и тот вернул 400 с текстом «Invalid
// package tree, run npm install to rebuild your package-lock.json». Текст —
// ложь сервиса: тот же 400 ловит чистый скретч-проект с одним express, а
// package-lock.json репозитория цел. Наружу это выходило одним битом «npm audit
// exit 1», и обе точки, где SCA спрашивают, читали его как «найдены
// уязвимости»:
//   - `.githooks/pre-push` печатал «High or Critical vulnerabilities found» и
//     резал ЛЮБОЙ пуш в проекте;
//   - шаг `Security audit (high+)` в обязательном job `test` красил чек, то
//     есть мёрж был закрыт для всех веток сразу (PR #393).
// Цена ложного блока тут не минута, а `git push --no-verify`, который снимает
// разом все четыре гарда pre-push, — ровно то, чем пришлось пушить PR #393.
//
// Поэтому исходов три, а не два:
//   clean       — отчёт получен, High/Critical нет            → exit 0
//   finding     — отчёт получен, High/Critical есть           → exit 1
//   unavailable — отчёта НЕТ (сервис, сеть, нечитаемый ответ) → exit 0 + громкий текст
//
// Политика третьего исхода (решение Gio, 2026-09-19): предупредить и
// пропустить. Отказ сервиса npm не должен морозить ни пуши, ни очередь мёржей;
// непроверенность произносится вслух — и в хуке, и аннотацией в CI. Обратный
// режим оставлен флагом `--on-unavailable=fail`, менять политику им, а не
// переписыванием гарда.
//
// Третий режим `--on-unavailable=signal` (exit 3) нужен вызывающему, который
// обязан ОТЛИЧИТЬ пропуск от чистого отчёта: pre-push печатает напоминание
// последней строкой, когда остальной вывод push уже уехал вверх. На общем нуле
// хук заканчивался бы бодрым «Security Pass» на непроверенных зависимостях —
// та же ложь, ради которой заведена карточка, только с другой стороны.
//
// Осознанный обход НАХОДКИ: SCA_OK=1 git push. До этой карточки своего обхода у
// SCA не было, и единственным способом протащить пуш мимо него был --no-verify.
//
// Слоёв два: pre-push (`--omit-dev`, как было — production-зависимости) и шаг в
// job `test` (с dev-зависимостями: цепочку stylelint → postcss ловит только он,
// кейс nanoid 3.3.17).
//
// Узкие исключения (карточка SCA-1) — список EXCEPTIONS ниже: данные, а не флаг.
// Условия, при которых запись действует, гард проверяет сам на каждом прогоне.

import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BYPASS_ENV = 'SCA_OK';

/** Уровни, которые блокируют пуш. Совпадает с прежним `--audit-level=high`. */
export const BLOCK_LEVELS = ['high', 'critical'];

export const OUTCOME = {
  CLEAN: 'clean',
  FINDING: 'finding',
  UNAVAILABLE: 'unavailable',
};

/** Причины исхода `unavailable` — от них зависит только текст, не решение. */
export const REASON = {
  ENDPOINT: 'endpoint',
  NETWORK: 'network',
  NO_LOCKFILE: 'no-lockfile',
  UNPARSEABLE: 'unparseable',
};

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Коды, означающие «сети нет вовсе»: до хоста не дошли — не дозвонились, не
 * разрешили имя, не нашли маршрут. Повтором не лечатся: за 2.5 с ни DNS, ни
 * маршрут не появятся, а пуш ждёт живой человек.
 *
 * Разделение появилось вместе со снятием пинга из `.githooks/pre-push`. Пинг был
 * ложным признаком доступности АУДИТА (ICMP отвечал в день, когда эндпоинт был
 * мёртв), но одну полезную работу делал — отсекал оффлайн за две секунды. Её и
 * возвращает этот список, только по настоящему ответу npm, а не по ICMP.
 */
export const OFFLINE_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'];

/**
 * Сетевые коды npm/undici: ответа не было вовсе. Всё, что не в OFFLINE_CODES, —
 * сбой на живом канале (оборванный сокет, таймаут), он повтор оправдывает.
 */
const NETWORK_CODES = [
  ...OFFLINE_CODES,
  'ECONNRESET',
  'ETIMEDOUT',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
  'FETCH_ERROR',
];

function parseJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Отчёт ли это вообще. У отчёта npm всегда есть карта `vulnerabilities`. */
function isReport(json) {
  return Boolean(json && typeof json === 'object' && json.vulnerabilities !== undefined);
}

function countFromReport(report) {
  const meta = report?.metadata?.vulnerabilities;
  const entries = Object.entries(report?.vulnerabilities ?? {});
  const packages = entries
    .filter(([, v]) => BLOCK_LEVELS.includes(v?.severity))
    .map(([name, v]) => `${name} (${v.severity})`);

  if (meta && typeof meta === 'object') {
    return {
      high: Number(meta.high || 0),
      critical: Number(meta.critical || 0),
      total: Number(meta.total || 0),
      packages,
    };
  }
  // Отчёт без metadata (старый формат `auditReportVersion: 1`) — считаем по карте.
  const high = entries.filter(([, v]) => v?.severity === 'high').length;
  const critical = entries.filter(([, v]) => v?.severity === 'critical').length;
  return { high, critical, total: entries.length, packages };
}

/**
 * Единственное место, где решается «находка или отказ». Чистая функция: на вход
 * то, что вернул процесс, на выход — вердикт и текст причины.
 *
 * @param {{ code: number|null, stdout: string, stderr: string }} result
 * @returns {{ outcome: string, reason?: string, detail?: string, counts?: object }}
 */
export function classify(result) {
  const { code, stdout = '', stderr = '' } = result ?? {};
  const json = parseJson(stdout);

  if (isReport(json)) {
    const counts = countFromReport(json);
    const blocking = counts.high + counts.critical;
    // Отчёт едет дальше целиком: исключения (SCA-1) сводят записи к адвайзори
    // по цепочке `via`, а её в counts нет.
    return { outcome: blocking > 0 ? OUTCOME.FINDING : OUTCOME.CLEAN, counts, report: json };
  }

  // Дальше — отчёта нет. Разбираем ТОЛЬКО ради честного текста: решение для всех
  // причин одно.
  const text = `${stdout}\n${stderr}`;
  const errCode = String(json?.error?.code ?? json?.code ?? '');

  if (errCode === 'EAUDITNOLOCK' || /EAUDITNOLOCK/.test(text)) {
    return {
      outcome: OUTCOME.UNAVAILABLE,
      reason: REASON.NO_LOCKFILE,
      detail: 'нет package-lock.json — audit нечего проверять',
    };
  }

  // Порядок здесь не косметика: npm печатает «audit endpoint returned an error»
  // и тогда, когда до эндпоинта вообще не дозвонились (ECONNREFUSED). Статус-код
  // — единственное доказательство, что сервис ответил; всё остальное сперва
  // просеивается на сетевые коды, иначе гард врёт причиной ровно так же, как
  // registry соврал про «Invalid package tree».
  const statusCode = json?.statusCode ?? json?.body?.statusCode;
  if (statusCode) {
    const uri = json?.uri ? ` ${json.uri}` : '';
    const retired = /This endpoint is being retired/.test(text)
      ? '; npm уже откатывался на отставной quick-эндпоинт'
      : '';
    return {
      outcome: OUTCOME.UNAVAILABLE,
      reason: REASON.ENDPOINT,
      detail: `audit-эндпоинт registry ответил ${statusCode}${uri}${retired}`,
    };
  }

  const network = NETWORK_CODES.find((c) => errCode === c || new RegExp(`\\b${c}\\b`).test(text));
  if (network) {
    return {
      outcome: OUTCOME.UNAVAILABLE,
      reason: REASON.NETWORK,
      // Код кладём полем, а не только в текст: решение о повторе судит по нему,
      // и разбирать собственную строку обратно регекспом было бы вторым
      // источником правды.
      code: network,
      detail: `до registry не дозвонились (${network})`,
    };
  }

  if (/audit endpoint returned an error/.test(text)) {
    return {
      outcome: OUTCOME.UNAVAILABLE,
      reason: REASON.ENDPOINT,
      detail: 'audit-эндпоинт registry ответил ошибкой без статуса',
    };
  }

  return {
    outcome: OUTCOME.UNAVAILABLE,
    reason: REASON.UNPARSEABLE,
    detail: `npm вернул нечитаемый ответ (exit ${code ?? '?'})`,
  };
}

// --- Исключения (карточка SCA-1) ---------------------------------------------
//
// Мина 2026-10-04: GHSA-vfj7-8cjw-p6xm (braces <= 3.0.3, DoS через глубоко
// вложенный паттерн) опубликован без патча, 3.0.3 — последняя версия в реестре.
// В дереве braces только через dev-цепочку stylelint → micromatch/fast-glob/
// globby, но npm метит high все пять записей, а «фикс» предлагает stylelint
// 7.7.0, на мажоры назад. Шаг CI с dev-зависимостями покраснел на самом main и
// закрыл мёрж всем веткам.
//
// Исключение — запись данных, а не флаг. Флаг глушит всё, запись снимает один
// адвайзори и только пока гард сам подтверждает три условия. Сломалось любое —
// находка снова обычная, шаг красный:
//   1. адвайзори нет в прогоне --omit-dev — пакет не дошёл до production-дерева;
//      прогон не удался — условие не доказано, исключение не действует;
//   2. патча нет — у носителя адвайзори и у пропускаемой записи `fixAvailable`
//      не `true` и не объект с `isSemVerMajor: false` (неломающий фикс, см.
//      hasPatch). Выйдет braces 3.0.4 → npm скажет «патч есть» → чинить локом;
//   3. дата пересмотра (UTC) ещё не наступила; в сам этот день — красный.
// Транзитивные записи npm (в `via` только имена пакетов) сводятся к корням по
// цепочке `via`. Запись пропускается, только если ВСЕ её high/critical корни —
// действующие исключения; один чужой high-корень — блок.
// Исключение не молчит: строка `[SCA Exception]` в выводе, в CI ещё `::warning`.

/**
 * Список исключений. Запись: адвайзори GHSA, пакет, в котором он сидит, причина
 * одной строкой и дата пересмотра YYYY-MM-DD.
 */
export const EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: 'GHSA-vfj7-8cjw-p6xm',
    package: 'braces',
    reason:
      'DoS через вложенный паттерн; braces только в dev-цепочке stylelint, паттерны — наши CSS-глобы, в бандл не попадает; патча нет',
    review: '2026-11-04',
  }),
]);

/** Уровни ниже порога блока: такой корень не блокирует и исключения не требует. */
const NON_BLOCKING_LEVELS = ['info', 'low', 'moderate'];

/**
 * Патч есть — находку чинит неломающий апдейт, исключению тут не место
 * (решение LEAD 04.10). `true` — обычный `npm audit fix`; объект с
 * `isSemVerMajor: false` — неломающая версия пакета. Объект с
 * `isSemVerMajor: true` — откат на мажоры (живой случай 04.10: stylelint
 * 7.7.0), патчем не считается.
 */
function hasPatch(fixAvailable) {
  return (
    fixAvailable === true ||
    Boolean(
      fixAvailable && typeof fixAvailable === 'object' && fixAvailable.isSemVerMajor === false
    )
  );
}

const GHSA_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Адвайзори в `via` — объект; строка там — имя пакета, через который он пришёл. */
function advisoryRoot(via, fallbackName) {
  const m = String(via?.url ?? '').match(GHSA_RE);
  return {
    id: m ? m[0].toLowerCase() : null,
    name: via?.name ?? via?.dependency ?? fallbackName,
    severity: via?.severity ?? 'unknown',
  };
}

function matchesException(root, exc) {
  return root.id !== null && root.id === String(exc.id).toLowerCase() && root.name === exc.package;
}

/**
 * Корни записи — адвайзори, к которым она сводится по цепочке `via`. Имя, которого
 * нет в карте, и запись без `via` дают корень без id: свести некуда — исключить
 * нечем, такой корень блокирует.
 */
function rootsOf(name, vulns, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const via = Array.isArray(vulns[name]?.via) ? vulns[name].via : [];
  if (!via.length) return [{ id: null, name, severity: 'unknown' }];
  return via.flatMap((v) =>
    typeof v === 'string' ? rootsOf(v, vulns, seen) : [advisoryRoot(v, name)]
  );
}

/** Записи, в `via` которых адвайзори исключения лежит объектом. */
function carriersOf(report, exc) {
  return Object.entries(report?.vulnerabilities ?? {}).filter(([name, entry]) =>
    (Array.isArray(entry?.via) ? entry.via : []).some(
      (v) => typeof v !== 'string' && matchesException(advisoryRoot(v, name), exc)
    )
  );
}

/** Есть ли адвайзори (или сам пакет) в отчёте production-дерева. */
function inProdTree(prodReport, exc) {
  const vulns = prodReport?.vulnerabilities ?? {};
  if (Object.hasOwn(vulns, exc.package)) return true;
  return Object.entries(vulns).some(([name, entry]) =>
    (Array.isArray(entry?.via) ? entry.via : []).some(
      (v) => typeof v !== 'string' && advisoryRoot(v, name).id === String(exc.id).toLowerCase()
    )
  );
}

/** Исключения, к которым сводится хоть одна блокирующая запись отчёта. */
export function exceptionCandidates(report, exceptions = EXCEPTIONS) {
  const vulns = report?.vulnerabilities ?? {};
  const roots = Object.entries(vulns)
    .filter(([, entry]) => BLOCK_LEVELS.includes(entry?.severity))
    .flatMap(([name]) => rootsOf(name, vulns));
  return exceptions.filter((exc) => roots.some((r) => matchesException(r, exc)));
}

/** Почему исключение НЕ действует; null — все три условия подтверждены. */
function exceptionBroken(exc, { report, prod, today }) {
  if (!isIsoDate(exc.review) || today >= exc.review) {
    return `дата пересмотра ${exc.review} наступила — пересмотреть или снять запись`;
  }
  if (carriersOf(report, exc).some(([, entry]) => hasPatch(entry?.fixAvailable))) {
    return 'патч есть (npm: неломающий fixAvailable) — чинить обновлением лока, а не исключением';
  }
  if (!prod?.report) {
    return `production-дерево не проверено (${prod?.detail ?? 'нет отчёта --omit-dev'})`;
  }
  if (inProdTree(prod.report, exc)) return 'адвайзори есть в production-дереве (прогон --omit-dev)';
  return null;
}

/**
 * Чистая функция: вердикт-находка + отчёт production-дерева → вердикт после
 * исключений. Не-находка возвращается как есть.
 *
 * @param {object} verdict результат classify() на прогоне гарда
 * @param {{ prod?: object, now?: Date, exceptions?: object[] }} [ctx]
 *   prod — classify() прогона --omit-dev (в режиме --omit-dev — сам verdict)
 */
export function applyExceptions(verdict, { prod, now = new Date(), exceptions = EXCEPTIONS } = {}) {
  if (verdict?.outcome !== OUTCOME.FINDING || !verdict.report) return verdict;
  const touched = exceptionCandidates(verdict.report, exceptions);
  if (!touched.length) return verdict;

  const today = new Date(now).toISOString().slice(0, 10);
  const active = [];
  const rejected = [];
  for (const exc of touched) {
    const why = exceptionBroken(exc, { report: verdict.report, prod, today });
    if (why) rejected.push({ id: exc.id, package: exc.package, why });
    else active.push(exc);
  }

  const vulns = verdict.report.vulnerabilities ?? {};
  const excused = [];
  const blocking = [];
  for (const [name, entry] of Object.entries(vulns)) {
    if (!BLOCK_LEVELS.includes(entry?.severity)) continue;
    const roots = rootsOf(name, vulns).filter((r) => !NON_BLOCKING_LEVELS.includes(r.severity));
    const covered =
      roots.length > 0 &&
      !hasPatch(entry.fixAvailable) &&
      roots.every((r) => active.some((exc) => matchesException(r, exc)));
    (covered ? excused : blocking).push({ name, severity: entry.severity, roots });
  }

  const drop = (level) => excused.filter((e) => e.severity === level).length;
  const prev = verdict.counts ?? {};
  const counts = {
    ...prev,
    high: Math.max(0, Number(prev.high || 0) - drop('high')),
    critical: Math.max(0, Number(prev.critical || 0) - drop('critical')),
    packages: blocking.map((e) => `${e.name} (${e.severity})`),
  };

  const applied = active
    .map((exc) => ({
      id: exc.id,
      package: exc.package,
      reason: exc.reason,
      review: exc.review,
      packages: excused
        .filter((e) => e.roots.some((r) => matchesException(r, exc)))
        .map((e) => e.name),
    }))
    .filter((a) => a.packages.length > 0);

  return {
    ...verdict,
    outcome: counts.high + counts.critical > 0 ? OUTCOME.FINDING : OUTCOME.CLEAN,
    counts,
    exceptions: applied,
    exceptionsRejected: rejected,
  };
}

/** Один прогон `npm audit --json`. Вынесен отдельно — в тестах подменяется. */
export function auditOnce({ omitDev = false } = {}) {
  const args = ['audit', '--json'];
  if (omitDev) args.push('--omit=dev');
  const res = spawnSync(NPM, args, {
    encoding: 'utf8',
    // Windows: npm — это npm.cmd, а Node с 20.12 отказывается запускать .cmd без shell.
    shell: process.platform === 'win32',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error && !res.stdout && !res.stderr) {
    return { code: res.status ?? 1, stdout: '', stderr: String(res.error.message || res.error) };
  }
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Что делать с исходом `unavailable`: пропустить, сообщить кодом 3 или заблокировать. */
export const ON_UNAVAILABLE = { PASS: 'pass', SIGNAL: 'signal', FAIL: 'fail' };

/** Коды выхода. 3 — «проверка не выполнена», а не «нашлось на троечку». */
export const EXIT = { CLEAN: 0, FINDING: 1, UNAVAILABLE: 3 };

export function parseArgs(argv = []) {
  const opts = {
    omitDev: false,
    retries: 2,
    retryDelay: 2500,
    onUnavailable: ON_UNAVAILABLE.PASS,
  };
  for (const arg of argv) {
    if (arg === '--omit-dev') opts.omitDev = true;
    else if (arg.startsWith('--on-unavailable=')) {
      const mode = arg.slice(17);
      if (Object.values(ON_UNAVAILABLE).includes(mode)) opts.onUnavailable = mode;
    } else if (arg.startsWith('--retries=')) opts.retries = Math.max(0, Number(arg.slice(10)) || 0);
    else if (arg.startsWith('--retry-delay='))
      opts.retryDelay = Math.max(0, Number(arg.slice(14)) || 0);
  }
  return opts;
}

/** Строки исключений: пропущенное и непрошедшее проверку — всегда вслух. */
function exceptionLines(verdict) {
  const lines = (verdict.exceptions ?? []).map(
    (e) =>
      `[SCA Exception] ${e.id} (${e.package}) пропущен до ${e.review}: ${e.reason}. Записи: ${e.packages.join(', ')}.`
  );
  for (const e of verdict.exceptionsRejected ?? []) {
    lines.push(`   Исключение ${e.id} (${e.package}) не действует: ${e.why}.`);
  }
  return lines;
}

/** Текст вердикта. Строки блока намеренно те же, что печатал pre-push до карточки. */
export function formatLines(verdict, opts = {}) {
  const scope = opts.omitDev ? 'production-зависимостях' : 'зависимостях (включая dev)';

  if (verdict.outcome === OUTCOME.CLEAN) {
    if (!verdict.exceptions?.length) return [`[SCA Pass] High/Critical в ${scope} не найдено.`];
    return [
      `[SCA Pass] High/Critical в ${scope} не найдено — кроме исключённых ниже.`,
      ...exceptionLines(verdict),
    ];
  }

  if (verdict.outcome === OUTCOME.FINDING) {
    const { high = 0, critical = 0, packages = [] } = verdict.counts ?? {};
    const lines = [
      '[SCA Block] Push rejected! High or Critical vulnerabilities found in production dependencies.',
      "Please run 'npm audit fix' or update the affected packages before pushing.",
      `   Найдено: critical ${critical}, high ${high} — в ${scope}.`,
    ];
    if (packages.length) lines.push(`   Пакеты: ${packages.slice(0, 5).join(', ')}`);
    lines.push(...exceptionLines(verdict));
    lines.push(`   Осознанный обход: ${BYPASS_ENV}=1 git push`);
    return lines;
  }

  return [
    `[SCA Skip] Проверка НЕ выполнена: ${verdict.detail}.`,
    '   Это отказ проверки, а не чистый результат: уязвимости остались непроверенными.',
    '   Повторить позже: npm run security:audit',
  ];
}

/** Аннотация GitHub — иначе зелёный шаг ничем не отличается от выполненной проверки. */
function annotate(verdict, out, env) {
  if (env.GITHUB_ACTIONS !== 'true') return;
  out.log(`::warning title=SCA не выполнен::${verdict.detail}. Уязвимости не проверены.`);
}

/** Исключение в CI — аннотацией: зелёный шаг с пропуском обязан отличаться от чистого. */
function annotateExceptions(verdict, out, env) {
  if (env.GITHUB_ACTIONS !== 'true') return;
  for (const e of verdict.exceptions ?? []) {
    out.log(
      `::warning title=SCA исключение ${e.id}::${e.package} пропущен до ${e.review}: ${e.reason}. Записи: ${e.packages.join(', ')}.`
    );
  }
}

/** Прогон с ретраями отказа проверки. */
async function auditWithRetries(audit, omitDev, cfg, out) {
  let verdict;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    verdict = classify(await audit({ omitDev }));
    // Ретраим только отказ проверки: находка и чистый отчёт — окончательные ответы.
    // Отсутствие лока повтором не лечится. Оффлайн — тоже: нет DNS или маршрута,
    // и за 2.5 с они не появятся, а пуша ждёт человек (см. OFFLINE_CODES).
    const retryable =
      verdict.outcome === OUTCOME.UNAVAILABLE &&
      verdict.reason !== REASON.NO_LOCKFILE &&
      !OFFLINE_CODES.includes(verdict.code);
    if (!retryable || attempt === cfg.retries) break;
    out.log(`[SCA] ${verdict.detail} — повтор ${attempt + 1}/${cfg.retries}...`);
    if (cfg.retryDelay) await sleep(cfg.retryDelay);
  }
  return verdict;
}

/**
 * @param {{ argv?: string[], env?: object, out?: { log: Function, error: Function }, audit?: Function, now?: Date, exceptions?: object[] }} [opts]
 * @returns {Promise<number>} код выхода
 */
export async function run(opts = {}) {
  const env = opts.env ?? process.env;
  const out = opts.out ?? console;
  const audit = opts.audit ?? auditOnce;
  const exceptions = opts.exceptions ?? EXCEPTIONS;
  const cfg = parseArgs(opts.argv ?? process.argv.slice(2));

  let verdict = await auditWithRetries(audit, cfg.omitDev, cfg, out);

  // Исключение (SCA-1) проверяется по production-дереву. Второй прогон — только
  // если находка вообще сводится к исключению; в режиме --omit-dev отчёт и есть
  // production-дерево, и исключение на нём не проходит по определению.
  if (
    verdict.outcome === OUTCOME.FINDING &&
    exceptionCandidates(verdict.report, exceptions).length
  ) {
    let prod = verdict;
    if (!cfg.omitDev) {
      out.log('[SCA] Находка сводится к исключению — проверяю production-дерево (--omit-dev)...');
      prod = await auditWithRetries(audit, true, cfg, out);
    }
    verdict = applyExceptions(verdict, { prod, now: opts.now ?? new Date(), exceptions });
  }

  const lines = formatLines(verdict, cfg);

  if (verdict.outcome === OUTCOME.CLEAN) {
    for (const line of lines) out.log(line);
    annotateExceptions(verdict, out, env);
    return EXIT.CLEAN;
  }

  if (verdict.outcome === OUTCOME.FINDING) {
    for (const line of lines) out.error(line);
    annotateExceptions(verdict, out, env);
    if (env[BYPASS_ENV] === '1') {
      out.error(`   ${BYPASS_ENV}=1 — находка пропущена осознанно.`);
      return EXIT.CLEAN;
    }
    return EXIT.FINDING;
  }

  for (const line of lines) out.error(line);
  annotate(verdict, out, env);
  if (cfg.onUnavailable === ON_UNAVAILABLE.FAIL) return EXIT.FINDING;
  if (cfg.onUnavailable === ON_UNAVAILABLE.SIGNAL) return EXIT.UNAVAILABLE;
  return EXIT.CLEAN;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  process.exit(await run());
}
