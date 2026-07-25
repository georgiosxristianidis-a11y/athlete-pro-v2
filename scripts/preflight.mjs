#!/usr/bin/env node
// Preflight — дешёвые проверки в начале сессии (карточка O-4).
// Ловит гочи, которые иначе всплывают дорого:
//   1. битый user.email  -> GitHub отдаёт HTTP 500 на создании PR (выглядит как аутаж)
//   2. нет node_modules  -> pre-push падает ложным SAST-блоком (stylelint не найден)
//   3. база ветки уехала -> мёрж не будет FF / PR тянет чужие коммиты
//   4. невлитые свои ветки старше суток -> там может лежать готовый фикс
// Ненулевой exit = есть FAIL. WARN не блокирует.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_LISTED = 10;

const results = [];
const add = (level, name, msg, hint) => results.push({ level, name, msg, hint });

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

function gitOk(args, opts) {
  try {
    git(args, opts);
    return true;
  } catch {
    return false;
  }
}

// --- 1. Личность гита -------------------------------------------------------
const email = tryGit(['config', 'user.email']);
const author = tryGit(['config', 'user.name']);
if (!email) {
  add('FAIL', 'git identity', 'user.email не задан', 'git config user.email <you@example.com>');
} else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  add(
    'FAIL',
    'git identity',
    `user.email битый: ${email}`,
    'git config user.email <you@example.com> — иначе GitHub вернёт HTTP 500 на создании PR',
  );
} else {
  add('OK', 'git identity', `${author || '(без имени)'} <${email}>`);
}

// --- 2. node_modules --------------------------------------------------------
const linters = ['node_modules/.bin/eslint', 'node_modules/.bin/stylelint'];
if (!fs.existsSync('node_modules')) {
  add('FAIL', 'node_modules', 'нет в этом рабочем дереве', 'npm install — иначе pre-push упадёт ложным SAST-блоком');
} else {
  const missing = linters.filter((p) => !fs.existsSync(p) && !fs.existsSync(`${p}.cmd`));
  if (missing.length) {
    add('FAIL', 'node_modules', `нет линтеров: ${missing.join(', ')}`, 'npm install');
  } else {
    add('OK', 'node_modules', 'на месте, линтеры доступны');
  }
}

// --- 3. Свежесть базы -------------------------------------------------------
const branch = tryGit(['branch', '--show-current']) || '(detached)';
const fetched = gitOk(['fetch', '--quiet', 'origin', 'main'], { timeout: 20000 });
if (!fetched) {
  add('WARN', 'origin/main', 'не удалось обновить (нет сети?) — сверка по локальному снимку');
}

const mainRef = tryGit(['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : null;
if (!mainRef) {
  add('WARN', 'база ветки', 'origin/main недоступен — проверка пропущена');
} else if (branch === 'main') {
  add('OK', 'база ветки', 'сессия на main');
} else if (gitOk(['merge-base', '--is-ancestor', mainRef, 'HEAD'])) {
  add('OK', 'база ветки', `${branch} отросла от свежего origin/main`);
} else {
  const behind = tryGit(['rev-list', '--count', `HEAD..${mainRef}`]) || '?';
  add(
    'WARN',
    'база ветки',
    `${branch} отстаёт от origin/main на ${behind} коммит(ов)`,
    'git rebase origin/main — иначе мёрж не будет FF',
  );
}

// --- 4. Свои невлитые ветки старше суток ------------------------------------
const stale = [];
if (mainRef && (email || author)) {
  const raw =
    tryGit([
      'for-each-ref',
      '--format=%(refname:short)\t%(committerdate:unix)\t%(authoremail)\t%(authorname)',
      'refs/heads/',
    ]) || '';
  // Влитые — одним вызовом, а не merge-base на каждую ветку (веток под сотню).
  const merged = new Set(
    (tryGit(['for-each-ref', '--format=%(refname:short)', '--merged', mainRef, 'refs/heads/']) || '')
      .split('\n')
      .filter(Boolean),
  );
  const now = Date.now();
  for (const line of raw.split('\n').filter(Boolean)) {
    const [name, ts, rawMail, authorName] = line.split('\t');
    const mail = (rawMail || '').replace(/^<|>$/g, '');
    // Имя тоже считается: часть веток создана с битым user.email (инцидент 3),
    // по одной только почте они бы не нашлись.
    if (mail !== email && authorName !== author) continue;
    if (name === 'main') continue;
    const ageMs = now - Number(ts) * 1000;
    if (ageMs < STALE_MS) continue;
    if (merged.has(name)) continue;
    stale.push({ name, days: Math.floor(ageMs / STALE_MS), current: name === branch });
  }
  stale.sort((a, b) => b.days - a.days);
  if (!stale.length) {
    add('OK', 'невлитые ветки', 'своих старше суток нет');
  } else {
    add('WARN', 'невлитые ветки', `${stale.length} шт. старше суток — влить или закрыть (O-5)`);
  }
}

// --- Отчёт ------------------------------------------------------------------
console.log(`\nPreflight — ветка ${branch}\n`);
for (const r of results) {
  console.log(`[${r.level.padEnd(4)}] ${r.name}: ${r.msg}`);
  if (r.hint) console.log(`         -> ${r.hint}`);
}

if (stale.length) {
  console.log('');
  for (const b of stale.slice(0, MAX_LISTED)) {
    // Счётчик коммитов — только для показанных, иначе лишние вызовы git.
    const ahead = tryGit(['rev-list', '--count', `${mainRef}..${b.name}`]) || '?';
    console.log(`         ${b.name}${b.current ? ' (текущая)' : ''} — +${ahead}, ${b.days} дн.`);
  }
  if (stale.length > MAX_LISTED) console.log(`         ... и ещё ${stale.length - MAX_LISTED}`);
}

const failed = results.filter((r) => r.level === 'FAIL').length;
console.log(failed ? `\nFAIL: ${failed} — почини до работы.\n` : '\nPreflight чист.\n');
process.exit(failed ? 1 : 0);
