#!/usr/bin/env node
// Гейт наряда проверяется до выдачи (карточка AGENT-7).
//
// Мина. В наряде LAUNCH-5A стоял `prettier --check .` — красный по всему репо
// исторически (226 файлов, в CI проверка снята намеренно). Исполнитель получил
// красный гейт на чистой базе, прогнал prettier по своим файлам, сломал парсер
// теста паритета и закрыл каскад коммитом-фиксом `98e281a`. Правило «проверь
// на свежем main» дописали в скилл 26.08 — механики не было, и следующий
// наряд мог повторить ровно ту же ошибку.
//
// Этот скрипт — механика. Перед выдачей оркестратор гоняет цепочку из поля
// ГЕЙТ на чистом дереве и вписывает SHA, на котором она дала ноль. Исполнитель
// видит не обещание, а якорь. Без якоря или при ненулевом коде наряд не
// выдаётся.
//
// Что сознательно НЕ делается: второй сторож в CI на каждый PR. Наряд живёт
// вне коммита (чат / worktree), а не в дереве. Гард — команда + тест формы
// скилла; дрейф текста скилла ловит suite, а не GitHub Actions.

import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/**
 * Команды, которые на чистом дереве этого репо красны исторически.
 * Список короткий намеренно: это не «все плохие гейты», а известные мины,
 * которые уже уезжали в наряд. Новая мина — строка сюда тем же PR, что и
 * разбор.
 */
export const KNOWN_RED = [
  {
    match: (cmd) => /\bprettier\s+--check\s+\.(?:\s|$)/.test(cmd),
    why: 'prettier --check . красен по всему репо исторически (CI проверку снял намеренно); в наряде — prettier только по своим файлам',
  },
];

/**
 * Разбивает цепочку `a && b && c` на отдельные команды.
 * Кавычки уважаются: `npm test -- "a && b"` остаётся одной командой.
 * @param {string} chain
 * @returns {string[]}
 */
export function splitGateChain(chain) {
  const out = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < chain.length; i++) {
    const ch = chain[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '&' && chain[i + 1] === '&') {
      const piece = buf.trim();
      if (piece) out.push(piece);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Достаёт поле ГЕЙТ из текста наряда / скилла.
 * Принимает строку вида `ГЕЙТ: cmd && cmd` или `ГЕЙТ: cmd # verified @ abc`.
 * @param {string} text
 * @returns {{ chain: string, verifiedSha: string | null } | null}
 */
export function parseGateField(text) {
  const m = String(text).match(/^\s*ГЕЙТ:\s*(.+)$/m);
  if (!m) return null;
  const raw = m[1].trim();
  const verified = raw.match(/#\s*verified\s+@\s*([0-9a-fA-F]{7,40})\b/);
  const chain = (verified ? raw.slice(0, verified.index) : raw).trim().replace(/[;,.]+$/, '');
  if (!chain || chain.startsWith('<')) return null;
  return { chain, verifiedSha: verified ? verified[1] : null };
}

/**
 * @param {string} cmd
 * @returns {{ known: boolean, why?: string }}
 */
export function classifyCommand(cmd) {
  for (const rule of KNOWN_RED) {
    if (rule.match(cmd)) return { known: true, why: rule.why };
  }
  return { known: false };
}

/**
 * @param {string} sha
 * @param {{ cwd?: string, git?: (args: string[]) => string }} [opts]
 * @returns {{ ok: boolean, full?: string, error?: string }}
 */
export function resolveSha(sha, opts = {}) {
  const cwd = opts.cwd ?? REPO;
  const git =
    opts.git ??
    ((args) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim());
  try {
    const full = git(['rev-parse', '--verify', `${sha}^{commit}`]);
    return { ok: true, full };
  } catch (err) {
    const stderr = String(err?.stderr || err?.message || '').trim();
    return { ok: false, error: stderr || `SHA ${sha} не резолвится` };
  }
}

/**
 * @param {string} cmd
 * @param {{ cwd?: string, spawn?: typeof spawnSync, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function runCommand(cmd, opts = {}) {
  const cwd = opts.cwd ?? REPO;
  const spawn = opts.spawn ?? spawnSync;
  const res = spawn(cmd, {
    cwd,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: res.status ?? 1,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  };
}

/**
 * Прогоняет цепочку гейта. Возвращает структурированный отчёт — CLI печатает
 * его и выставляет код выхода.
 * @param {string} chain
 * @param {{ cwd?: string, sha?: string | null, spawn?: typeof spawnSync, git?: Function }} [opts]
 */
export function checkGate(chain, opts = {}) {
  const commands = splitGateChain(chain);
  if (!commands.length) {
    return { ok: false, code: 2, errors: ['пустая цепочка ГЕЙТ'] };
  }

  const errors = [];
  for (const cmd of commands) {
    const known = classifyCommand(cmd);
    if (known.known) {
      errors.push(`${cmd}\n  известная мина: ${known.why}`);
    }
  }
  if (errors.length) {
    return { ok: false, code: 2, errors, commands };
  }

  const results = [];
  for (const cmd of commands) {
    const res = runCommand(cmd, opts);
    results.push({ cmd, ...res });
    if (res.status !== 0) {
      errors.push(
        `${cmd} — exit ${res.status}` +
          (res.stderr.trim() ? `\n${res.stderr.trim()}` : '') +
          (res.stdout.trim() ? `\n${res.stdout.trim().split('\n').slice(-8).join('\n')}` : '')
      );
      return { ok: false, code: 1, errors, commands, results };
    }
  }

  let shaInfo = null;
  if (opts.sha) {
    shaInfo = resolveSha(opts.sha, opts);
    if (!shaInfo.ok) {
      return {
        ok: false,
        code: 2,
        errors: [`verified @ ${opts.sha}: ${shaInfo.error}`],
        commands,
        results,
      };
    }
  }

  return { ok: true, code: 0, commands, results, sha: shaInfo?.full ?? null };
}

/**
 * @param {{ argv?: string[], cwd?: string, exit?: (n: number) => void, stdout?: { log: Function }, stderr?: { error: Function }, spawn?: typeof spawnSync, git?: Function }} [opts]
 */
export function run(opts = {}) {
  const argv = opts.argv ?? process.argv.slice(2);
  const exit = opts.exit ?? ((code) => process.exit(code));
  const stdout = opts.stdout ?? console;
  const stderr = opts.stderr ?? console;

  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    stderr.error(
      'Usage: npm run brief:gate -- "<cmd> && <cmd>"\n' +
        '       npm run brief:gate -- --from-text "<наряд>"\n' +
        'Прогоняет цепочку ГЕЙТ на текущем дереве. Ноль = можно вписать\n' +
        '`# verified @ <sha>` рядом с полем ГЕЙТ (sha = git rev-parse --short HEAD).'
    );
    exit(argv.length ? 0 : 2);
    return;
  }

  let chain;
  let verifiedSha = null;

  if (argv[0] === '--from-text') {
    const text = argv.slice(1).join(' ');
    const parsed = parseGateField(text);
    if (!parsed) {
      stderr.error('В тексте нет заполненного поля ГЕЙТ: …');
      exit(2);
      return;
    }
    chain = parsed.chain;
    verifiedSha = parsed.verifiedSha;
  } else {
    chain = argv.join(' ').trim();
  }

  const report = checkGate(chain, {
    cwd: opts.cwd ?? REPO,
    sha: verifiedSha,
    spawn: opts.spawn,
    git: opts.git,
  });

  if (!report.ok) {
    stderr.error('ГЕЙТ наряда красный — исполнителю не выдавать:\n');
    for (const e of report.errors) stderr.error(`  ${e}\n`);
    exit(report.code);
    return report;
  }

  let headShort = '?';
  try {
    const git =
      opts.git ??
      ((args) =>
        execFileSync('git', args, {
          cwd: opts.cwd ?? REPO,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim());
    headShort = git(['rev-parse', '--short', 'HEAD']);
  } catch {
    /* печать шаблона не обязана падать вместе с git */
  }

  stdout.log(`ГЕЙТ зелёный на ${headShort}.`);
  stdout.log(`В наряд:  ГЕЙТ: ${chain}  # verified @ ${headShort}`);
  exit(0);
  return report;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  run();
}
