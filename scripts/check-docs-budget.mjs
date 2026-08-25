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
  // Индекс памяти живёт вне репо, поэтому его потолок стоит здесь как число, а
  // не как тест: гейтит его preflight, локально, где его и можно починить
  // (FLOW-4). Число выбрано ДО урезки — на 2026-08-25 индекс весил 6973.
  MEMORY_INDEX: 7500,
};

export const HOT_FILES = ['CLAUDE.md', 'NEXT_SESSION.md'];

// Перевод строки нормализуется ДО счёта, и это не косметика (DOCS-4).
//
// Мерили файл с диска, а при `core.autocrlf=true` он на каждой строке толще
// индекса: CLAUDE.md давал 11636 байт против 11542 — лишние 94 CR, ~27 токенов.
// Этого хватало, чтобы гейт был КРАСНЫМ на любом Windows-чекауте и ЗЕЛЁНЫМ в
// Linux-CI при побайтово одинаковом содержимом. То есть гард отвечал на вопрос
// «какая у тебя ОС», притворяясь ответом про цену доков — а красный, который
// «всегда такой», перестают читать целиком, и следующее настоящее превышение
// проехало бы незамеченным.
//
// Нормализация живёт здесь, в самом измерителе, а не в вызывающих: иначе она
// протухнет ровно в тот момент, когда появится второй вызывающий.
const normalize = (text) => String(text).replace(/\r\n/g, '\n');

// Кириллица ≈ 2 симв/токен, латинская проза ≈ 3.5 (TOK-8: калибровано и остаётся
// эталоном для текста без разметки — на нём и стоит инвариант «кир вдвое дороже
// лат» в docs-budget.test.js).
//
// Markdown-разметка внутри латиницы (пунктуация, цифры, пути, kebab-case: `|`,
// `` ` ``, `-`, `[`, `]`, `.`, `/`) в BPE почти всегда своим токеном, а не сливается
// с буквами соседнего слова — общий делитель 3.5 на ней занижал факт. Проверено
// по /context 2026-08-19 на CLAUDE.md (оценка 2988 при факте 3.7k, −24%) и
// MEMORY.md (оценка 4120 при факте 5.6k, −36%): разбив латиницу на «буквы+пробелы»
// (÷3.5, как раньше) и «остальное» (÷1, посимвольно), обе точки бьются в пределах
// ~2%. Двух точек мало для точной калибровки — если появится третья, сверить и
// поправить делитель `structural`.
export function estimateTokens(text) {
  const src = normalize(text);
  const cyr = (src.match(/[Ѐ-ӿ]/g) || []).length;
  const structural = (src.match(/[^Ѐ-ӿA-Za-z\s]/g) || []).length;
  const plain = src.length - cyr - structural;
  return Math.round(cyr / 2 + plain / 3.5 + structural / 1);
}

export function measureFile(absPath) {
  // Нормализуем и здесь: `chars` и `lines` печатаются в отчёте и разъезжались
  // между ОС ровно так же, как токены.
  const text = normalize(fs.readFileSync(absPath, 'utf8'));
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
  if (total > BUDGETS.TOTAL)
    out.push(`горячий путь: ~${total} токенов при потолке ${BUDGETS.TOTAL}`);
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
    console.log(row('MEMORY.md (вне репо, гейтит preflight)', m, BUDGETS.MEMORY_INDEX));
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
    console.log(
      `  ${String(hs.reduce((a, h) => a + h.tokens, 0)).padStart(6)} ток | всего в ${hs.length} хендоффах`
    );
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
