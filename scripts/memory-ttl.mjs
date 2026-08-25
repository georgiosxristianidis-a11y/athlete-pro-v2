#!/usr/bin/env node
// CLI: применяет TTL к каталогу памяти (карточка FLOW-4). Логика — в
// `memory-core.mjs`, здесь только диск и печать.
//
// Дефолт — dry-run: показывает, что БЫ переехало и сколько токенов освободится
// в `MEMORY.md`. Реальный переезд — только с `--commit`, потому что данные
// живут вне репо и промахнуться дороже, чем спросить.
//
// Путь к памяти ищется тем же способом, что и в `check-docs-budget.mjs`:
// каталог `~/.claude/projects/<...>/memory` с приметой `athlete-pro` в имени.
// Переопределяется `--dir <path>` (и это же используется в тестах).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditIndex,
  computeVictims,
  MAX_HOOK_CHARS,
  parseFrontmatter,
  rewriteIndex,
  TOKENS_PER_ENTRY,
} from './memory-core.mjs';
import { BUDGETS, estimateTokens } from './check-docs-budget.mjs';

function findMemoryDir(explicit) {
  if (explicit) return path.resolve(explicit);
  const base = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(base)) return null;
  for (const dir of fs.readdirSync(base)) {
    if (!/athlete-pro/i.test(dir)) continue;
    const candidate = path.join(base, dir, 'memory');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function collectEntries(memoryDir) {
  const out = [];
  for (const name of fs.readdirSync(memoryDir)) {
    if (name === 'MEMORY.md') continue;
    if (name.startsWith('_')) continue; // _archive/ и родня в игнор
    if (!name.endsWith('.md')) continue;
    const full = path.join(memoryDir, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const text = fs.readFileSync(full, 'utf8');
    out.push({
      file: name,
      path: full,
      mtimeMs: stat.mtimeMs,
      frontmatter: parseFrontmatter(text),
    });
  }
  return out;
}

function archiveDest(memoryDir, victim, nowMs) {
  const ts = victim.frontmatter?.modified
    ? Date.parse(victim.frontmatter.modified)
    : victim.mtimeMs;
  const d = new Date(Number.isFinite(ts) ? ts : nowMs);
  const bucket = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return path.join(memoryDir, '_archive', bucket, victim.file);
}

function parseArgs(argv) {
  const args = { commit: false, dir: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--dry-run') args.commit = false;
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--now') args.now = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`memory-ttl — TTL для файлов ~/.claude/.../memory (карточка FLOW-4)

  --dry-run       (по умолчанию) показать вердикт, ничего не двигать
  --commit        перенести стейл-файлы в _archive/YYYY-MM/ и переписать MEMORY.md
  --dir <path>    переопределить каталог памяти (для тестов и ревизий)
  --now <iso>     переопределить «сейчас» (для тестов)

Политика TTL по типам frontmatter (metadata.type):
  project  → 30 дней   (namespace events)
  прочее   → ∞         (artifacts: правила, роль, купленные уроки)
`);
}

export function run({ dir, commit = false, nowIso = null, stdout = process.stdout } = {}) {
  const memoryDir = findMemoryDir(dir);
  if (!memoryDir) {
    stdout.write('Каталог памяти не найден. Укажи --dir <path> или проверь ~/.claude/projects.\n');
    return { ok: false };
  }

  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  if (Number.isNaN(nowMs)) {
    stdout.write(`--now: не парсится дата "${nowIso}"\n`);
    return { ok: false };
  }

  const entries = collectEntries(memoryDir);
  const victims = computeVictims(entries, undefined, nowMs);

  const indexPath = path.join(memoryDir, 'MEMORY.md');
  const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const before = { chars: indexText.length, tokens: estimateTokens(indexText) };

  const { text: newIndex, removed } = rewriteIndex(
    indexText,
    victims.map((v) => v.file)
  );
  const after = { chars: newIndex.length, tokens: estimateTokens(newIndex) };

  stdout.write(`\nКаталог: ${memoryDir}\n`);
  stdout.write(`Файлов памяти: ${entries.length}, стейл под TTL: ${victims.length}\n\n`);

  if (victims.length) {
    stdout.write('Кандидаты в архив (type · возраст · файл):\n');
    for (const v of victims.slice().sort((a, b) => b.ageDays - a.ageDays)) {
      stdout.write(
        `  ${v.frontmatter?.type?.padEnd(9) || 'unknown'.padEnd(9)} ${String(Math.round(v.ageDays)).padStart(4)}д  ${v.file}\n`
      );
    }
    stdout.write('\n');
  }

  stdout.write(
    `MEMORY.md: ${before.tokens} → ${after.tokens} ток (` +
      `${before.chars} → ${after.chars} симв), строк удалено: ${removed}\n`
  );

  // Потолок и запас печатаются всегда: без них «6793 токена» ничего не значит,
  // а WARN, который горит каждую сессию, перестают читать.
  const cap = BUDGETS.MEMORY_INDEX;
  const slack = cap - after.tokens;
  stdout.write(
    `Потолок ${cap} ток, запас ${slack} — ` +
      (slack < 0 ? 'ПРЕВЫШЕНИЕ, резать индекс\n' : slack < cap * 0.1 ? 'на исходе\n' : 'в норме\n')
  );

  // Аудит индекса. Считаем по индексу ПОСЛЕ переписывания, иначе в список работ
  // попадут строки, которые сейчас же и уедут в архив.
  const audit = auditIndex(newIndex);
  const roomEntries = Math.floor(slack / TOKENS_PER_ENTRY);
  stdout.write(
    `Записей в индексе: ${audit.entries.length}, ~${TOKENS_PER_ENTRY} ток на запись — ` +
      `место ещё под ${roomEntries}\n`
  );

  if (audit.offenders.length) {
    stdout.write(
      `\nХуки длиннее ${MAX_HOOK_CHARS} симв: ${audit.offenders.length}, ` +
        `перебор ${audit.excessChars} симв (~${estimateTokens('а'.repeat(audit.excessChars))} ток)\n`
    );
    for (const o of audit.offenders
      .slice()
      .sort((a, b) => b.overBy - a.overBy)
      .slice(0, 10)) {
      stdout.write(
        `  строка ${String(o.line).padStart(3)}  +${String(o.overBy).padStart(3)} симв  ${o.title.slice(0, 46)}\n`
      );
    }
    if (audit.offenders.length > 10) {
      stdout.write(`  … и ещё ${audit.offenders.length - 10}\n`);
    }
    stdout.write('  Резать хук, не имя файла: имя — цена навигации, хук — цена привычки.\n');
  }

  if (!commit) {
    stdout.write('\nDry-run. Реальный перенос — с флагом --commit.\n');
    return { ok: true, victims, removed, before, after, committed: false };
  }

  // Реальный переезд. Порядок: сперва переписываем индекс — если файлы уже
  // перенесены, а индекс не тронут, при повторном запуске мы теряем связь.
  fs.writeFileSync(indexPath, newIndex);
  for (const v of victims) {
    const dest = archiveDest(memoryDir, v, nowMs);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(v.path, dest);
  }
  stdout.write(`\nПеренесено файлов: ${victims.length}. Индекс переписан.\n`);
  return { ok: true, victims, removed, before, after, committed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const res = run({ dir: args.dir, commit: args.commit, nowIso: args.now });
  process.exit(res.ok ? 0 : 1);
}
