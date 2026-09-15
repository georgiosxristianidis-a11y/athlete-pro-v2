#!/usr/bin/env node
// Гард префикса ветки (карточка AGENT-8) — имя ветки обязано называть инструмент,
// который её ведёт: `cursor/<карточка>-<слова>` у исполнителя, `claude/` у оркестратора.
//
// Опорный факт карточки: Cursor работал в `claude/launch-5-dashboard-i18n` и
// `claude/launch-3a-legal-docs`. Имя ветки читают трое — `npm run inventory`,
// гард дрейфа и человек в списке PR, — и всем троим оно врало. Единственный
// честный источник авторства, трейлер `Co-Authored-By:`, живёт внутри коммита:
// чтобы им воспользоваться, надо открыть ветку, а решение «чья это работа»
// принимается раньше, по списку.
//
// Что проверяем: НЕ форму имени, а согласие имени с трейлером. Префикс без
// трейлера ничего не гарантирует (его никто не проверяет), трейлер без префикса
// не виден снаружи. Гард сшивает их: расходятся — блок.
//
// Исполнитель = ПЕРВЫЙ коммит с известным трейлером, ровно как в `npm run
// scorecard` (AGENT-6): коммиты LEAD поверх готовой работы Cursor — цена
// приёмки (бамп версии, пересборка `sw.js`), а не смена владельца ветки.
// Поэтому ветка, начатая Cursor и добитая LEAD, остаётся `cursor/*`.
//
// Ветка без единого известного трейлера НЕ блокируется: это `dependabot/*` и
// прочая автоматика, у которой владельца-инструмента нет. Такую ветку считает
// графа `unsigned` у scorecard — это вопрос карточки AGENT-4, не этого гарда.
//
// Осознанный обход: PREFIX_OK=1 git push.
//
// Слоёв два, намеренно: pre-push (ловит до пуша, судит по ЦЕЛЕВОЙ стороне
// рефспека) и шаг в обязательном job `test` (недрейфующий слой — локальный хук
// берётся из чекаута и может быть старше гарда).

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { TOOLS, trailerNames, toolOf } from './agent-scorecard.mjs';

export const MAIN = 'origin/main';
export const BYPASS_ENV = 'PREFIX_OK';

/** Инструменты, у которых есть своя ветка. Источник один — таблица трейлеров scorecard. */
export const PREFIXES = TOOLS.map((t) => t.tool);

/**
 * Ветки, которых гард не касается вовсе: не работа инструмента, а сам ствол
 * либо служебный ref. `main` тут ради ручного прогона в корневом чекауте.
 */
export const EXEMPT = [/^main$/, /^HEAD$/, /^refs\/tags\//];

function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function tryGit(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

/** `refs/heads/cursor/x` → `cursor/x`. Короткое имя оставляет как есть. */
export function shortBranch(ref) {
  return String(ref || '')
    .trim()
    .replace(/^refs\/heads\//, '');
}

export function isExempt(branch) {
  const short = shortBranch(branch);
  return !short || EXEMPT.some((re) => re.test(short));
}

/**
 * Инструмент, ведущий ветку, по телам её коммитов в хронологическом порядке.
 * @param {string[]} bodies тела коммитов, старший первым
 * @returns {string|null} `null` = ни одного известного трейлера
 */
export function executorOf(bodies) {
  for (const body of bodies ?? []) {
    for (const name of trailerNames(body)) {
      const tool = toolOf(name);
      if (tool) return tool;
    }
  }
  return null;
}

/**
 * Вердикт по паре «имя ветки × исполнитель».
 * @param {string} branch
 * @param {string|null} executor
 * @returns {{ ok: boolean, code: string, expected?: string, actual?: string }}
 */
export function verdict(branch, executor) {
  const short = shortBranch(branch);
  if (isExempt(short)) return { ok: true, code: 'exempt' };
  if (!executor) return { ok: true, code: 'unsigned' };

  const expected = `${executor}/`;
  if (short.startsWith(expected)) return { ok: true, code: 'match', expected };

  const wrongTool = PREFIXES.find((p) => p !== executor && short.startsWith(`${p}/`));
  return {
    ok: false,
    code: wrongTool ? 'wrong-tool' : 'no-prefix',
    expected,
    actual: wrongTool ? `${wrongTool}/` : short,
  };
}

/**
 * Тела коммитов ветки поверх main, старший первым.
 * Ref может не существовать локально (пуш формы `HEAD:cursor/x`) — тогда берём HEAD.
 */
export function commitBodies(ref, opts = {}) {
  const exists = ref && tryGit(['rev-parse', '--verify', `${shortBranch(ref)}^{commit}`], opts);
  const tip = exists ? shortBranch(ref) : 'HEAD';
  const raw = tryGit(['log', '--reverse', '--format=%B%x00', `${MAIN}..${tip}`], opts);
  if (raw === null) return [];
  return raw
    .split('\0')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Что именно проверять. Аргументы (pre-push подаёт целевые ветки рефспека) →
 * `GITHUB_HEAD_REF` (в CI HEAD detached на merge-коммите, имени ветки в git нет) →
 * текущая ветка.
 */
export function branchesToCheck(argv, env = process.env, opts = {}) {
  const named = (argv ?? []).filter((a) => !a.startsWith('--'));
  if (named.length) return named.map(shortBranch);
  if (env.GITHUB_HEAD_REF) return [shortBranch(env.GITHUB_HEAD_REF)];
  const head = tryGit(['symbolic-ref', '--short', 'HEAD'], opts);
  return head ? [head] : [];
}

export function formatFailure(branch, v) {
  const lines = [`❌ [Prefix Block] Ветка «${branch}» не называет инструмент, который её ведёт.`];
  lines.push(
    v.code === 'wrong-tool'
      ? `   Трейлер коммитов говорит ${v.expected.slice(0, -1)}, имя ветки — ${v.actual}.`
      : `   Коммиты подписаны ${v.expected.slice(0, -1)}, значит имя обязано начинаться с «${v.expected}».`
  );
  lines.push(`   Переименовать: git branch -m ${v.expected}<карточка>-<слова>`);
  lines.push(`   Уже на origin: git push origin :${branch} и пуш под новым именем.`);
  lines.push(`   Осознанный обход: ${BYPASS_ENV}=1 git push`);
  return lines;
}

/**
 * @param {{ argv?: string[], env?: Record<string, string|undefined>, out?: { log: Function, error: Function }, cwd?: string }} [opts]
 */
export function run(opts = {}) {
  const argv = opts.argv ?? process.argv.slice(2);
  const env = opts.env ?? process.env;
  const out = opts.out ?? console;
  const gitOpts = opts.cwd ? { cwd: opts.cwd } : {};

  const branches = branchesToCheck(argv, env, gitOpts);
  if (!branches.length) {
    out.log('[Prefix] Имя ветки не определено (detached HEAD без рефспека) — пропуск.');
    return 0;
  }

  let failed = 0;
  for (const branch of branches) {
    const v = verdict(branch, executorOf(commitBodies(branch, gitOpts)));
    if (v.ok) continue;
    failed++;
    for (const line of formatFailure(branch, v)) out.error(line);
  }

  if (!failed) return 0;
  if (env[BYPASS_ENV] === '1') {
    out.error(`⚠️  ${BYPASS_ENV}=1 — префикс не совпадает, пропущено осознанно.`);
    return 0;
  }
  return 1;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  process.exit(run());
}
