#!/usr/bin/env node
// Гард SCA (карточка SCA-1) — блокирует пуш и мёрж на High/Critical в зависимостях.
//
// ПОЧЕМУ НЕ `npm audit` НАПРЯМУЮ. У `npm audit` один ненулевой код выхода на два
// разных события: «нашёл уязвимости» и «не смог проверить». Пока реестр отвечает,
// разницы не видно. 2026-09-19 её стало видно сразу везде: эндпоинт
// `/-/npm/v1/security/advisories/bulk` отдавал 503, npm откатывался на legacy
// `/-/npm/v1/security/audits/quick`, а тот — 400 «Invalid package tree, run npm
// install to rebuild your package-lock.json». Текст у 400 generic: он приходил и
// на временный проект с одной зависимостью, то есть про НАШ lock не говорил
// ничего. Гард же честно повторял заученное: «❌ [SCA Block] High or Critical
// vulnerabilities found» — и врал дважды, про находку и про её причину.
//
// Цена вранья измеримая: шаг `Security audit (high+)` стоит внутри обязательного
// job `test`, поэтому авария реестра заморозила мёржи во всём репозитории. Ни
// один PR не мог влиться, пока чинится чужой сервер.
//
// ЧТО ЗДЕСЬ СДЕЛАНО. Вердикт выносится по СОДЕРЖИМОМУ отчёта, а не по коду
// выхода: `npm audit --json` при успехе отдаёт `metadata.vulnerabilities` со
// счётчиками, при сбое транспорта — объект HTTP-ошибки (`statusCode`, `uri`,
// `body`) либо вообще не JSON. Нет счётчиков — значит проверки НЕ БЫЛО, и это
// отдельный вердикт `unavailable`, а не находка.
//
// `unavailable` не блокирует. Недоступный реестр — не уязвимость, а отсутствие
// данных, и держать на нём мёржи всего репозитория нельзя. Молчать при этом
// тоже нельзя: в CI уходит warning-аннотация (видна в чеках PR), в терминал —
// баннер с причиной и HTTP-статусом. Нужен жёсткий режим (релизный прогон,
// ручная перепроверка) — `SCA_STRICT=1`, тогда «не смог проверить» = блок.
//
// Слоёв два, намеренно, как у гарда префикса: pre-push (ловит до пуша, без dev-
// зависимостей — как на проде) и шаг в обязательном job `test` (недрейфующий
// слой, с dev-зависимостями: в CI бежит и то, что стоит только у разработчика).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STRICT_ENV = 'SCA_STRICT';

/** Уровни, на которых гард блокирует. Порог `--audit-level=high` словами. */
export const BLOCKING_LEVELS = ['critical', 'high'];

/** Потолок ожидания реестра: полный airgap не должен висеть минутами. */
const AUDIT_TIMEOUT_MS = 90_000;

/**
 * Вырезает JSON из вывода. `npm notice` и `npm warn` уходят в stderr, но
 * экзотическая конфигурация (`--loglevel`, обёртки CI) может подмешать их в
 * stdout — поэтому не доверяем краям, а берём от первой `{` до последней `}`.
 * @param {string} stdout
 * @returns {unknown|null} `null` = разобрать не удалось
 */
export function parseReport(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return null;
  const candidates = [raw];
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first > 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* следующий кандидат */
    }
  }
  return null;
}

/**
 * Счётчики уязвимостей, если в объекте действительно лежит отчёт аудита.
 * Требуем именно числа: объект HTTP-ошибки со своим `body` сюда не пролезет.
 * @param {unknown} report
 * @returns {Record<string, number>|null}
 */
export function countsOf(report) {
  const counts = /** @type {any} */ (report)?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object') return null;
  const known = BLOCKING_LEVELS.filter((level) => typeof counts[level] === 'number');
  if (known.length !== BLOCKING_LEVELS.length) return null;
  return counts;
}

/** Имена пакетов с блокирующей severity — чтобы отчёт называл виновных. */
export function offendersOf(report) {
  const vulns = /** @type {any} */ (report)?.vulnerabilities;
  if (!vulns || typeof vulns !== 'object') return [];
  return Object.entries(vulns)
    .filter(([, v]) => BLOCKING_LEVELS.includes(/** @type {any} */ (v)?.severity))
    .map(([name, v]) => `${name} (${/** @type {any} */ (v).severity})`)
    .sort();
}

/**
 * Одной строкой: почему проверки не было. Пустой результат недопустим —
 * «не смог проверить» без причины неотличим от отмазки.
 * @param {{ stdout?: string, stderr?: string, error?: Error|null, signal?: string|null }} res
 */
export function reasonOf(res) {
  if (res.error) return `npm не запустился: ${res.error.message}`;
  if (res.signal) return `прогон убит сигналом ${res.signal} (потолок ${AUDIT_TIMEOUT_MS / 1000} с)`;

  const report = parseReport(res.stdout);
  const status = /** @type {any} */ (report)?.statusCode;
  const uri = /** @type {any} */ (report)?.uri;
  if (status) return `реестр ответил ${status}${uri ? ` на ${uri}` : ''}`;

  // Полезная строка у npm — не последняя. Хвост занимают «npm error audit
  // endpoint returned an error» и путь к debug-логу: и то и другое одинаково
  // для любой причины. Транспорт называет себя выше, в `npm warn audit request
  // to … failed, reason: connect ECONNREFUSED`.
  const lines = String(res.stderr || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('npm notice') && !/A complete log of this run/i.test(s));
  const transport = lines.find((s) => /reason:|E[A-Z]{4,}|failed|timed? ?out/i.test(s));
  return transport || lines[0] || 'npm audit не вернул отчёта и не назвал причину';
}

/**
 * Вердикт по сырому результату запуска `npm audit --json`.
 *
 * Порядок ветвей важен: отчёт СО счётчиками судится первым и не может быть
 * списан в `unavailable` из-за шума в stderr — иначе достаточно было бы
 * предупреждения на выводе, чтобы находка растворилась.
 *
 * @param {{ stdout?: string, stderr?: string, status?: number|null, error?: Error|null, signal?: string|null }} res
 * @returns {{ verdict: 'clean'|'vulnerable'|'unavailable', counts?: Record<string, number>, offenders?: string[], reason?: string }}
 */
export function classify(res = {}) {
  const report = parseReport(res.stdout);
  const counts = countsOf(report);

  if (counts) {
    const blocking = BLOCKING_LEVELS.reduce((sum, level) => sum + counts[level], 0);
    return blocking > 0
      ? { verdict: 'vulnerable', counts, offenders: offendersOf(report) }
      : { verdict: 'clean', counts };
  }

  return { verdict: 'unavailable', reason: reasonOf(res) };
}

/** Запуск `npm audit --json`. Отдельной функцией — тесты подменяют её стабом. */
export function runAudit({ omitDev = false, cwd } = {}) {
  const args = ['audit', '--json', '--fetch-retries=1', '--fetch-timeout=15000'];
  if (omitDev) args.push('--omit=dev');
  const res = spawnSync('npm', args, {
    encoding: 'utf8',
    cwd,
    shell: process.platform === 'win32',
    timeout: AUDIT_TIMEOUT_MS,
  });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status, error: res.error, signal: res.signal };
}

/**
 * Warning-аннотация GitHub: зелёный шаг обязан объяснить в UI чеков, почему он
 * зелёный. Аннотация однострочная — переводы строк кодируются `%0A`.
 */
function annotate(env, out, message) {
  if (env.GITHUB_ACTIONS !== 'true') return;
  out.log(`::warning title=SCA не выполнен::${message.replace(/\n/g, '%0A')}`);
}

/**
 * @param {{ argv?: string[], env?: Record<string, string|undefined>, out?: { log: Function, error: Function }, audit?: Function, cwd?: string }} [opts]
 */
export function run(opts = {}) {
  const argv = opts.argv ?? process.argv.slice(2);
  const env = opts.env ?? process.env;
  const out = opts.out ?? console;
  const audit = opts.audit ?? runAudit;
  const omitDev = argv.includes('--omit-dev');

  const scope = omitDev ? 'production-зависимости' : 'все зависимости (вкл. dev)';
  out.log(`[SCA] npm audit — ${scope}, порог ${BLOCKING_LEVELS.join('/')}...`);

  const result = classify(audit({ omitDev, cwd: opts.cwd }));

  if (result.verdict === 'clean') {
    out.log('✅ [SCA Pass] High/Critical не найдено.');
    return 0;
  }

  if (result.verdict === 'vulnerable') {
    const blocking = BLOCKING_LEVELS.map((l) => `${l}: ${result.counts[l]}`).join(', ');
    out.error(`❌ [SCA Block] Найдены уязвимости в зависимостях (${blocking}).`);
    for (const name of result.offenders ?? []) out.error(`   ${name}`);
    out.error('   npm audit fix — или обновить пакет вручную; подробности: npm audit');
    return 1;
  }

  const banner = `Реестр недоступен — проверки НЕ БЫЛО: ${result.reason}`;
  out.error(`⚠️  [SCA Unknown] ${banner}`);
  out.error('   Это не вердикт «чисто»: аудит не выполнен, данных об уязвимостях нет.');
  annotate(env, out, `${banner}. Шаг зелёный, но зависимости не проверены.`);

  if (env[STRICT_ENV] === '1') {
    out.error(`   ${STRICT_ENV}=1 — «не смог проверить» засчитано как блок.`);
    return 1;
  }
  out.error(`   Пуш и мёрж не блокируются. Жёсткий режим: ${STRICT_ENV}=1`);
  return 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  process.exit(run());
}
