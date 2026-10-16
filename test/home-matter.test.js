/**
 * HOME-3 (флаг home-matter): материя в карточке «Сегодня».
 * canvas и WAAPI под node --test не живут — чистые части (seed, шум) проверяются
 * напрямую, проводка и закон кадра — по исходнику (как rest-next-set).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry, noise } from '../js/shared/home-matter.js';
import { allFlags, LAB_FLAGS } from '../js/flags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(path.join(ROOT, ...p), 'utf8');
const MOD = read('js', 'shared', 'home-matter.js');
const DASH = read('js', 'dashboard.js');
const CSS = read('css', 'dashboard.css');

test('флаг home-matter: дефолт OFF, есть тумблер в Лаборатории', () => {
  assert.equal(allFlags()['home-matter'], false);
  assert.ok(LAB_FLAGS.includes('home-matter'));
});

test('словарь: lab.home-matter во всех трёх языках', () => {
  for (const f of ['locale.store.js', 'locale.el.js']) {
    const src = read('js', f);
    assert.match(src, /'lab\.home-matter':/, f);
    assert.match(src, /'lab\.home-matter_sub':/, f);
  }
});

test('seed: один и тот же день рисует одно и то же поле', () => {
  const a = mulberry(11);
  const b = mulberry(11);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  assert.notEqual(mulberry(11)(), mulberry(23)());
});

test('шум детерминирован и лежит в [0,1]', () => {
  for (let i = 0; i < 200; i++) {
    const v = noise(i * 0.37, i * 0.91);
    assert.equal(v, noise(i * 0.37, i * 0.91));
    assert.ok(v >= 0 && v <= 1, String(v));
  }
});

test('закон кадра: движение только transform/opacity, «12 с» и settle, без вечного цикла в CSS', () => {
  assert.match(MOD, /SETTLE_AT = 12000/);
  assert.match(MOD, /SETTLE_MS = 1000/);
  assert.doesNotMatch(MOD, /requestAnimationFrame|setInterval/, 'ни rAF, ни таймера кадров — слои рисуются раз');
  assert.doesNotMatch(MOD, /offsetWidth/, 'без forced layout при ретриггере');
  assert.doesNotMatch(MOD, /(?:left|top|width|height)\s*:/, 'анимируются не layout-свойства');
  assert.doesNotMatch(CSS.slice(CSS.indexOf('HOME-3')), /@keyframes/);
});

test('reduced-motion, скрытая вкладка и уход с экрана обработаны', () => {
  assert.match(MOD, /prefers-reduced-motion: reduce/);
  assert.match(MOD, /visibilitychange/);
  assert.match(MOD, /IntersectionObserver/);
  // экраны прячутся через opacity: IO уход не видит, цикл сбрасывает навигация
  assert.match(MOD, /'ap-nav-change'/);
  assert.match(MOD, /!s\.visible \|\| !s\.onScreen/);
});

test('цвет — только токены, без сырых hex', () => {
  assert.match(MOD, /--c-chrome/);
  assert.doesNotMatch(MOD.replace(/'#cfd1d8'/, ''), /#[0-9a-f]{3,8}\b/i);
});

test('проводка: модуль грузится динамически и только по флагу', () => {
  assert.match(DASH, /import\('\.\/shared\/home-matter\.js'\)/);
  assert.doesNotMatch(DASH, /^import .*home-matter/m, 'статического импорта нет — бут-граф не растёт');
  assert.match(DASH, /flag\('home-matter'\)/);
  assert.match(DASH, /_syncMatter\(nextType\)/);
});
