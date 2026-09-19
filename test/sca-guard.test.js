/**
 * Гейт для `scripts/check-sca.mjs` (карточка SCA-1): гард обязан отличать
 * «нашёл уязвимости» от «не смог проверить».
 *
 * BASELINE, который воспроизводится этим файлом. 2026-09-19 эндпоинт
 * `/-/npm/v1/security/advisories/bulk` отдавал 503, npm откатывался на legacy
 * `/-/npm/v1/security/audits/quick`, тот — 400 «Invalid package tree, run npm
 * install to rebuild your package-lock.json». Прежний гард знал только код
 * выхода `npm audit`, а он ненулевой в обоих случаях, — и печатал «❌ [SCA
 * Block] High or Critical vulnerabilities found in production dependencies».
 * Находки не было: ни одной. Текст 400 generic, он приходил и на временный
 * проект с одной зависимостью, то есть про наш lock не говорил ничего.
 *
 * Фикстура FIXTURE_400 — не выдумка по мотивам, а вывод `npm audit --json`,
 * снятый в этот день с этого репозитория (урезаны только заголовки ответа).
 *
 * ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Вердикт выносится по содержимому отчёта, поэтому:
 *  - отчёт со счётчиками судится первым и не растворяется от шума в stderr
 *    (иначе достаточно предупреждения на выводе, чтобы находка исчезла);
 *  - всё, где счётчиков нет, — `unavailable`, отдельный вердикт с причиной;
 *  - `unavailable` не блокирует, но и не молчит, а `SCA_STRICT=1` возвращает
 *    жёсткий режим.
 *
 * Сети здесь нет: `run()` принимает стаб вместо `npm audit`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, countsOf, parseReport, run, STRICT_ENV } from '../scripts/check-sca.mjs';

/** Отчёт без единой уязвимости. */
const FIXTURE_CLEAN = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    dependencies: { prod: 120, dev: 400, total: 520 },
  },
});

/** Отчёт с находками ниже порога: гард на них не блокирует. */
const FIXTURE_MODERATE = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    esbuild: { name: 'esbuild', severity: 'moderate', via: [], fixAvailable: true },
  },
  metadata: {
    vulnerabilities: { info: 1, low: 3, moderate: 2, high: 0, critical: 0, total: 6 },
  },
});

/** Отчёт с настоящей находкой — единственный случай, где гард обязан блокировать. */
const FIXTURE_HIGH = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    minimist: { name: 'minimist', severity: 'critical', via: [], fixAvailable: true },
    tar: { name: 'tar', severity: 'high', via: [], fixAvailable: false },
    esbuild: { name: 'esbuild', severity: 'moderate', via: [], fixAvailable: true },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 1, total: 3 },
  },
});

/** Живой вывод дня аварии: legacy-эндпоинт отвечает 400 на любой package tree. */
const FIXTURE_400 = JSON.stringify({
  message:
    '400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Bad Request',
  method: 'POST',
  uri: 'https://registry.npmjs.org/-/npm/v1/security/audits/quick',
  headers: { 'cf-cache-status': ['DYNAMIC'], server: ['cloudflare'] },
  statusCode: 400,
  body: {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Invalid package tree, run  npm install  to rebuild your package-lock.json',
  },
});

/** Современный эндпоинт в тот же день: 503. */
const FIXTURE_503 = JSON.stringify({
  message: '503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
  method: 'POST',
  uri: 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
  statusCode: 503,
});

/** @param {Partial<{stdout:string,stderr:string,status:number,error:Error,signal:string}>} res */
const audited = (res) => () => ({ stdout: '', stderr: '', status: 0, error: null, signal: null, ...res });

function capture() {
  const lines = [];
  return {
    out: { log: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) },
    text: () => lines.join('\n'),
  };
}

/** @param {{stdout?:string,stderr?:string,status?:number,error?:Error,signal?:string}} res */
function runWith(res, env = {}) {
  const cap = capture();
  const code = run({ argv: [], env, out: cap.out, audit: audited(res) });
  return { code, out: cap.text() };
}

test('чистый отчёт — пропуск', () => {
  const { code, out } = runWith({ stdout: FIXTURE_CLEAN, status: 0 });
  assert.equal(code, 0);
  assert.match(out, /\[SCA Pass\]/);
});

test('moderate и ниже порога не блокируют — гард отвечает на свой вопрос', () => {
  const { code, out } = runWith({ stdout: FIXTURE_MODERATE, status: 1 });
  assert.equal(code, 0, 'ненулевой код npm audit сам по себе не вердикт');
  assert.match(out, /\[SCA Pass\]/);
});

test('High/Critical в отчёте — блок, с именами пакетов', () => {
  const { code, out } = runWith({ stdout: FIXTURE_HIGH, status: 1 });
  assert.equal(code, 1);
  assert.match(out, /\[SCA Block\]/);
  assert.match(out, /minimist \(critical\)/);
  assert.match(out, /tar \(high\)/);
  assert.doesNotMatch(out, /esbuild/, 'ниже порога — не в списке виновных');
});

test('BASELINE: 400 от legacy-эндпоинта — «не смог проверить», а не находка', () => {
  const { code, out } = runWith({ stdout: FIXTURE_400, status: 1 });
  assert.doesNotMatch(out, /\[SCA Block\]/, 'прежний гард печатал здесь «найдены уязвимости»');
  assert.match(out, /\[SCA Unknown\]/);
  assert.match(out, /400/, 'причина обязана называть статус, а не быть общими словами');
  assert.match(out, /audits\/quick/, 'и адрес, по которому проверка не состоялась');
  assert.equal(code, 0, 'авария чужого сервера не морозит мёржи');
});

test('503 от bulk-эндпоинта — тот же вердикт', () => {
  const { code, out } = runWith({ stdout: FIXTURE_503, status: 1 });
  assert.equal(code, 0);
  assert.match(out, /\[SCA Unknown\]/);
  assert.match(out, /503/);
});

test('полный airgap (DNS не резолвится) — «не смог проверить», SAST решает хук', () => {
  const { code, out } = runWith({
    stdout: '',
    stderr: 'npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org failed',
    status: 1,
  });
  assert.equal(code, 0);
  assert.match(out, /\[SCA Unknown\]/);
  assert.match(out, /ENOTFOUND|network/);
});

test('причина называет транспорт, а не путь к debug-логу', () => {
  const { out } = runWith({
    stdout: '',
    stderr: [
      'npm warn audit request to https://registry.npmjs.org/-/npm/v1/security/audits/quick failed, reason: connect ECONNREFUSED 127.0.0.1:9',
      'npm error audit endpoint returned an error',
      'npm error A complete log of this run can be found in: C:\\Users\\x\\_logs\\2026-09-19T17_40_21_235Z-debug-0.log',
    ].join('\n'),
    status: 1,
  });
  assert.match(out, /ECONNREFUSED/, 'полезная строка у npm не последняя');
  assert.doesNotMatch(out, /debug-0\.log/, 'путь к логу одинаков для любой причины — он не причина');
});

test('npm не запустился — тоже не находка', () => {
  const { code, out } = runWith({ error: new Error('spawn npm ENOENT'), status: null });
  assert.equal(code, 0);
  assert.match(out, /\[SCA Unknown\]/);
  assert.match(out, /ENOENT/);
});

test('прогон убит по таймауту — причина названа сигналом', () => {
  const { code, out } = runWith({ stdout: '', signal: 'SIGTERM', status: null });
  assert.equal(code, 0);
  assert.match(out, /\[SCA Unknown\]/);
  assert.match(out, /SIGTERM/);
});

test('не-JSON на выводе — «не смог проверить», без падения', () => {
  const { code, out } = runWith({ stdout: '<html>502 Bad Gateway</html>', status: 1 });
  assert.equal(code, 0);
  assert.match(out, /\[SCA Unknown\]/);
});

test('вердикт «не смог проверить» никогда не молчит', () => {
  const { out } = runWith({ stdout: FIXTURE_400, status: 1 });
  assert.match(out, /проверки НЕ БЫЛО/i);
  assert.match(out, /не вердикт «чисто»/i, 'зелёный код обязан быть объяснён, а не подразумеваться');
});

test(`${STRICT_ENV}=1 возвращает жёсткий режим`, () => {
  const { code, out } = runWith({ stdout: FIXTURE_400, status: 1 }, { [STRICT_ENV]: '1' });
  assert.equal(code, 1);
  assert.match(out, new RegExp(STRICT_ENV));
});

test(`${STRICT_ENV}=1 не превращает чистый отчёт в блок`, () => {
  const { code } = runWith({ stdout: FIXTURE_CLEAN, status: 0 }, { [STRICT_ENV]: '1' });
  assert.equal(code, 0, 'жёсткий режим строже только к отсутствию данных');
});

test('в CI зелёный шаг оставляет warning-аннотацию', () => {
  const { code, out } = runWith({ stdout: FIXTURE_400, status: 1 }, { GITHUB_ACTIONS: 'true' });
  assert.equal(code, 0);
  const annotation = out.split('\n').find((l) => l.startsWith('::warning'));
  assert.ok(annotation, 'без аннотации пропуск виден только в логе шага, не в чеках PR');
  assert.match(
    annotation,
    /400.*зависимости не проверены/,
    'GitHub читает аннотацию построчно — весь текст обязан уместиться в одну строку'
  );
});

test('вне CI аннотация не печатается', () => {
  const { out } = runWith({ stdout: FIXTURE_400, status: 1 }, {});
  assert.doesNotMatch(out, /::warning/);
});

test('шум в stderr не списывает настоящую находку в «не смог проверить»', () => {
  const { code, out } = runWith({
    stdout: FIXTURE_HIGH,
    stderr: 'npm warn audit 503 Service Unavailable\nnpm error network timeout',
    status: 1,
  });
  assert.equal(code, 1, 'отчёт со счётчиками судится первым — это и есть защита от отмазки');
  assert.match(out, /\[SCA Block\]/);
});

test('объект HTTP-ошибки не принимается за отчёт', () => {
  assert.equal(countsOf(JSON.parse(FIXTURE_400)), null, 'у ошибки есть body, но нет счётчиков');
  assert.notEqual(countsOf(JSON.parse(FIXTURE_HIGH)), null);
});

test('отчёт с неполными счётчиками — не отчёт', () => {
  const partial = JSON.stringify({ metadata: { vulnerabilities: { high: 0 } } });
  assert.equal(countsOf(JSON.parse(partial)), null, 'нет critical — судить не по чему');
  assert.equal(classify({ stdout: partial, status: 0 }).verdict, 'unavailable');
});

test('JSON, подмешанный к тексту на stdout, всё равно разбирается', () => {
  const noisy = `npm notice endpoint retired\n${FIXTURE_HIGH}`;
  assert.notEqual(parseReport(noisy), null);
  assert.equal(classify({ stdout: noisy, status: 1 }).verdict, 'vulnerable');
});

test('пустой вывод не разбирается в отчёт', () => {
  assert.equal(parseReport(''), null);
  assert.equal(parseReport('   '), null);
});
