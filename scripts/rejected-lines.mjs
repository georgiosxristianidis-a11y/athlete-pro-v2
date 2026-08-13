// Отвергнутые линии — общий источник правды для preflight и гарда дрейфа.
//
// Карточка BASE-1 (гард в preflight) и её ревизия грилежом 2026-08-13.
//
// Мина. Ворктри агента трижды подряд приезжал нарезанным от `feature/elite-hud-wow`
// — линии, по которой вынесен вердикт «не вливать»: утечка BYOK-ключа в
// неаутентифицированный эндпоинт, синк мимо `airgap`, снесённый `SyncManager`,
// ослабленный `air-guard`. Каждый раз ловил тот агент, который посмотрел сам.
//
// Три решения, купленные разбором, — они же причина, почему это отдельный модуль:
//
// 1. ЯКОРЬ — SHA, НЕ ИМЯ МЕТКИ. Метка `checkpoint-elite-hud-wow` на момент разбора
//    вообще не была запушена на origin, а на том же коммите висело ДЕВЯТЬ рефов.
//    То есть гард опирался на единственный ref, который проще всего потерять, при
//    линии, размноженной по девяти именам. SHA нельзя переименовать, удалить или
//    забыть запушить: он либо достижим из базы, либо нет.
//
// 2. ОТСУТСТВИЕ ОБЪЕКТА — ЭТО ОТВЕТ, А НЕ СЛЕПОТА. Если коммита нет в локальном
//    хранилище, он не может быть предком HEAD. Поэтому «объекта нет» читается как
//    «чисто», и гард работает в свежем клоне, где донорских веток не выкачано.
//
// 3. ВЛИТОЕ В MAIN ОТВЕРГНУТЫМ НЕ СЧИТАЕТСЯ. Если линия однажды легально приедет
//    в `main`, гард замолкает сам, без правки списка. Красный, который «всегда
//    такой», перестают читать целиком — этого и избегаем.
//
// Новая отвергнутая линия добавляется строкой в REJECTED_LINES тем же PR, что и
// вердикт (CLAUDE.md § Multi-Agent Protocol). Список, который пополняется памятью,
// — тот же класс отказа, что и сама BASE-1.

import { execFileSync } from 'node:child_process';

/**
 * @typedef {{ sha: string, name: string, why: string }} RejectedLine
 */

/** @type {RejectedLine[]} */
export const REJECTED_LINES = [
  {
    sha: '8e23fd60a83649f62d9da0bfa5878a476dda9acd',
    name: 'checkpoint-elite-hud-wow',
    why: 'линия feature/elite-hud-wow, вердикт 2026-08-11 «не вливать» (утечка BYOK-ключа)',
  },
];

function gitOk(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ищет отвергнутые линии в базе рабочего дерева.
 *
 * @param {{ cwd?: string, ref?: string, mainRef?: string, lines?: RejectedLine[] }} [opts]
 * @returns {{ mainKnown: boolean, hits: RejectedLine[] }}
 *   `mainKnown` — удалось ли свериться с main. Пуст он или нет, найденные линии
 *   всё равно возвращаются: метка в базе — факт, а «а вдруг её уже влили» —
 *   исключение, которое без main просто не проверить.
 *
 * `lines` подменяется только тестом: настоящий SHA в синтетический репозиторий
 * не подложить, а логика обязана проверяться там, где нет живой истории проекта.
 * Через окружение список НЕ переопределяется намеренно — это была бы тихая
 * форточка «выключить гард переменной», ради которой гард и городили.
 */
export function scanBase({
  cwd = process.cwd(),
  ref = 'HEAD',
  mainRef = 'origin/main',
  lines = REJECTED_LINES,
} = {}) {
  const mainKnown = gitOk(['rev-parse', '--verify', '--quiet', `${mainRef}^{commit}`], cwd);

  const hits = lines.filter(({ sha }) => {
    // Объекта нет локально — значит он не достижим из ref, см. решение 2.
    if (!gitOk(['cat-file', '-e', `${sha}^{commit}`], cwd)) return false;
    if (!gitOk(['merge-base', '--is-ancestor', sha, ref], cwd)) return false;
    return !(mainKnown && gitOk(['merge-base', '--is-ancestor', sha, mainRef], cwd));
  });

  return { mainKnown, hits };
}
