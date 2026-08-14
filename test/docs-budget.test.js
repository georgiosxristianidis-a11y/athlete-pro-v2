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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUDGETS, HOT_FILES, measureHotPath, estimateTokens } from '../scripts/check-docs-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('оценка токенов: кириллица дороже латиницы примерно вдвое', () => {
  const ru = estimateTokens('а'.repeat(700));
  const en = estimateTokens('a'.repeat(700));
  assert.equal(ru, 350);
  assert.equal(en, 200);
  assert.ok(ru > en, 'кириллица обязана оцениваться дороже — на этом стоит выбор языка файла');
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
