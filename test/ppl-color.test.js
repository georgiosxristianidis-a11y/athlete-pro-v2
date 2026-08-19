// DS-1 TEST-GUARD: PPL-цвет в JS живёт в одном месте.
//
// До DS-1 четыре модуля держали свою копию хексов PPL, и копии разошлись:
// workout рисовал Pull как #00e5ff, analytics — как #00b8d4. Ни одна копия
// не реагировала на светлую тему, где `:root[data-theme='light']`
// переопределяет --c-push/--c-legs.
//
// Гард держит два инварианта:
//   1. PPL_FALLBACK в js/shared/ppl-color.js совпадает с токенами тёмной темы
//      в css/base.css — страховка не имеет права разъехаться с источником.
//   2. Никакой модуль в js/, кроме самого ppl-color.js, не держит хекс
//      PPL-цвета — иначе копия отрастает заново.

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { PPL_FALLBACK, pplColor, pplColorAlpha, isPplType, PPL_TYPES } from '../js/shared/ppl-color.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const JS_DIR = join(ROOT, 'js');

/** Модули, которым хекс PPL положен по роли. */
const ALLOWED = new Set(['js/shared/ppl-color.js']);

/** Все .js под js/, рекурсивно. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** `--c-push: #00e676;` из :root — первое (тёмное) объявление токена. */
function darkToken(css, name) {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

test('PPL_FALLBACK совпадает с токенами тёмной темы в css/base.css', () => {
  const css = readFileSync(join(ROOT, 'css', 'base.css'), 'utf8');

  // --c-pull объявлен через var(--c-blue) — разворачиваем одну ссылку.
  const resolve = (name) => {
    const v = darkToken(css, name);
    const ref = v && v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    return ref ? darkToken(css, ref[1].slice(2)) : v;
  };

  for (const type of PPL_TYPES) {
    const token = resolve(`c-${type}`);
    assert.ok(token, `токен --c-${type} не найден в css/base.css`);
    assert.equal(
      PPL_FALLBACK[type].toLowerCase(),
      token.toLowerCase(),
      `PPL_FALLBACK.${type} разъехался с токеном --c-${type}: ` +
      `${PPL_FALLBACK[type]} против ${token}. Правь js/shared/ppl-color.js.`,
    );
  }
});

test('копий PPL-словаря в js/ нет — источник один', () => {
  // Ловим не любой хекс, а именно копию PPL-словаря: цвет BRAND и цвет Push —
  // один hue (#00e676), и запрет «хекса вообще» тащил бы сюда чужие карточки
  // (палитра аватаров, фолбэк внутри `var()`). Признак копии — хекс рядом
  // со словом push/pull/legs.
  const hexes = Object.values(PPL_FALLBACK).map((h) => h.toLowerCase());
  const NEAR = 3;

  // Хексы ушедшей ветки workout.view/render.js уникальны — они вне палитры
  // вовсе, поэтому запрещены безусловно, без окна.
  const legacy = ['#00e5ff', '#bc13fe'];
  const PPL_WORD = /\b(push|pull|legs)\b/i;

  const offenders = [];
  for (const file of walk(JS_DIR)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (ALLOWED.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').toLowerCase().split(/\r?\n/);

    lines.forEach((line, i) => {
      for (const hex of legacy) {
        if (line.includes(hex)) offenders.push(`${rel}:${i + 1} → ${hex} (цвет вне палитры)`);
      }
      if (!hexes.some((h) => line.includes(h))) return;
      const window = lines.slice(Math.max(0, i - NEAR), i + NEAR + 1).join('\n');
      if (PPL_WORD.test(window)) offenders.push(`${rel}:${i + 1} → копия PPL-словаря`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'Сырой PPL-цвет в JS. Бери его из js/shared/ppl-color.js — ' +
    'иначе он не переживёт светлую тему:\n  ' + offenders.join('\n  '),
  );
});

test('pplColor вне DOM отдаёт тёмный фолбэк, неизвестный тип → push', () => {
  // В node --test нет document — ветка фолбэка.
  assert.equal(pplColor('pull'), PPL_FALLBACK.pull);
  assert.equal(pplColor('legs'), PPL_FALLBACK.legs);
  assert.equal(pplColor('cardio'), PPL_FALLBACK.push);
  assert.equal(pplColor(null), PPL_FALLBACK.push);
});

test('pplColorAlpha клеит два hex-разряда и зажимает диапазон', () => {
  assert.equal(pplColorAlpha('push', 1), PPL_FALLBACK.push + 'ff');
  assert.equal(pplColorAlpha('push', 0), PPL_FALLBACK.push + '00');
  assert.equal(pplColorAlpha('push', 0.125), PPL_FALLBACK.push + '20');
  assert.equal(pplColorAlpha('push', 0.25), PPL_FALLBACK.push + '40');
  assert.equal(pplColorAlpha('push', 5), PPL_FALLBACK.push + 'ff', 'выше 1 — зажать');
  assert.equal(pplColorAlpha('push', -1), PPL_FALLBACK.push + '00', 'ниже 0 — зажать');
});

test('isPplType знает ровно три типа', () => {
  assert.deepEqual(PPL_TYPES, ['push', 'pull', 'legs']);
  for (const t of PPL_TYPES) assert.equal(isPplType(t), true);
  for (const t of ['cardio', '', null, undefined, 'PUSH']) assert.equal(isPplType(t), false);
});
