// FLOW-6. Забытое незакоммиченное в КОРНЕВОМ чекауте — для проверки 3c в preflight.
//
// Корень делится с живой сессией, и правка в нём не оставляет следов: ни ветки, ни
// коммита, ни PR. 08.10 там осталось семь путей (1172 строки), нашлись через ~39 ч
// руками. Ни один слой не смотрел в эту сторону — preflight считал отставание корня,
// не его грязь; session-guard ловит дрейф на Edit; pre-push и CI видят только
// дошедшее до пуша; inventory судит ветки, а не дерево.
//
// Модуль только читает: `--no-optional-locks` не даёт `git status` перезаписать
// индекс корня под ногами у чужой сессии. Разбор и вердикт — чистые функции (без git),
// чтобы возраст и подсчёт путей проверялись юнитом; git и fs тронуты только в `scanRootWip`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HOUR_MS = 60 * 60 * 1000;

function gitIn(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function mtimeOf(p) {
  try {
    return fs.lstatSync(p).mtimeMs;
  } catch {
    return null; // удалён — mtime у такого пути нет
  }
}

/** 1 путь · 2 пути · 5 путей · 11 путей · 21 путь. */
function pathsWord(n) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'путей';
  const last = n % 10;
  if (last === 1) return 'путь';
  if (last >= 2 && last <= 4) return 'пути';
  return 'путей';
}

function ago(ms) {
  const h = Math.floor(ms / HOUR_MS);
  return h < 1 ? 'меньше часа назад' : `${h} ч назад`;
}

/**
 * Разбор `git status --porcelain=v1 -z -uall`. Запись — `XY путь\0`; у переименования
 * и копии следом идёт ещё одна — старый путь (`R  новый\0старый\0`), она не отдельная
 * запись. `-z` вместо построчного разбора: имена с пробелами и кириллицей без квотирования.
 * @param {string} raw
 * @returns {{ code: string, path: string }[]}
 */
export function parsePorcelainZ(raw) {
  const parts = raw.split('\0');
  const entries = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (rec.length < 4) continue; // хвостовой пустой фрагмент после последнего \0
    const code = rec.slice(0, 2);
    entries.push({ code, path: rec.slice(3) });
    if (/[RC]/.test(code)) i++;
  }
  return entries;
}

/**
 * Вердикт по корню. Возраст — по САМОЙ СВЕЖЕЙ mtime среди изменённых и новых путей, не
 * по самой старой: свежая правка — возможно живая сессия, корень делится с ней, молчим.
 * Если mtime нет ни у одного (одни удаления) — возраст по mtime индекса корня.
 * @param {{
 *   items: { code: string, path: string, mtimeMs: number|null }[],
 *   indexMtimeMs: number|null,
 *   now: number,
 *   staleMs: number,
 *   maxListed: number,
 * }} input
 * @returns {{ level: 'OK'|'WARN', msg: string, hint?: string, detail?: string[] }}
 */
export function judgeRootWip({ items, indexMtimeMs, now, staleMs, maxListed }) {
  if (!items.length) return { level: 'OK', msg: 'корневой чекаут чист' };

  const count = `${items.length} ${pathsWord(items.length)}`;
  const known = items.map((i) => i.mtimeMs).filter((t) => Number.isFinite(t));
  const newest = known.length ? Math.max(...known) : indexMtimeMs;

  if (!Number.isFinite(newest)) {
    return {
      level: 'WARN',
      msg: `${count} в корне, возраст не определить`,
      hint: 'git -C <корень> status — посмотреть руками',
    };
  }

  const age = Math.max(0, now - newest);
  if (age < staleMs) {
    return { level: 'OK', msg: `${count} в корне, правится сейчас (${ago(age)})` };
  }

  const detail = items.slice(0, maxListed).map((i) => `${i.code.trim().padEnd(2)} ${i.path}`);
  if (items.length > maxListed) detail.push(`... и ещё ${items.length - maxListed}`);
  return {
    level: 'WARN',
    msg: `${count} в корне, последняя правка ${ago(age)}`,
    hint: 'не откатывать вслепую (возможно WIP другого агента): спасти копией в свой worktree, чистка корня — по слову Gio',
    detail,
  };
}

/**
 * Читает основной worktree: он первый в `git worktree list`, из линкованного дерева сессии
 * проверка ходит туда `git -C <корень>`. Чужие линкованные worktree не смотрим — WIP в них
 * норма. Любой сбой (нет git, bare-репо, таймаут) — `null`: вызывающий скажет вслух.
 * @param {string} [cwd]
 */
export function scanRootWip(cwd = '.') {
  try {
    const root = gitIn(cwd, ['worktree', 'list', '--porcelain'])
      .split('\n')
      .find((l) => l.startsWith('worktree '))
      ?.slice('worktree '.length)
      .trim();
    if (!root) return null;

    const raw = gitIn(root, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '-uall']);
    const items = parsePorcelainZ(raw).map((e) => ({
      ...e,
      mtimeMs: mtimeOf(path.join(root, e.path)),
    }));
    const gitDir = gitIn(root, ['rev-parse', '--absolute-git-dir']).trim();
    return { root, items, indexMtimeMs: mtimeOf(path.join(gitDir, 'index')) };
  } catch {
    return null;
  }
}
