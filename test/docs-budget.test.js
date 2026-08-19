// Гейт бюджета доков (DOCS-1).
//
// Горячий путь — `CLAUDE.md` + `NEXT_SESSION.md` — грузится каждой сессией каждого агента
// до первой строчки работы, поэтому его цена умножается на число сессий. Правило «не больше
// 200 строк» в CLAUDE.md существовало и соблюдалось, пока файл рос до 11 КБ: мерить надо то,
// что платится (токены), и падать, а не декларировать. Разбор — docs/_archive/INCIDENTS.md.
//
// Потолок поднимать нельзя: не влезло — резать, детали переносить в `.claude/rules/*.md`
// (грузятся лениво по путям) или в `docs/RULES.md`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUDGETS,
  HOT_FILES,
  measureHotPath,
  measureFile,
  estimateTokens,
} from '../scripts/check-docs-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Строка длиннее одной: дефект копеечный на символ и виден только на объёме —
// на CLAUDE.md он давал ~27 токенов и ровно 11 токенов перебора.
const SAMPLE = Array.from({ length: 200 }, (_, i) => `строка ${i} — hot path line`).join('\n');

test('оценка токенов не зависит от перевода строки (DOCS-4)', () => {
  const lf = estimateTokens(SAMPLE);
  const crlf = estimateTokens(SAMPLE.replace(/\n/g, '\r\n'));
  assert.equal(
    crlf,
    lf,
    'CRLF считался дороже LF: гейт краснел на Windows и зеленел в Linux-CI при одинаковом тексте',
  );
});

test('файл с CRLF меряется как тот же файл с LF (DOCS-4)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-budget-'));
  try {
    const lfPath = path.join(dir, 'lf.md');
    const crlfPath = path.join(dir, 'crlf.md');
    fs.writeFileSync(lfPath, SAMPLE);
    fs.writeFileSync(crlfPath, SAMPLE.replace(/\n/g, '\r\n'));

    const lf = measureFile(lfPath);
    const crlf = measureFile(crlfPath);

    // Байты на диске обязаны различаться — иначе тест не воспроизводит дефект.
    assert.ok(
      fs.statSync(crlfPath).size > fs.statSync(lfPath).size,
      'подстава не удалась: файлы одинакового размера, мерить нечего',
    );
    assert.equal(crlf.tokens, lf.tokens, 'токены разъехались между CRLF и LF');
    assert.equal(crlf.chars, lf.chars, 'символы разъехались между CRLF и LF');
    assert.equal(crlf.lines, lf.lines, 'строки разъехались между CRLF и LF');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('оценка токенов: кириллица дороже латиницы примерно вдвое', () => {
  const ru = estimateTokens('а'.repeat(700));
  const en = estimateTokens('a'.repeat(700));
  assert.equal(ru, 350);
  assert.equal(en, 200);
  assert.ok(ru > en, 'кириллица обязана оцениваться дороже — на этом стоит выбор языка файла');
});

test('оценка токенов: markdown-разметка/цифры считаются посимвольно (TOK-8)', () => {
  // Ветка формулы, не задетая ни инвариантом выше (чистые буквы), ни целыми файлами
  // (там structural смешан с cyr/plain — совпадение с фактом не доказывает, что именно
  // эта ветка верна). Здесь — строка без единой буквы и без кириллицы: весь счёт идёт
  // только через `structural / 1`.
  const structural = estimateTokens('-'.repeat(100));
  assert.equal(structural, 100, 'пунктуация/цифры вне букв обязаны идти 1 симв = 1 токен');

  const digits = estimateTokens('0123456789'.repeat(10));
  assert.equal(digits, 100, 'цифры считаются той же веткой, что и остальная разметка');

  // Смешанная строка: буквы по 3.5, дефисы по 1 — проверяет, что деление на plain/structural
  // не путает символы местами внутри одной строки.
  const mixed = estimateTokens('aaaaaaa' + '-'.repeat(10));
  assert.equal(mixed, Math.round(7 / 3.5 + 10 / 1), 'plain и structural не должны смешивать делители');
});

test('каждый файл горячего пути влезает в свой потолок', () => {
  const { files } = measureHotPath(ROOT);
  assert.equal(files.length, HOT_FILES.length);
  for (const f of files) {
    const cap = BUDGETS[f.file];
    assert.ok(cap, `для ${f.file} не назначен потолок`);
    assert.ok(
      f.tokens <= cap,
      `${f.file}: ~${f.tokens} токенов при потолке ${cap}. Резать, а не поднимать потолок — ` +
        'детали в .claude/rules/*.md или docs/RULES.md, здесь строка-ссылка.',
    );
  }
});

test('сумма горячего пути влезает в общий потолок', () => {
  const { total } = measureHotPath(ROOT);
  assert.ok(
    total <= BUDGETS.TOTAL,
    `горячий путь ~${total} токенов при потолке ${BUDGETS.TOTAL} — стартовая нагрузка каждой сессии`,
  );
});
