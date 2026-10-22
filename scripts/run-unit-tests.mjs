#!/usr/bin/env node
// Обёртка юнит-прогона (карточка GATE-DESCRIBE): `not ok` в TAP краснит прогон.
//
// Находка 17.10, Node 22.22.2: `describe()`, у которого тело бросает
// исключение, печатает `not ok 1 - <имя>`, но итог прогона — `# tests 0`,
// `# fail 0` и exit 0. Счётчик fail у node --test упавшую сборку сюиты не
// считает: сюита со всеми своими кейсами исчезает из прогона молча, `npm test`
// зелёный. Судить приходится по самому TAP, а не по коду выхода.
//
// Правило: прогон красный, если ребёнок вышел не с 0 ИЛИ в выводе есть строка
// `not ok` на любой вложенности, кроме директив `# TODO` / `# SKIP` (их node
// падением не считает и сам тянет `# TODO` на детей todo-сюиты). Раннер
// остаётся node --test; обёртка пробрасывает его вывод как есть и только читает.
//
// Глоб передаётся node, не шеллу: cmd.exe глобы не раскрывает, sh раскрыл бы
// по-своему — так одинаково на Windows и в Linux CI. Голый `node --test` без
// глоба цепляет test/e2e/*.spec.js (12 ложных `not ok`), поэтому по умолчанию —
// юнит-глоб.
//
// NODE_TEST_CONTEXT из окружения ребёнка вычищается. Его выставляет внешний
// node --test своим файлам, и вложенный node --test с ним молча пропускает
// файлы: пустой вывод, exit 0 — тот самый ложный зелёный, против которого
// обёртка. Ловит test/gate-describe.test.js: он сам бежит внутри npm test.
//
// Флаги node проходят насквозь в форме --флаг=значение:
// `npm test -- --test-name-pattern=foo`. Репортёр фиксирован — tap, его читает
// обёртка.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_GLOB = 'test/*.test.js';

/** Строка-падение TAP на любой вложенности. */
export const NOT_OK_RE = /^\s*not ok\b/;

/** Директива после имени. В именах node экранирует `#` как `\#`, голый `#` — только директива. */
const DIRECTIVE_RE = /^\s#\s*(TODO|SKIP)\b/i;

/** Сколько имён печатать в сводке; остальное — числом. */
const SUMMARY_NAMES = 10;

/**
 * Имена упавших тестов и сюит из TAP, в порядке вывода. Вложенное падение
 * тянет `not ok` и на родителя — в списке будут оба.
 */
export function findFailures(tap) {
  const names = [];
  for (const line of tap.split(/\r?\n/)) {
    if (!NOT_OK_RE.test(line)) continue;
    const rest = line.replace(/^\s*not ok\s*\d*\s*-?\s*/, '');
    const cut = rest.search(/\s#/);
    if (cut !== -1 && DIRECTIVE_RE.test(rest.slice(cut))) continue;
    const name = (cut === -1 ? rest : rest.slice(0, cut)).replace(/\\([\\#])/g, '$1').trim();
    names.push(name || '(без имени)');
  }
  return names;
}

/** Флаги node — вперёд, остальное — глобы; без глобов юнит-глоб по умолчанию. */
export function buildArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('-'));
  const globs = argv.filter((a) => !a.startsWith('-'));
  return [...flags, '--test', '--test-reporter=tap', ...(globs.length ? globs : [DEFAULT_GLOB])];
}

/** Одна строка-сводка при красном, null при зелёном. */
export function verdict(code, failures) {
  if (failures.length) {
    const shown = failures.slice(0, SUMMARY_NAMES).join(', ');
    const more = failures.length > SUMMARY_NAMES ? ` и ещё ${failures.length - SUMMARY_NAMES}` : '';
    return `run-unit-tests: КРАСНЫЙ — not ok в TAP (${failures.length}): ${shown}${more}`;
  }
  if (code !== 0) return `run-unit-tests: КРАСНЫЙ — node --test вышел с кодом ${code}`;
  return null;
}

function run(argv) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  const child = spawn(process.execPath, buildArgs(argv), {
    env,
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  const chunks = [];
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    chunks.push(chunk);
  });

  child.on('error', (err) => {
    console.error(`run-unit-tests: node --test не запустился — ${err.message}`);
    process.exitCode = 1;
  });

  child.on('close', (code) => {
    const exit = code ?? 1;
    const line = verdict(exit, findFailures(Buffer.concat(chunks).toString('utf8')));
    if (line) console.error(line);
    // exitCode, а не process.exit(): stdout в трубу пишется асинхронно, ранний
    // выход обрезал бы хвост TAP.
    process.exitCode = line ? exit || 1 : 0;
  });
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  run(process.argv.slice(2));
}
