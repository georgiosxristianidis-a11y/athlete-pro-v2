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
 * Потолок можно и нужно снижать при каждом переводе экрана на `html`.
 * Поднимать — только осознанно, с причиной в коммите.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Замер 2026-11-10 на 9f87f9dd: 127 без комментариев (сырой grep -c даёт 136). */
const MAX_RAW_INNERHTML = 127;

/** Вырезает блочные и строчные комментарии; `(^|[^:])` бережёт `http://`. */
function stripComments(/** @type {string} */ src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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

/** @param {string} src */
function countRaw(src) {
  return (stripComments(src.replace(/\r\n/g, '\n')).match(/\binnerHTML\b/g) || []).length;
}

describe('AUD-1: храповик сырого innerHTML', () => {
  test(`сырых innerHTML в js/ не больше ${MAX_RAW_INNERHTML}`, () => {
    let total = 0;
    /** @type {string[]} */
    const perFile = [];
    for (const file of jsFiles(path.join(REPO_ROOT, 'js'))) {
      const hits = countRaw(fs.readFileSync(file, 'utf8'));
      if (hits) {
        total += hits;
        perFile.push(`${path.relative(REPO_ROOT, file).replace(/\\/g, '/')}: ${hits}`);
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
});
