#!/usr/bin/env node
// Preflight — дешёвые проверки в начале сессии (карточка O-4).
// Ловит гочи, которые иначе всплывают дорого:
//   1. битый user.email  -> GitHub отдаёт HTTP 500 на создании PR (выглядит как аутаж)
//   2. нет node_modules  -> pre-push падает ложным SAST-блоком (stylelint не найден)
//   3. база ветки уехала -> мёрж не будет FF / PR тянет чужие коммиты
//   3b. база содержит отвергнутую линию -> её код уедет в main под видом карточки
//      (BASE-1: ворктри трижды подряд приезжал нарезанным от `elite-hud-wow`,
//      где утечка BYOK-ключа в неаутентифицированный эндпоинт)
//   4. невлитые свои ветки старше суток -> там может лежать готовый фикс
//   5. дефолт-ветка на GitHub != main   -> клоны и Compare&PR целятся в мёртвую
//      линию (кейс csp-soft-delete 2026-07-26: O-3 упразднил trunk, а настройку
//      репо никто не проверил — аномалия неделю висела в статусе git)
//   6. защита main снята/ослаблена  -> прямой push и красные мёржи снова возможны.
//      Если план репо её вообще не даёт (приватный на free: 403 Upgrade to Pro),
//      проверяем то, что реально держит main на этом плане, — .githooks/pre-push.
//   7. Production-деплой не с main  -> прод живёт своей жизнью (кейс: смоук чист,
//      а раскатка шла бы с чужой ветки)
// Ненулевой exit = есть FAIL. WARN не блокирует.
// Проверки 5-7 сетевые: оффлайн/нет gh = WARN-пропуск, сессию не блокируют.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { scanBase } from './rejected-lines.mjs';
import { BUDGETS, findMemoryIndex, measureFile, measureHotPath, violations } from './check-docs-budget.mjs';

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

// --- 2b. hooksPath принадлежит этому чекауту --------------------------------
// extensions.worktreeConfig=true даёт каждому worktree свой config.worktree.
// До HYG-4 (2026-08-13) там оседал АБСОЛЮТНЫЙ core.hooksPath на корневой
// чекаут — протухший корень (чужая ветка) молча выключал хуки сразу у всех
// worktree разом. Простой относительный `git config core.hooksPath .githooks`
// в postinstall дыру не чинит: если ключ уже сидит в config.worktree, запись
// без --worktree правит только .git/config, а оверрайд остаётся первым в
// приоритете. Ловим здесь, не дожидаясь пока протухнет ещё раз.
const hooksPathRaw = tryGit(['config', 'core.hooksPath']);
const toplevel = tryGit(['rev-parse', '--show-toplevel']);
if (!hooksPathRaw) {
  add('FAIL', 'hooksPath', 'core.hooksPath не задан — хуки не подключены', 'npm install');
} else {
  const hooksDir = path.resolve(toplevel || '.', hooksPathRaw);
  // Судим по вложенности, а не по точному совпадению родителя: вложенный путь
  // вроде tools/hooks законен, и ложный FAIL тут дороже отсутствия проверки —
  // красный, который «всегда такой», перестают читать целиком.
  const rel = toplevel ? path.relative(toplevel, hooksDir) : '';
  const outside = toplevel && (rel.startsWith('..') || path.isAbsolute(rel));
  if (outside) {
    add(
      'FAIL',
      'hooksPath',
      `core.hooksPath указывает за пределы этого чекаута: ${hooksDir}`,
      'node scripts/fix-hooks-path.mjs — снимает протухший worktree-оверрайд',
    );
  } else {
    add('OK', 'hooksPath', `указывает в свой чекаут (${rel || '.'})`);
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

// --- 3b. База не содержит отвергнутых линий ---------------------------------
// BASE-1. Отставание от main — не ошибка, а сигнал (проверка 3 даёт WARN), но
// один случай отставания качественно другой: база содержит линию, по которой
// вынесен вердикт «не вливать». Ворктри приезжал нарезанным от
// `feature/elite-hud-wow` трижды подряд (HUD-1, HUD-2, 2026-08-13), и каждый
// раз это ловил только тот агент, который посмотрел сам. Цена промаха — не
// конфликт, а утечка BYOK-ключа в неаутентифицированный эндпоинт, уехавшая в
// main под видом безобидной карточки.
//
// Список и сама проверка — в `scripts/rejected-lines.mjs`: тот же модуль зовёт
// гард дрейфа, то есть pre-push и CI. Две копии списка разъехались бы на второй
// отвергнутой линии, и гард был бы зелёным ровно там, где смотрят.
const { mainKnown, hits } = scanBase();
if (!hits.length) {
  add('OK', 'донорские линии', 'база чистая — отвергнутого кода под ногами нет');
} else {
  for (const { sha, name, why } of hits) {
    add(
      'FAIL',
      'донорские линии',
      `база чекаута содержит ${sha.slice(0, 7)} (${name}) — ${why}` +
        (mainKnown ? '' : '; сверить с origin/main не удалось (оффлайн)'),
      `git rebase --onto origin/main ${sha} ${branch} (или нарезать ворктри заново от origin/main) — иначе код отвергнутой линии уедет в main вместе с карточкой`,
    );
  }
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

// --- 5. Дефолт-ветка на GitHub ----------------------------------------------
// ls-remote --symref спрашивает сам GitHub; локальный origin/HEAD может врать.
const symref = fetched ? tryGit(['ls-remote', '--symref', 'origin', 'HEAD'], { timeout: 20000 }) : null;
if (!symref) {
  add('WARN', 'дефолт-ветка', 'origin недоступен — проверка пропущена');
} else {
  const head = symref.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)?.[1];
  if (head === 'main') {
    add('OK', 'дефолт-ветка', 'GitHub default = main');
  } else {
    add(
      'FAIL',
      'дефолт-ветка',
      `GitHub default = ${head ?? '(не распознана)'}`,
      'Settings → General → Default branch → main — иначе клоны и Compare&PR целятся в мёртвую линию',
    );
  }
}

// --- 6+7. Настройки GitHub: защита main + источник Production-деплоя ---------
// Тем же приёмом, что и дефолт-ветка: настройки невидимы в ежедневной работе
// и не ломаются до первого касания — спрашиваем сам GitHub каждую сессию.
function ghDetail(args) {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Без shell: gh — настоящий .exe и находится по PATH, а '&' в URL
      // деплойментов виндовый cmd иначе режет как разделитель команд.
      timeout: 20000,
    });
    return { ok: true, out: out.trim(), err: '' };
  } catch (e) {
    // stderr нужен целиком: по нему отличается «настройки нет» от «плана нет».
    return { ok: false, out: '', err: String(e.stderr ?? '') + String(e.stdout ?? '') };
  }
}

function tryGh(args) {
  const r = ghDetail(args);
  return r.ok ? r.out : null;
}

// Реальный барьер против прямого пуша в main, когда server-side его нет.
// Хук ищем по core.hooksPath: он абсолютный и смотрит в КОРНЕВОЙ чекаут —
// протух корень, и хук молча мёртв сразу у всех worktree (CLAUDE.md
// § Multi-Agent Protocol). Именно это и надо ловить на старте сессии.
function checkPrePushHook() {
  const hooksPath = tryGit(['config', 'core.hooksPath']);
  if (!hooksPath) {
    return { ok: false, why: 'core.hooksPath не задан — хуки не подключены' };
  }
  const hookFile = path.resolve(tryGit(['rev-parse', '--show-toplevel']) || '.', hooksPath, 'pre-push');
  if (!fs.existsSync(hookFile)) {
    return { ok: false, why: `хука нет по пути core.hooksPath: ${hookFile}` };
  }
  const src = fs.readFileSync(hookFile, 'utf8');
  if (!src.includes('MAIN_PUSH_OK')) {
    return { ok: false, why: `${hookFile} есть, но блока прямого пуша в main в нём нет` };
  }
  return { ok: true, why: hookFile };
}

const originUrl = tryGit(['remote', 'get-url', 'origin']) || '';
const repoSlug = originUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/)?.[1];

if (!repoSlug || !fetched) {
  add('WARN', 'настройки GitHub', 'origin не GitHub или нет сети — проверки 6-7 пропущены');
} else if (!tryGh(['--version'])) {
  add('WARN', 'настройки GitHub', 'gh CLI недоступен — проверки 6-7 пропущены');
} else {
  // 6. Защита main: обязательные чеки test+e2e + enforce_admins.
  const protRes = ghDetail(['api', `repos/${repoSlug}/branches/main/protection`]);
  const protRaw = protRes.ok ? protRes.out : null;
  // Приватный репо на бесплатном плане: и classic protection, и rulesets отдают
  // 403 «Upgrade to GitHub Pro». Это не «защиту сняли», а «её тут не бывает», и
  // подсказка «Settings → Branches» ведёт на экран апгрейда. Вечный красный FAIL
  // в таком виде дороже отсутствия проверки: его перестают читать целиком.
  // Поэтому спрашиваем то, что на этом плане реально держит main, — pre-push.
  const planGated = !protRes.ok && /Upgrade to GitHub (Pro|Team)/i.test(protRes.err);
  if (planGated) {
    const hook = checkPrePushHook();
    if (hook.ok) {
      add('OK', 'защита main', `server-side защиты нет (план репо), барьер жив — ${hook.why}`);
    } else {
      add('FAIL', 'защита main', `server-side защиты нет (план репо), и локальный барьер тоже: ${hook.why}`,
        'npm install в этом чекауте (postinstall ставит core.hooksPath) либо освежить корневой чекаут');
    }
  } else if (!protRaw) {
    add('FAIL', 'защита main', 'branch protection ОТКЛЮЧЕНА (или нет прав её видеть)',
      'Settings → Branches → main: required checks test+e2e + Include administrators');
  } else {
    try {
      const prot = JSON.parse(protRaw);
      const checks = prot.required_status_checks?.contexts ?? [];
      const missing = ['test', 'e2e'].filter((c) => !checks.includes(c));
      if (missing.length || !prot.enforce_admins?.enabled) {
        const what = [
          ...(missing.length ? [`нет обязательных чеков: ${missing.join(', ')}`] : []),
          ...(prot.enforce_admins?.enabled ? [] : ['enforce_admins выключен']),
        ].join('; ');
        add('FAIL', 'защита main', what, 'Settings → Branches → main — вернуть как было');
      } else {
        add('OK', 'защита main', `чеки [${checks.join(', ')}] + enforce_admins`);
      }
    } catch {
      add('WARN', 'защита main', 'ответ GitHub не распарсился — проверить руками');
    }
  }

  // 7. Последний Production-деплой Vercel обязан быть коммитом из main.
  const depRaw = tryGh(['api', `repos/${repoSlug}/deployments?environment=Production&per_page=1`]);
  const depSha = depRaw ? (() => { try { return JSON.parse(depRaw)[0]?.sha; } catch { return null; } })() : null;
  if (!depSha) {
    add('WARN', 'прод-деплой', 'Production-деплоев не видно — проверить руками');
  } else if (gitOk(['merge-base', '--is-ancestor', depSha, 'origin/main'])) {
    add('OK', 'прод-деплой', `последний Production = ${depSha.slice(0, 7)}, лежит в main`);
  } else {
    add('FAIL', 'прод-деплой', `последний Production ${depSha.slice(0, 7)} НЕ из main`,
      'Vercel деплоит не ту ветку — проверить Vercel → Settings → Git (проект athlete-pro-v7)');
  }
}

// --- 8. Бюджет доков --------------------------------------------------------
// Репозиторные файлы гейтит `test/docs-budget.test.js` в npm test и CI — здесь только
// показываем число. MEMORY.md лежит вне репо: ни один PR его не починит, поэтому WARN,
// а не FAIL. Жёсткий гард на рутинном пути, который нельзя удовлетворить, учит обходу.
{
  const { total } = measureHotPath();
  const memPath = findMemoryIndex();
  const mem = memPath ? measureFile(memPath).tokens : 0;
  const over = violations();
  const startup = `стартовая нагрузка ~${total + mem} ток (репо ${total}/${BUDGETS.TOTAL}${mem ? `, память ${mem}` : ''})`;
  if (over.length) {
    add('WARN', 'бюджет доков', `${startup} — превышение: ${over.join('; ')}`, 'npm run docs:budget — резать, а не поднимать потолок');
  } else if (mem > 3000) {
    add('WARN', 'бюджет доков', `${startup} — индекс памяти разросся`, 'DOCS-2: закрытое из индекса вон, хук ≤80 символов');
  } else {
    add('OK', 'бюджет доков', startup);
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
