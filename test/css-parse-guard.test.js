// CSS-PARSE GUARD: правило, объявленное в файле, обязано доехать до браузера.
//
// Куплено кровью (2026-08-05, вкладка «Сила» в Athlete Room + шапка Журнала).
// В обоих файлах комментарий-шапка содержал текст «--fs-*/--fw-*» — а `*/`
// внутри комментария закрывает его досрочно. Хвост комментария («--fw-*/--sp-*),
// остальной файл ещё ждёт…») превращался в часть селектора следующего правила,
// и браузер выбрасывал это правило целиком:
//
//   .ar-sc-head { padding: var(--sp-2) 0 var(--sp-3) }  → padding 0
//                 (скор атлета вплотную к шкале, 0px воздуха вместо 24)
//   .jr-header  { display: flex; gap: var(--sp-1-5) }   → display: block
//                 (кнопка «назад» над заголовком вместо строки)
//
// Ни один гейт этого не видел: stylelint разбирает мусор как селектор и молчит,
// тесты про CSS ничего не знают, а глазом это читается как «иерархия почему-то
// не работает» — то есть как вкусовщина, а не как баг.
//
// Гард повторяет разбор браузера (комментарий закрывается на ПЕРВОМ `*/`) и
// сверяет два списка: что объявлено в файле и что реально стало правилом.
// Ловит не только битый комментарий, но и любую потерю правила — незакрытую
// скобку, лишнюю `}`, обрубленный селектор.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = join(__dirname, '..', 'css');

/** Стрипует комментарии ровно как браузер — нежадно, до первого закрывающего маркера. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Прелюдии всех блоков: то, что стоит перед `{`, как это увидит парсер. */
function preludes(css) {
  const src = stripComments(css);
  const out = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') { out.push(buf.trim().replace(/\s+/g, ' ')); buf = ''; continue; }
    if (ch === '}' || ch === ';') { buf = ''; continue; }
    buf += ch;
  }
  return out;
}

/** Селекторы, объявленные однострочно: `.foo {` / `#bar:active {` в начале строки. */
function declaredSelectors(css) {
  return [...stripComments(css).matchAll(/^([.#][^{}\n]{0,200}?)\s*\{/gm)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')))
    .filter(Boolean);
}

const cssFiles = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort();

test('css/ has files to guard (self-check)', () => {
  assert.ok(cssFiles.length >= 10, `expected the css/ dir, got ${cssFiles.length} files`);
});

test('каждое объявленное правило доезжает до парсера (комментарий не съел селектор)', () => {
  const lost = [];

  for (const file of cssFiles) {
    const css = readFileSync(join(CSS_DIR, file), 'utf8');
    // прелюдия может быть списком через запятую — разбираем на части
    const parsed = new Set(preludes(css).flatMap((p) => p.split(',').map((s) => s.trim())));
    const lines = stripComments(css).split('\n');

    for (const sel of declaredSelectors(css)) {
      if (parsed.has(sel)) continue;
      const at = lines.findIndex((l) => l.trim().startsWith(sel + ' ') || l.trim() === sel + '{');
      lost.push(`css/${file}:${at + 1}  ${sel}`);
    }
  }

  assert.deepEqual(
    lost, [],
    'Правило объявлено, но парсер его не увидит — чаще всего `*' + '/` внутри комментария ' +
    '(писать `--fs-* / --fw-*` с пробелами) либо незакрытая скобка выше:\n' + lost.join('\n'),
  );
});

test('в комментариях нет последовательности, закрывающей их досрочно', () => {
  const offenders = [];

  for (const file of cssFiles) {
    const css = readFileSync(join(CSS_DIR, file), 'utf8');
    // всё, что осталось вне комментариев и блоков, обязано быть селектором:
    // текст комментария (кириллица) в прелюдии = комментарий закрылся раньше времени
    for (const p of preludes(css)) {
      if (!/[Ѐ-ӿ]/.test(p)) continue;
      offenders.push(`css/${file}  …${p.slice(-70)}`);
    }
  }

  assert.deepEqual(
    offenders, [],
    'Хвост комментария просочился в селектор — значит `*' + '/` встретилась внутри текста:\n'
    + offenders.join('\n'),
  );
});
