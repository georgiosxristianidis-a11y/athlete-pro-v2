/**
 * LAUNCH-3a — связки юридических страниц, не буквы текстов.
 *
 * Четыре вопроса, на которые отвечает этот файл:
 *   1. На диске ровно шесть документов: privacy · terms · consent × ru · en.
 *   2. Бандл Vercel несёт legal/** — иначе маршрут /(.*) отдаст шелл вместо файла.
 *   3. legal/ нет в манифесте прекеша: каталог вне dirsToScan в build-sw.mjs.
 *   4. В документах ноль сырого hex — цвет только через токены css/base.css.
 *
 * Текст политики здесь не читается: расхождение с кодом ловит человек при сверке,
 * а не assert на абзац, который завтра перепишут.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAssets } from '../scripts/build-sw.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGAL_DIR = path.join(REPO_ROOT, 'legal');

const DOCS = ['privacy', 'terms', 'consent'];
const LANGS = ['ru', 'en'];
const EXPECTED = DOCS.flatMap((doc) => LANGS.map((lang) => `${doc}.${lang}.html`));

function legalFiles() {
  return fs
    .readdirSync(LEGAL_DIR)
    .filter((name) => name.endsWith('.html'))
    .sort();
}

test('legal: шесть документов на месте, лишних html нет', () => {
  assert.deepEqual(legalFiles(), [...EXPECTED].sort());
});

test('legal: каждый файл несёт свой lang и тянет /css/base.css', () => {
  for (const name of EXPECTED) {
    const lang = name.split('.')[1];
    const src = fs.readFileSync(path.join(LEGAL_DIR, name), 'utf8');
    assert.match(
      src,
      new RegExp(`<html\\s+lang="${lang}"`),
      `${name}: язык обязан быть в разметке, не в IndexedDB и не в navigator.language`
    );
    assert.match(src, /href="\/css\/base\.css"/, `${name}: стили — токены из css/base.css`);
    assert.doesNotMatch(
      src,
      /navigator\.language/,
      `${name}: язык страницы — файл, не navigator.language`
    );
  }
});

test('legal: vercel.json includeFiles содержит legal/**', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'));
  const include = cfg.builds?.[0]?.config?.includeFiles ?? [];
  assert.ok(
    include.includes('legal/**'),
    'без legal/** прод-бандл не несёт документы: express.static локально зелёный, Vercel — нет'
  );
});

test('legal: каталог не попадает в прекеш', () => {
  const assets = collectAssets(REPO_ROOT);
  const leaked = assets.filter((f) => f.startsWith('/legal/'));
  assert.deepEqual(
    leaked,
    [],
    'legal/ вне js/css/icons/assets/fonts — иначе съест бюджет установки'
  );

  const sw = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
  assert.equal(
    sw.includes('/legal/'),
    false,
    'sw.js не должен перечислять /legal/ — прекеш не трогали'
  );
});

test('legal: сырых hex в документах нет', () => {
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  const offenders = [];
  for (const name of legalFiles()) {
    const src = fs.readFileSync(path.join(LEGAL_DIR, name), 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(hex);
      if (m) offenders.push(`${name}:${i + 1} → ${m[0]}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'цвет на юридических страницах — var(--c-*), не литерал:\n  ' + offenders.join('\n  ')
  );
});
