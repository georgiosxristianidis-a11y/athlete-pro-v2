// PERF-INLINE TEST-GUARD: `transition: all` анимирует и layout-свойства заодно с
// косметикой — на самом тапаемом элементе приложения (нижний таб-бар) это прямой
// кандидат в джанк при каждом переключении вкладки.
//
// `test/css-infinite-composite.test.js` (PERF-2) смотрит только `css/**` — сам же
// пишет в шапке, что инлайновые `<style>` в js/ и index.html грепом не берутся и
// гарда для них нет. На момент разведки живых адреса было три: `index.html:280`
// (#status-bar), `index.html:383` (.nav-btn) и `js/features/pip.js:169` — все три
// вне зоны PERF-2 (docs/handoff/HANDOFF_cursor_arch_cards.md, карточка PERF-INLINE).
//
// Урок reference-cssom-walk-beats-grep: наивный regex по файлу слеп на составные
// правила. Здесь его не обойти построчным regex'ом «в лоб» — извлекаем значение
// `transition` до первого `;`/`{`/`}` (комментарии вырезаны заранее), затем делим
// список на верхнеуровневые запятые вручную, не трогая запятые внутри
// `cubic-bezier(...)`. Так гард не путает `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
// (одно значение, offender) с честным многосвойственным списком.

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Стрипует /* *­/ комментарии, сохраняя переводы строк — номера строк остаются честными. */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Делит строку по разделителю верхнего уровня — запятые внутри `(...)` не считаются. */
function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

/** Все адреса `transition[-property]: ...` из текста (уже без блочных комментариев). */
function transitionOffenders(text) {
  const hits = [];
  const re = /(?<![-\w])transition(-property)?\s*:\s*([^;{}]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    for (const group of splitTopLevel(m[2], ',')) {
      const first = group.trim().split(/\s+/)[0];
      if (first && first.toLowerCase() === 'all') {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push({ line, snippet: m[0].trim().slice(0, 80) });
        break;
      }
    }
  }
  return hits;
}

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

function report(offendersByFile) {
  const lines = [];
  for (const [file, hits] of offendersByFile) {
    for (const h of hits) lines.push(`  ${relative(ROOT, file).replace(/\\/g, '/')}:${h.line}  ${h.snippet}`);
  }
  return lines.join('\n');
}

test('css/**: ноль transition: all', () => {
  const cssDir = join(ROOT, 'css');
  const offendersByFile = new Map();
  for (const file of walk(cssDir, ['.css'])) {
    const hits = transitionOffenders(stripBlockComments(readFileSync(file, 'utf8')));
    if (hits.length) offendersByFile.set(file, hits);
  }
  assert.equal(
    offendersByFile.size, 0,
    `transition: all бьёт по layout-свойствам вместе с косметикой (PERF-INLINE):\n${report(offendersByFile)}\n` +
    'Перечисли реально меняющиеся свойства явным списком.',
  );
});

test('index.html: ноль transition: all в инлайновых <style>', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const offendersByFile = new Map();
  for (const styleMatch of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const hits = transitionOffenders(stripBlockComments(styleMatch[1]));
    if (hits.length) offendersByFile.set(join(ROOT, 'index.html'), hits);
  }
  assert.equal(
    offendersByFile.size, 0,
    `transition: all в инлайновом <style> index.html — гард PERF-2 сюда не смотрит (PERF-INLINE):\n${report(offendersByFile)}`,
  );
});

test('js/**: ноль transition: all в инлайновых CSS-строках', () => {
  const jsDir = join(ROOT, 'js');
  const offendersByFile = new Map();
  for (const file of walk(jsDir, ['.js'])) {
    const hits = transitionOffenders(stripBlockComments(readFileSync(file, 'utf8')));
    if (hits.length) offendersByFile.set(file, hits);
  }
  assert.equal(
    offendersByFile.size, 0,
    `transition: all в инлайновой CSS-строке js/ — самый тапаемый таб-бар живёт именно тут (PERF-INLINE):\n${report(offendersByFile)}`,
  );
});
