#!/usr/bin/env node
// Хук-гард сессии: сдвигает проверку базы влево — с pre-push на момент старта
// сессии и на момент первой правки файла. Карточки FLOW-1/2/3.
//
// ЗАЧЕМ. `CLAUDE.md` предписывает «Старт: npm run preflight», и это правило-текст:
// исполняется, только если агент его прочитал и решил исполнить. В сессии, где
// писалась эта карточка, оно не исполнилось — работа началась при двух красных
// пунктах preflight, включая мёртвый `core.hooksPath` (то есть pre-push-гарды в
// том ворктри не работали вообще). Правило-механизм не зависит от доброй воли.
//
// ПОЧЕМУ НЕ ХВАТИЛО ТОГО, ЧТО БЫЛО. Гард дрейфа существует с PP-6, но живёт на
// pre-push — он говорит «ты писал по устаревшему коду» через час после того, как
// код написан. Тот же вопрос, заданный в PreToolUse, стоит ~50 мс и звучит до
// первой строки диффа. Проверка та же (`drift-core.mjs`), меняется только момент.
//
// ЧТО ИМЕННО ПРОВЕРЯЕТСЯ НА EDIT. Не отставание от main — оно безобидно и даёт
// WARN намеренно (BASE-1). Проверяется ПЕРЕСЕЧЕНИЕ по конкретному файлу: этот
// файл переписали в main с твоей базы. Ноль ложных срабатываний на нормальной
// ветке, и ровно PP-6 на больной.
//
// РЕШАЕТ ЧЕЛОВЕК, СНИМАЕТ АГЕНТ. Вердикт `deny`: правка стоит, агент обязан
// спросить Gio в чате и только после явного «да» снять блок командой `ack` из
// текста причины — файл подтверждён до конца сессии, иначе гард превратился бы
// в cookie-баннер. `escalate`/`ask` не годятся: под defaultMode auto они молча
// пропускали правку (замер 25.09, FLOW-3). Команду может выполнить и сам агент —
// граница доверия сдвинута на него осознанно (решение Gio 25.09): блок редкий,
// снятие видно в чате. Обхода через ENV нет: его выставил бы агент молча.
//
// ГДЕ ОН ЖИВЁТ. Точка входа — `~/.claude/hooks/athlete-pro-guard.mjs`, вне гита,
// и потому не дрейфует вместе с чекаутом. Логика — здесь, в репо: версионируется,
// едет в PR, ревьюится. Это прямой вывод из отказа №4 PP-6, где гард лежал в
// чекауте и протух вместе с ним молча. Продублировать SessionStart в CI нельзя —
// у CI нет сессии, поэтому недрейфующей обязана быть хотя бы точка входа.
//
// ПОЧЕМУ ОШИБКИ НЕ ГЛУШАТСЯ В НОЛЬ. Сломавшийся гард, который молчит, — это и
// есть механика PP-6: он не сказал «нет», он не сказал ничего. Поэтому любой
// неожиданный сбой уходит в `systemMessage` (человек видит), но не блокирует
// работу: гард, способный запереть сессию из-за своей же ошибки, будет отключён
// первым, и вместе с ним всё остальное.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fileDrift, tryGit } from './drift-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// Кэш preflight. 12.7 с на старте — терпимо один раз, но не на каждой сессии
// подряд; TTL и ключ по HEAD взяты у claude-flow (namespace с временем жизни).
// Ключ — sha, а не только время: перескочил на другой коммит — ответ протух
// мгновенно, сколько бы минут ни оставалось.
const CACHE_TTL_MS = 15 * 60 * 1000;
const PREFLIGHT_TIMEOUT_MS = 60_000;

/** Каталог состояния — внутри .git ЭТОГО рабочего дерева: у каждого worktree он свой,
    в коммит не попадает и умирает вместе с ворктри, как и положено состоянию сессии. */
function stateDir(cwd) {
  const gitDir = tryGit(['rev-parse', '--absolute-git-dir'], { cwd });
  if (!gitDir) return null;
  const dir = path.join(gitDir, 'session-guard');
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data));
  } catch {
    /* состояние — удобство, а не гарантия: не смогли записать, спросим ещё раз */
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

// --- FLOW-1: старт сессии ---------------------------------------------------

/* Из всего вывода preflight в контекст едут только строки, на которые надо
   реагировать: FAIL плюс единственный WARN, за которым стоит PP-6.
   Остальное — 67 невлитых веток, бюджет доков, зелёные OK — это отчёт для
   человека по требованию, а не налог на каждый старт сессии. Зелёный preflight
   даёт пустой инжект: гард, который что-то пишет всегда, читать перестают. */
export function relevantLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((l) => /^\[FAIL/.test(l) || /^\[WARN\s*\]\s*база ветки/.test(l))
    .map((l) => l.trim());
}

function runPreflight(cwd) {
  const res = spawnSync(process.execPath, [path.join(HERE, 'preflight.mjs')], {
    cwd,
    encoding: 'utf8',
    timeout: PREFLIGHT_TIMEOUT_MS,
  });
  // Ненулевой код — норма: preflight так сообщает о FAIL. Важен stdout, не код.
  return res.stdout || '';
}

function onSessionStart(input) {
  const cwd = input.cwd || process.cwd();
  const dir = stateDir(cwd);
  const head = tryGit(['rev-parse', 'HEAD'], { cwd });
  const cacheFile = dir ? path.join(dir, 'preflight.json') : null;

  let lines = null;
  if (cacheFile && head) {
    const cached = readJson(cacheFile, null);
    if (cached && cached.head === head && Date.now() - cached.ts < CACHE_TTL_MS) {
      lines = cached.lines;
    }
  }

  if (lines === null) {
    lines = relevantLines(runPreflight(cwd));
    if (cacheFile && head) writeJson(cacheFile, { head, ts: Date.now(), lines });
  }

  if (!lines.length) process.exit(0);

  const context =
    'Preflight этого рабочего дерева не чист — до работы починить:\n' +
    lines.join('\n') +
    '\n\nПолный отчёт: npm run preflight';

  // Дублируем в двух местах намеренно: `additionalContext` верхнего уровня —
  // документированная форма для SessionStart, вложенная — общая форма прочих
  // событий. Лишнее поле харнесс игнорирует, недостающее стоило бы молчания.
  emit({
    additionalContext: context,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  });
}

// --- FLOW-2 / FLOW-3: правка файла ------------------------------------------

function ackFile(dir, sessionId) {
  return dir ? path.join(dir, `ack-${String(sessionId || 'nosession').replace(/[^\w-]/g, '')}.json`) : null;
}

/** Репо судим по самому файлу, а не по cwd сессии: сессия из корня правит файлы
    ворктри по абсолютному пути, и её cwd указывал бы на чужой репозиторий.
    Возвращаем корень, а не каталог файла: пути git в drift-core — от корня. */
function repoTopFor(absPath, fallback) {
  let dir = path.dirname(absPath);
  while (!fs.existsSync(dir)) {
    const up = path.dirname(dir);
    if (up === dir) return fallback;
    dir = up;
  }
  return tryGit(['rev-parse', '--show-toplevel'], { cwd: dir }) || fallback;
}

const slash = (p) => p.replace(/\\/g, '/');

export function recordAck(sessionId, repoFile, cwd) {
  const file = ackFile(stateDir(cwd), sessionId);
  if (!file) return false;
  const ack = readJson(file, { files: [] });
  if (!Array.isArray(ack.files)) ack.files = [];
  if (!ack.files.includes(repoFile)) ack.files.push(repoFile);
  writeJson(file, ack);
  return readJson(file, { files: [] }).files?.includes(repoFile) === true;
}

function onPreToolUse(input) {
  const filePath = input.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const absPath = path.resolve(input.cwd || process.cwd(), filePath);
  const cwd = repoTopFor(absPath, input.cwd || process.cwd());
  const verdict = fileDrift(absPath, { cwd });
  if (!verdict.drift) process.exit(0);

  /* Подтверждённый файл больше не спрашиваем: решение человека принято один раз
     и действует до конца сессии. Иначе гард раздражал бы как cookie-баннер, а
     раздражающий гард отключают целиком. */
  const dir = stateDir(cwd);
  const file = ackFile(dir, input.session_id);
  const ack = file ? readJson(file, { files: [] }) : { files: [] };
  if (ack.files?.includes(verdict.file)) process.exit(0);

  const commits = verdict.commits.slice(0, 3).join('\n     ');
  const ackCmd =
    `node "${slash(path.join(HERE, 'session-guard.mjs'))}" ack ` +
    `"${input.session_id}" "${verdict.file}" "${slash(cwd)}"`;
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Дрейф базы: ${verdict.file} переписали в origin/main с базы этой ветки ` +
        `(отставание ${verdict.behind} коммит(ов), ${verdict.commits.length} из них трогали этот файл).\n\n` +
        `     ${commits}\n\n` +
        'Правка ляжет поверх кода, которого в main уже нет — тесты и проверка в браузере\n' +
        'это не поймают, они прогонятся по старому файлу (PP-6).\n\n' +
        'Лечение: git rebase origin/main, затем перегнать гейт заново.\n\n' +
        'СТОП. Не обходить (Bash-записью в том числе): спросить человека в чате — rebase\n' +
        'или править поверх. Только после его явного «да» снять блок для этого файла\n' +
        `до конца сессии:\n     ${ackCmd}`,
    },
  });
}

// --- Диспетчер ---------------------------------------------------------------

export function dispatch(input) {
  switch (input.hook_event_name) {
    case 'SessionStart':
      return onSessionStart(input);
    case 'PreToolUse':
      return onPreToolUse(input);
    default:
      process.exit(0);
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Запуск как скрипт — но не при импорте из теста.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (process.argv[2] === 'ack') {
    const [sessionId, repoFile, cwd = process.cwd()] = process.argv.slice(3);
    if (!sessionId || !repoFile) {
      console.error('usage: node scripts/session-guard.mjs ack <session_id> <file> [cwd]');
      process.exit(2);
    }
    const ok = recordAck(sessionId, repoFile, cwd);
    console.log(ok ? `session-guard: ${repoFile} разблокирован до конца сессии` : 'session-guard: разрешение не записано');
    process.exit(ok ? 0 : 1);
  }

  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }
  try {
    dispatch(input);
  } catch (err) {
    // Видимо, но не блокирующе — см. шапку файла.
    emit({ systemMessage: `session-guard упал: ${err?.message || err}. Гард дрейфа сейчас не работает.` });
  }
}
