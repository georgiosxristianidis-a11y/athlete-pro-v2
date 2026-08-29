/**
 * Гард CEIL-1: потолок правится отдельным PR, а не тем же, что в него упёрся.
 *
 * Факт, ради которого заведён (разбор 2026-08-29): PR #276 добавил
 * `test/e2e/backup-restore.spec.js` — 401-й отслеживаемый файл при потолке 400,
 * и коммит `a9b0d5b` в том же PR поднял потолок до 401. Гейт остался зелёным,
 * решение «потолок можно двигать» никто не принимал — оно проехало приложением
 * к фиче. Это ровно тот класс, ради которого H-4 и заводился: сам счётчик
 * появился после уборки 4222 файлов, накопленных по одному, потому что ничего
 * не краснело в момент появления.
 *
 * Проверяется не «менялся ли файл гарда» (тогда любой рефакторинг был бы
 * находкой), а «изменилось ли ЗНАЧЕНИЕ потолка И трогает ли эта же ветка то,
 * что он меряет». Поднять потолок отдельной веткой — законно и зелено:
 * решение остаётся видимым и обсуждаемым, а не спрятанным в диффе фичи.
 *
 * Осознанный обход: CEILING_OK=1 npm test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAIN } from '../scripts/drift-core.mjs';
import { branchScope, fileAtRef } from '../scripts/branch-scope.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Потолки репозитория и то, что каждый из них меряет.
 *
 * Предикат отвечает на один вопрос: «эта ветка трогает то, что счётчик
 * считает?» Список ручной намеренно — автоматика по имени константы связала бы
 * потолок с произвольным файлом и давала бы находки там, где связи нет.
 */
const CEILINGS = [
  {
    file: 'test/repo-hygiene.test.js',
    name: 'MAX_TRACKED_FILES',
    measures: 'состав репозитория (git ls-files)',
    // Счётчик меряет число файлов — двигают его только появление и исчезновение.
    touched: (scope) => [...scope.added, ...scope.deleted],
  },
  {
    file: 'test/repo-hygiene.test.js',
    name: 'MAX_CLAUDE_MD_LINES',
    measures: 'длину CLAUDE.md',
    touched: (scope) => scope.paths.filter((p) => p === 'CLAUDE.md'),
  },
  {
    file: 'test/repo-hygiene.test.js',
    name: 'MAX_FILE_BYTES',
    measures: 'вес файлов вне assets/',
    // Только тяжёлые: правка README в этот потолок не упирается никогда.
    touched: (scope) =>
      scope.paths.filter((p) => !p.startsWith('assets/') && fileSize(p) > 256 * 1024),
  },
  {
    file: 'scripts/check-docs-budget.mjs',
    name: "'CLAUDE.md'",
    measures: 'бюджет CLAUDE.md',
    touched: (scope) => scope.paths.filter((p) => p === 'CLAUDE.md'),
  },
  {
    file: 'scripts/check-docs-budget.mjs',
    name: "'NEXT_SESSION.md'",
    measures: 'бюджет NEXT_SESSION.md',
    touched: (scope) => scope.paths.filter((p) => p === 'NEXT_SESSION.md'),
  },
  {
    file: 'scripts/check-docs-budget.mjs',
    name: 'TOTAL',
    measures: 'бюджет горячего пути целиком',
    touched: (scope) => scope.paths.filter((p) => p === 'CLAUDE.md' || p === 'NEXT_SESSION.md'),
  },
];

function fileSize(rel) {
  try {
    return readFileSync(path.join(REPO_ROOT, rel)).length;
  } catch {
    return 0;
  }
}

/**
 * Правая часть объявления потолка как строка — `401`, `1024 * 1024`, `3000`.
 * Сравниваем именно её: любое изменение значения (рост, снижение, переход на
 * выражение) — это решение о потолке, а не рефакторинг вокруг него.
 */
function readCeiling(text, name) {
  if (!text) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Обрыв по `,`/`;`/`}`/переводу строки: в однострочном объекте иначе прилипает
  // закрывающая скобка, и значение «5000 }» не равно тому же «5000» из базы.
  const re = new RegExp(`${escaped}\\s*[:=]\\s*([^,;}\\n]+)`);
  return text.match(re)?.[1]?.trim() ?? null;
}

/**
 * Ядро проверки, отделённое от git: сравнивает значения потолков и спрашивает
 * предикат, трогает ли та же ветка измеряемое. Чистое — чтобы обе ветки решения
 * («поднял вместе с работой» и «поднял отдельной веткой») проверялись тестом, а
 * не только той, которую удалось разыграть на живом дереве.
 *
 * @param {{paths: string[], added: string[], deleted: string[]}} scope
 * @param {(file: string) => string | null} readNow
 * @param {(file: string) => string | null} readBase
 */
export function findViolations(scope, readNow, readBase, ceilings = CEILINGS) {
  const findings = [];
  for (const ceiling of ceilings) {
    const now = readCeiling(readNow(ceiling.file), ceiling.name);
    const before = readCeiling(readBase(ceiling.file), ceiling.name);

    // Потолка нет в базе (новый гард) или он исчез — это не «поднятие», судить нечего.
    if (!now || !before || now === before) continue;

    const collides = ceiling.touched(scope);
    if (collides.length === 0) continue;

    const shown =
      collides.slice(0, 5).join(', ') + (collides.length > 5 ? `, … (+${collides.length - 5})` : '');
    findings.push(
      `${ceiling.name} (${ceiling.file}): ${before} → ${now}, ` +
        `и та же ветка меняет ${ceiling.measures}: ${shown}`,
    );
  }
  return findings;
}

test('потолки: поднятие потолка не едет тем же PR, что в него упёрся', (t) => {
  if (process.env.CEILING_OK === '1') {
    t.diagnostic('CEIL-1 отключён через CEILING_OK=1');
    return;
  }

  const scope = branchScope({ cwd: REPO_ROOT });
  if ('skip' in scope) {
    t.diagnostic(`CEIL-1 пропущен: ${scope.skip}`);
    return;
  }

  const findings = findViolations(
    scope,
    (file) => readFileSafe(file),
    (file) => fileAtRef(MAIN, file, { cwd: REPO_ROOT }),
  );

  assert.deepEqual(
    findings,
    [],
    `Потолок поднят тем же PR, который в него упёрся — значит решение о потолке ` +
      `никто не принимал, оно проехало приложением к работе:\n  ${findings.join('\n  ')}\n\n` +
      `  Лечение: поднять потолок отдельной веткой и влить её первой — тогда цифра ` +
      `видна в своём PR. Обход, если поднятие и есть работа: CEILING_OK=1.`,
  );
});

/**
 * Карта потолков обязана попадать по живым объявлениям. Без этой проверки
 * опечатка в имени константы или переезд потолка в другой файл делает гард
 * вечнозелёным — он бы не «не нашёл нарушений», он бы не нашёл сам потолок.
 */
test('потолки: каждый сторожимый потолок читается из своего файла', () => {
  const blind = CEILINGS.filter((c) => readCeiling(readFileSafe(c.file), c.name) === null).map(
    (c) => `${c.name} в ${c.file}`,
  );

  assert.deepEqual(
    blind,
    [],
    `Потолок из карты не найден в файле — гард на него слеп: ${blind.join(', ')}`,
  );
});

test('потолки: отдельная ветка с одним лишь потолком — зелёная', () => {
  const ceiling = CEILINGS.find((c) => c.name === 'MAX_TRACKED_FILES');
  const now = () => 'const MAX_TRACKED_FILES = 440;';
  const base = () => 'const MAX_TRACKED_FILES = 401;';

  const alone = { paths: ['test/repo-hygiene.test.js'], added: [], deleted: [] };
  assert.deepEqual(
    findViolations(alone, now, base, [ceiling]),
    [],
    'поднять потолок отдельной веткой — законный ход, гард обязан молчать',
  );

  const withWork = {
    paths: ['test/repo-hygiene.test.js', 'test/e2e/backup-restore.spec.js'],
    added: ['test/e2e/backup-restore.spec.js'],
    deleted: [],
  };
  assert.equal(
    findViolations(withWork, now, base, [ceiling]).length,
    1,
    'сценарий PR #276: потолок и новый файл в одной ветке обязаны краснеть',
  );

  const untouched = { paths: ['js/app.js'], added: [], deleted: [] };
  assert.deepEqual(
    findViolations(untouched, base, base, [ceiling]),
    [],
    'потолок не менялся — находки быть не может',
  );
});

test('потолки: значение читается целиком, включая выражение', () => {
  const text = 'const MAX_A = 401;\nconst MAX_B = 1024 * 1024;\nconst O = { "k.md": 3000, T: 5000 };';

  assert.equal(readCeiling(text, 'MAX_A'), '401');
  assert.equal(readCeiling(text, 'MAX_B'), '1024 * 1024', 'выражение обязано читаться целиком');
  assert.equal(readCeiling(text, '"k.md"'), '3000', 'ключ объекта — такой же потолок');
  assert.equal(readCeiling(text, 'T'), '5000');
  assert.equal(readCeiling(text, 'MAX_MISSING'), null);
});

function readFileSafe(rel) {
  try {
    return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}
