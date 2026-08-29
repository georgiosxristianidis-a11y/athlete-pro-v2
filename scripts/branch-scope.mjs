#!/usr/bin/env node
// Область ветки: какие файлы несёт PR относительно свежего origin/main.
//
// Выделено сразу, а не после второго потребителя: два гарда (бамп версии VER-1,
// изоляция потолков CEIL-1) задают один вопрос — «что именно правит эта ветка».
// Две копии ответа разъехались бы на первом же нюансе, а нюансов здесь три и
// каждый однажды уже делал гард пустышкой: detached HEAD (в CI это норма, а не
// сбой), незакоммиченная правка (локально она часть будущего PR) и отсутствие
// origin/main в мелком клоне.
//
// Сети здесь нет и быть не должно: `git fetch` — решение вызывающего. Гард,
// который лезет в сеть из `npm test`, стоит секунд на каждом прогоне и краснеет
// в оффлайне — то есть учит гонять тесты с обходом.

import { execFileSync } from 'node:child_process';

import { MAIN, currentBranch, tryGit } from './drift-core.mjs';

/** В CI detached HEAD — норма: actions/checkout на pull_request даёт refs/pull/N/merge. */
const inCI = () => process.env.CI === 'true' || process.env.CI === '1';

/**
 * База, относительно которой судим ветку. Обычно origin/main, но в стопке PR —
 * ветка-основание: PR со вторым этажом несёт коммиты первого, и гард, жёстко
 * прибитый к main, краснел бы на всей стопке, требуя бампа за чужую работу.
 * В CI имя базы даёт сам GitHub (`GITHUB_BASE_REF`), локально — GUARD_BASE_REF.
 */
export function baseRef(opts = {}) {
  const named = process.env.GUARD_BASE_REF || process.env.GITHUB_BASE_REF;
  if (!named) return MAIN;
  // Имя от GitHub приходит без remote (`main`), локально удобнее назвать ветку
  // как есть. Берём первое, что реально существует, чтобы гард не отвалился в
  // skip именно там, где стопка PR его и нужна.
  //
  // Remote-кандидат идёт ПЕРВЫМ, и это не стилистика: `refs/heads/main` в этом
  // репозитории живёт постоянно (на нём стоит корневой чекаут) и отстаёт — на
  // 2026-08-29 он был на a9b0d5b при origin/main efe8121. Гард, сверяющийся с
  // протухшей копией базы, отвечает на вопрос вчерашнего дня.
  for (const candidate of [`origin/${named}`, named]) {
    if (tryGit(['rev-parse', '--verify', `${candidate}^{commit}`], opts)) return candidate;
  }
  return `origin/${named}`;
}

/**
 * Вывод git БЕЗ trim. Отдельно от `tryGit` не по вкусу: в `--porcelain` статус
 * невыложенной правки начинается с пробела (` M path`), и общий `git()` из
 * drift-core, который вывод тримит, срезал его вместе с первым символом пути —
 * гард видел `s/app.js`, не находил продуктовых файлов и молча зеленел. Дефект
 * поймал baseline-прогон, а не ревью: тем и ценен.
 */
function rawGit(args, opts = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch {
    return null;
  }
}

/** `git diff --name-status -z`: статус и путь идут отдельными сегментами, у R/C путей два. */
function parseNameStatusZ(raw) {
  const parts = raw.split('\0').filter((p) => p !== '');
  const out = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++];
    if (/^[RC]/.test(status)) {
      const from = parts[i++];
      const to = parts[i++];
      if (to === undefined) break;
      out.push({ status: 'R', path: to, from });
    } else {
      const p = parts[i++];
      if (p === undefined) break;
      out.push({ status: status[0], path: p });
    }
  }
  return out;
}

/** `git status --porcelain -z`: XY + пробел + путь в одном сегменте, у R старый путь во втором. */
function parsePorcelainZ(raw) {
  const parts = raw.split('\0').filter((p) => p !== '');
  const out = [];
  for (let i = 0; i < parts.length; ) {
    const seg = parts[i++];
    const xy = seg.slice(0, 2);
    const p = seg.slice(3);
    if (xy.includes('R')) i++; // старый путь — отдельным сегментом, нам не нужен
    if (!p) continue;
    // '??' — новый файл: для потолка на состав репозитория он такое же добавление.
    const status = xy.includes('D') ? 'D' : xy.includes('A') || xy === '??' ? 'A' : 'M';
    out.push({ status, path: p });
  }
  return out;
}

/**
 * Что правит текущая ветка поверх общей базы со своей базовой веткой.
 *
 * Незакоммиченное считается наравне с коммитами намеренно: локально гард
 * обязан отвечать на вопрос «что уедет в PR», а не «что уже закоммичено» —
 * иначе он краснеет ровно до `git commit` и приучает гонять тесты после него.
 *
 * @param {{cwd?: string, includeWorktree?: boolean}} [options]
 * @returns {{skip: string} | {ref: string, base: string, entries: Array<{status: string, path: string}>,
 *   paths: string[], added: string[], deleted: string[]}}
 */
export function branchScope({ cwd, includeWorktree = true } = {}) {
  const opts = cwd ? { cwd } : {};
  const ref = baseRef(opts);

  const branch = currentBranch(opts);
  if (!branch) return { skip: 'не git-репозиторий' };
  if (branch === 'main') return { skip: 'сессия на main — сравнивать не с чем' };
  if (branch === 'HEAD' && !inCI()) return { skip: 'detached HEAD вне CI' };
  if (!tryGit(['rev-parse', '--verify', `${ref}^{commit}`], opts)) {
    return { skip: `${ref} недоступен (мелкий клон?)` };
  }

  const base = tryGit(['merge-base', 'HEAD', ref], opts);
  if (!base) return { skip: `общий предок с ${ref} не найден` };

  const entries = [];
  const committed = rawGit(['diff', '--name-status', '-z', `${base}..HEAD`], opts);
  if (committed) entries.push(...parseNameStatusZ(committed));

  if (includeWorktree) {
    const dirty = rawGit(['status', '--porcelain', '-z'], opts);
    if (dirty) entries.push(...parsePorcelainZ(dirty));
  }

  // Один путь может прийти дважды (коммит + правка поверх). Побеждает A/D:
  // для потолка на состав репозитория важно именно появление файла.
  const byPath = new Map();
  for (const e of entries) {
    const prev = byPath.get(e.path);
    if (!prev || (prev.status === 'M' && e.status !== 'M')) byPath.set(e.path, e);
  }
  const merged = [...byPath.values()];

  return {
    ref,
    base,
    entries: merged,
    paths: merged.map((e) => e.path),
    added: merged.filter((e) => e.status === 'A' || e.status === 'R').map((e) => e.path),
    deleted: merged.filter((e) => e.status === 'D').map((e) => e.path),
  };
}

/** Содержимое файла на ревизии. null — файла там нет (новый файл, чужая база). */
export function fileAtRef(ref, file, { cwd } = {}) {
  return tryGit(['show', `${ref}:${file}`], cwd ? { cwd } : {});
}
