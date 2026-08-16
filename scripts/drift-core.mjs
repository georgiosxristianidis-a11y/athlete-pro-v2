#!/usr/bin/env node
// Ядро проверки дрейфа базы. Здесь только вычисления, ни одной строки вывода.
//
// Выделено из `check-branch-drift.mjs` карточкой FLOW-2, когда та же проверка
// понадобилась во втором месте — в PreToolUse-хуке, за миллисекунду до правки
// файла. Копипаста была бы третьей копией правды (pre-push, CI, хук), и первая
// же правка формулы «что считать пересечением» разъехалась бы по двум из трёх.
// Вопрос у всех троих один: «файл, который я трогаю, переписали в main с моей
// базы?» — значит и код должен быть один.
//
// Отдельный файл, а не экспорт из `check-branch-drift.mjs`: тот скрипт верхнего
// уровня, он при импорте немедленно выполняет проверки и зовёт process.exit().
// Импортировать его из хука значило бы уронить сессию на первом же Edit.
//
// Сети здесь нет и быть не должно. `git fetch` — решение вызывающего: pre-push
// его делает (там 20 с терпимы), PreToolUse-хук не делает никогда (он гоняется
// перед каждой правкой). Свежесть origin/main в хуке обеспечивает SessionStart,
// который уже сходил в сеть через preflight.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const MAIN = 'origin/main';

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

export function tryGit(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

export function currentBranch(opts) {
  return tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], opts);
}

/** Корень рабочего дерева. Хук получает cwd извне и может стоять где угодно внутри репо. */
export function repoRoot(opts) {
  return tryGit(['rev-parse', '--show-toplevel'], opts);
}

export function mainKnown(opts) {
  return Boolean(tryGit(['rev-parse', '--verify', `${MAIN}^{commit}`], opts));
}

export function mergeBase(opts) {
  return tryGit(['merge-base', 'HEAD', MAIN], opts);
}

export function behindCount(opts) {
  return Number(tryGit(['rev-list', '--count', `HEAD..${MAIN}`], opts) || 0);
}

/* Пересечение считаем только там, где файл РЕАЛЬНО расходится с main.
   Если твоя версия файла уже байт-в-байт равна main — терять нечего: так выглядит
   уже влитая ветка (rebase-merge переписывает SHA, и ancestry врёт про выкаченное)
   или та же правка, сделанная параллельно другим агентом. */
export function stillDiffers(file, opts) {
  try {
    git(['diff', '--quiet', MAIN, 'HEAD', '--', file], opts);
    return false;
  } catch {
    return true;
  }
}

function listChanged(range, opts) {
  const out = tryGit(['diff', '--name-only', range], opts);
  return out ? out.split('\n').filter(Boolean) : [];
}

/** Файлы, которые правил ты И которые с тех пор переписали в main. */
export function overlapFiles(base, opts) {
  const mine = listChanged(`${base}..HEAD`, opts);
  const theirs = new Set(listChanged(`${base}..${MAIN}`, opts));
  return mine.filter((f) => theirs.has(f) && stillDiffers(f, opts));
}

/** Коммиты main, переписавшие файл с базы ветки. Пустой массив = файла они не трогали. */
export function commitsInMainFor(base, file, opts) {
  const out = tryGit(['log', '--oneline', `${base}..${MAIN}`, '--', file], opts);
  return out ? out.split('\n').filter(Boolean) : [];
}

/** Путь из tool_input → путь относительно корня репо в POSIX-виде, как его знает git.
    Возвращает null для всего, что лежит вне рабочего дерева. */
export function toRepoPath(filePath, root) {
  if (!filePath || !root) return null;
  const rel = path.relative(path.resolve(root), path.resolve(filePath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Вердикт по ОДНОМУ файлу — то, что нужно PreToolUse-хуку.
 *
 * Ответ `drift: false` даётся, а не замалчивается: у вызывающего должна быть
 * возможность отличить «проверено, чисто» от «проверить не удалось» (`skip`).
 * Молчаливый пропуск — то, как PP-6 и прошёл: гард не сказал «нет», он не сказал
 * ничего.
 *
 * @returns {{drift: boolean, skip?: string, base?: string, behind?: number, commits?: string[]}}
 */
export function fileDrift(filePath, { cwd } = {}) {
  const opts = cwd ? { cwd } : {};

  const root = repoRoot(opts);
  if (!root) return { drift: false, skip: 'не git-репозиторий' };

  const rel = toRepoPath(filePath, root);
  if (!rel) return { drift: false, skip: 'файл вне рабочего дерева' };

  const branch = currentBranch(opts);
  if (!branch || branch === 'HEAD') return { drift: false, skip: 'detached HEAD' };
  if (branch === 'main') return { drift: false, skip: 'сессия на main' };

  if (!mainKnown(opts)) return { drift: false, skip: 'origin/main недоступен' };

  const base = mergeBase(opts);
  if (!base) return { drift: false, skip: 'общий предок не найден' };

  const behind = behindCount(opts);
  if (behind === 0) return { drift: false, base, behind };

  const commits = commitsInMainFor(base, rel, opts);
  if (!commits.length) return { drift: false, base, behind };
  if (!stillDiffers(rel, opts)) return { drift: false, base, behind };

  return { drift: true, base, behind, commits, file: rel };
}
