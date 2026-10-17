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

// ── HOME-3-AMP: амплитуда, вариант A (Gio 17.10) ─────────────────────────────
const num = (v) => Math.round(v * 1e6) / 1e6;
const PAD = Number(MOD.match(/const PAD = ([\d.]+);/)[1]);
const SHIFTS = [...MOD.matchAll(/transform: tr\(([\d.]+)\) \}\], \{ duration: (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

test('амплитуда A: сдвиг 8/16 px, периоды 14/9 с, ближний с задержкой 2 с, ленты 1 → 0.7 за 11 с', () => {
  // [сдвиг конца, период]: дальний слой, затем ближний; нулевые tr(0) в начале кадра не считаются
  assert.deepEqual(SHIFTS.filter(([d]) => d > 0), [[8, 14000], [16, 9000]]);
  assert.match(MOD, /\{ duration: 9000, delay: 2000 \}/);
  assert.match(MOD, /\[\{ opacity: 1 \}, \{ opacity: 0\.7 \}\], \{ duration: 11000 \}/);
});

test('PAD в модуле = inset/width/height canvas в CSS (одно число в двух местах)', () => {
  const rule = CSS.match(/\.dash-today \.matter canvas \{([^}]*)\}/)[1];
  const pct = (re) => Number(rule.match(re)[1]);
  assert.equal(PAD, 0.1);
  assert.equal(pct(/inset:\s*(-?[\d.]+)%/), -num(PAD * 100));
  assert.equal(pct(/\bwidth:\s*(-?[\d.]+)%/), num(100 + 200 * PAD));
  assert.equal(pct(/\bheight:\s*(-?[\d.]+)%/), num(100 + 200 * PAD));
});

test('край не открывается: сдвиг ближнего слоя по лучу влезает в запас PAD*H уже от 106 px', () => {
  const ray = MOD.match(/const RAY = \[-1\.15 \/ Math\.hypot\(1, 1\.15\), 1 \/ Math\.hypot\(1, 1\.15\)\]/);
  assert.ok(ray, 'луч вниз-влево, как в модуле');
  const k = Math.hypot(1, 1.15);
  const max = Math.max(...SHIFTS.map(([d]) => d)); // 16 px
  const dx = (1.15 / k) * max;
  const dy = (1 / k) * max;
  // верхний край слоя уезжает вниз на dy, правый — влево на dx; запас PAD*H и PAD*W
  const minH = Math.ceil(dy / PAD);
  assert.ok(dx < 12.2 && dy < 10.7, `dx ${dx.toFixed(2)} dy ${dy.toFixed(2)}`);
  assert.ok(minH <= 106, `минимальная высота карточки ${minH} px`);
  assert.ok(minH <= 124, 'самая низкая измеренная карточка (пустой список, 124 px) в запасе');
});
