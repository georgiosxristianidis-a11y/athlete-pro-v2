// @ts-check
/**
 * AUD-1 — храповик на сырой `innerHTML` в `js/`.
 *
 * Защита от XSS здесь держится на ручном `esc(`: каждый `innerHTML = ...` с
 * пользовательским вводом безопасен, только пока автор ничего не забыл. Хелпер
 * `html` из `js/shared/utils.js` экранирует интерполяции сам (`raw()` — явный
 * обход). Тест не переводит старую разметку, он только запрещает рост числа.
 *
 * Считаем вхождения слова `innerHTML` в коде `js/` без комментариев (JSDoc и
 * `//` не в счёт), `js/vendor` — сторонний код — пропускаем. Обход покрывает
 * top-level `js/*.js` и вложенные каталоги; CRLF/LF на счёт не влияет.
 *
 * Комментарии находит парсер (`espree`, приходит с eslint), а не регексп по
 * сырому тексту: регексп принимал `/*` в строке `accept="image/*"` за начало
 * комментария и съедал сотню строк живого кода до ближайшего закрытия. Файл,
 * который парсер не разобрал, роняет тест — молчаливой слепой зоны нет.
 *
 * Потолок можно и нужно снижать при каждом переводе экрана на `html`.
 * Поднимать — только осознанно, с причиной в коммите.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Замер 2026-11-11 на d12b8f59: 128 вне комментариев (сырой grep -c даёт 136). */
const MAX_RAW_INNERHTML = 128;

/**
 * Вырезает комментарии по диапазонам от парсера. Строки, шаблоны и регекспы
 * остаются как есть: `/*` и `//` внутри них — не комментарии.
 * @param {string} src
 * @param {string} [label] имя файла для сообщения об ошибке разбора
 */
function stripComments(src, label = '<src>') {
  let ast;
  try {
    ast = espree.parse(src, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      comment: true,
      range: true,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: парсер не разобрал файл, счёт innerHTML невозможен — ${reason}`, {
      cause: err,
    });
  }
  let out = '';
  let pos = 0;
  for (const comment of ast.comments ?? []) {
    const [start, end] = /** @type {[number, number]} */ (comment.range);
    out += src.slice(pos, start);
    pos = end;
  }
  return out + src.slice(pos);
}

/** @param {string} dir @returns {string[]} */
function jsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'vendor') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** @param {string} src @param {string} [label] */
function countRaw(src, label) {
  return (stripComments(src, label).match(/\binnerHTML\b/g) || []).length;
}

describe('AUD-1: храповик сырого innerHTML', () => {
  test(`сырых innerHTML в js/ не больше ${MAX_RAW_INNERHTML}`, () => {
    let total = 0;
    /** @type {string[]} */
    const perFile = [];
    for (const file of jsFiles(path.join(REPO_ROOT, 'js'))) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      const hits = countRaw(fs.readFileSync(file, 'utf8'), rel);
      if (hits) {
        total += hits;
        perFile.push(`${rel}: ${hits}`);
      }
    }
    assert.ok(
      total <= MAX_RAW_INNERHTML,
      `сырых innerHTML стало ${total} при потолке ${MAX_RAW_INNERHTML}.\n` +
        'Используй html из js/shared/utils.js (автоэкранирование, raw() для доверенной разметки). ' +
        'Потолок снижать можно и нужно; поднимать — только с причиной в коммите.\n' +
        perFile.join('\n')
    );
  });

  test('счётчик режет комментарии и не зависит от CRLF', () => {
    assert.equal(countRaw('// el.innerHTML = x;\n/* a.innerHTML\n b.innerHTML */\n'), 0);
    assert.equal(countRaw('el.innerHTML = x;\r\nb.innerHTML = y; // c.innerHTML\r\n'), 2);
  });

  test('`/*` и `//` внутри строки, шаблона и регекспа — не комментарий', () => {
    // Слепая зона регекспа (ревью 11.11): `accept="image/*"` открывал «комментарий»
    // до ближайшего закрытия и прятал живой innerHTML между ними.
    const blockInString = [
      'const input = \'<input accept="image/*">\';',
      'screen.innerHTML = input;',
      '/** настоящий комментарий: a.innerHTML */',
      'other.innerHTML = input;',
    ].join('\n');
    assert.equal(countRaw(blockInString), 2);

    assert.equal(countRaw('const u = "http://x//y"; el.innerHTML = u;\n'), 1);
    assert.equal(countRaw("const s = '// не комментарий'; el.innerHTML = s;\n"), 1);
    assert.equal(countRaw('const t = `a /* ${x} // b`; el.innerHTML = t; /* c.innerHTML */\n'), 1);
    assert.equal(
      countRaw('const re = /\\/\\*|\\/\\//; el.innerHTML = re.source; // d.innerHTML\n'),
      1
    );
  });

  test('неразборчивый файл роняет счёт, а не даёт ноль', () => {
    assert.throws(
      () => countRaw('el.innerHTML = ;', 'js/broken.js'),
      /js\/broken\.js: парсер не разобрал/
    );
  });
});
