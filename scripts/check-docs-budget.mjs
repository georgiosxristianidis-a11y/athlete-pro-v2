#!/usr/bin/env node
// Бюджет доков — сколько стоит «система» в токенах на старте каждой сессии.
//
// Горячий путь — файлы, которые грузит КАЖДАЯ сессия КАЖДОГО агента, до первой
// строчки работы. Их цена умножается на число сессий, поэтому они и гейтятся,
// а 417 КБ хендоффов — нет: хендофф грузится один и по делу.
//
// Потолки назначены ДО урезки, а не сняты с факта после неё: потолок по факту
// узаконивает тот размер, на котором стало жалко резать.
//
// MEMORY.md лежит ВНЕ репозитория (~/.claude/projects/<slug>/memory/) — до него
// не дотянется ни CI, ни PR. Поэтому он считается, печатается, но не валит:
// жёсткий гард на файле, который нельзя починить ни одним PR, обучает обходу.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Потолки в оценке токенов. Правка числа вверх = решение, а не правка числа.
export const BUDGETS = {
  'CLAUDE.md': 3000,
  'NEXT_SESSION.md': 2000,
  TOTAL: 5000,
};

export const HOT_FILES = ['CLAUDE.md', 'NEXT_SESSION.md'];

// Кириллица ≈ 2 симв/токен, латиница с разметкой ≈ 3.5. Формула детерминирована
// и не требует токенизатора; её задача — не точность до токена, а сопоставимость
// прогонов и честная цена русского текста (он вдвое дороже английского).
export function estimateTokens(text) {
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
  return Math.round(cyr / 2 + (text.length - cyr) / 3.5);
}

export function measureFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
  return {
    chars: text.length,
    lines: text.split('\n').length,
    cyrShare: text.length ? Math.round((cyr / text.length) * 100) : 0,
    tokens: estimateTokens(text),
  };
}

export function measureHotPath(root = ROOT) {
  const files = HOT_FILES.map((f) => ({ file: f, ...measureFile(path.join(root, f)) }));
  return { files, total: files.reduce((a, f) => a + f.tokens, 0) };
}

// Память вне репо: ищем по имени каталога проекта, а не по хардкоду пользователя.
export function findMemoryIndex() {
  const base = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(base)) return null;
  for (const dir of fs.readdirSync(base)) {
    if (!/athlete-pro/i.test(dir)) continue;
    const candidate = path.join(base, dir, 'memory', 'MEMORY.md');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function violations(root = ROOT) {
  const { files, total } = measureHotPath(root);
  const out = [];
  for (const f of files) {
    const cap = BUDGETS[f.file];
    if (cap && f.tokens > cap) out.push(`${f.file}: ~${f.tokens} токенов при потолке ${cap}`);
  }
  if (total > BUDGETS.TOTAL) out.push(`горячий путь: ~${total} токенов при потолке ${BUDGETS.TOTAL}`);
  return out;
}

// --- CLI --------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const row = (name, m, cap) =>
    `  ${String(m.tokens).padStart(6)} ток | ${String(m.chars).padStart(6)} симв | ${String(m.cyrShare + '%').padStart(4)} кир | ${cap ? `потолок ${cap}` : '—'.padEnd(12)} | ${name}`;

  const { files, total } = measureHotPath();
  console.log('\nГорячий путь — платится каждой сессией каждого агента:\n');
  for (const f of files) console.log(row(f.file, f, BUDGETS[f.file]));
  console.log(`  ${String(total).padStart(6)} ток | итого в репо, потолок ${BUDGETS.TOTAL}`);

  const mem = findMemoryIndex();
  if (mem) {
    const m = measureFile(mem);
    console.log(row('MEMORY.md (вне репо, не гейтится)', m, null));
    console.log(`  ${String(total + m.tokens).padStart(6)} ток | ИТОГО стартовая нагрузка`);
  }

  // Хендоффы — только видимость. Вне горячего пути, гейта на них нет.
  const hDir = path.join(ROOT, 'docs', 'handoff');
  if (fs.existsSync(hDir)) {
    const hs = fs
      .readdirSync(hDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ file: f, ...measureFile(path.join(hDir, f)) }))
      .sort((a, b) => b.tokens - a.tokens);
    console.log('\nХендоффы (грузятся выборочно, гейта нет — только видимость):\n');
    for (const h of hs.slice(0, 5)) console.log(row(h.file, h, null));
    console.log(`  ${String(hs.reduce((a, h) => a + h.tokens, 0)).padStart(6)} ток | всего в ${hs.length} хендоффах`);
  }

  const bad = violations();
  if (bad.length) {
    console.log('\nПРЕВЫШЕНИЕ:');
    for (const v of bad) console.log(`  - ${v}`);
    console.log('\nРезать, а не поднимать потолок.\n');
    process.exit(1);
  }
  console.log('\nБюджет доков в норме.\n');
}
