#!/usr/bin/env node
// Ставит core.hooksPath относительным и чистит унаследованный worktree-level
// оверрайд (карточка HYG-4).
//
// extensions.worktreeConfig=true даёт каждому `git worktree` свой config.worktree.
// До этой карточки core.hooksPath туда прописывался АБСОЛЮТНЫМ путём на корневой
// чекаут — протухший корень (чужая ветка, старый main) молча выключал хуки сразу
// у всех worktree. Простой `git config core.hooksPath .githooks` в postinstall
// эту дыру не чинил: если ключ уже существует в config.worktree, plain-запись
// без --worktree правит только .git/config, а worktree-оверрайд остаётся первым
// в приоритете и продолжает побеждать. Нужно сначала снять его явно.
//
// В package.json вызов идёт через `|| exit 0` — осознанно. Развязка хуков это
// удобство разработчика, и она НЕ должна ронять продакшн-сборку. `scripts/`
// лежит в `.vercelignore`, поэтому в билд-контейнере Vercel этого файла просто
// нет: строгий вызов валил `npm install`, а с ним весь деплой (ff9ceed, PR#196).
// Тот же путь закрывает сборку вообще без git. Реальный гард — не postinstall,
// а проверка hooksPath в `npm run preflight` плюс `test/postinstall-guard.test.js`.
import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

if (tryGit(['config', '--worktree', '--get', 'core.hooksPath']) !== null) {
  tryGit(['config', '--worktree', '--unset-all', 'core.hooksPath']);
}

git(['config', 'core.hooksPath', '.githooks']);

// Драйвер слияния для сгенерированного sw.js (карточка AGENT-5). Правило живёт
// в .gitattributes (`sw.js merge=ours`), но само имя `ours` git не знает — его
// объявляют конфигом, и конфиг в репозиторий не коммитится. Отсюда postinstall:
// это единственный шаг, который делает каждый чекаут и каждый worktree.
//
// tryGit, а не git: старый git без merge.<driver>.driver или экзотическая
// сборка не должны ронять установку — без драйвера конфликт по sw.js просто
// снова становится ручным, как был.
tryGit(['config', 'merge.ours.driver', 'true']);
