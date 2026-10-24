// @ts-check
/**
 * A14-хвост — Dynamic Island грузится лениво, а до загрузки window.DynamicIsland
 * держит шим из js/app.js (ISLAND_API). Мина тихая: метод, которого нет в шиме,
 * на `window.DynamicIsland?.say?.()` молча ничего не делает, а на
 * `window.DynamicIsland.show()` бросает TypeError — оба только на восстановленной
 * сессии, до idle-загрузки. Модуль под node --test не грузится (PiP/store),
 * поэтому сверяем исходники: API острова = шим ⊇ всё, что зовут потребители.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Без комментариев: гард не должен зеленеть на закомментированной строке. */
const code = (rel) =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const listJsFiles = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.posix.join(dir, d.name);
    if (d.isDirectory()) return listJsFiles(rel);
    return d.name.endsWith('.js') ? [rel] : [];
  });

const app = code('js/app.js');
const island = code('js/shared/dynamic-island.js');

function shimApi() {
  const block = app.match(/const ISLAND_API = \[([\s\S]*?)\];/);
  assert.ok(block, 'не нашёл ISLAND_API в js/app.js — гард потерял якорь');
  return new Set([...block[1].matchAll(/'([\w$]+)'/g)].map((m) => m[1]));
}

function islandApi() {
  // Публичный объект — последний `return { ... };` IIFE перед `})();`.
  const block = island.match(/return \{([^{}]*)\};\s*\}\)\(\);/);
  assert.ok(block, 'не нашёл return { ... } острова — гард потерял якорь');
  return new Set(block[1].split(',').map((s) => s.trim()).filter(Boolean));
}

describe('A14-хвост: шим window.DynamicIsland', () => {
  test('шим покрывает ровно публичный API острова', () => {
    assert.deepEqual([...shimApi()].sort(), [...islandApi()].sort());
  });

  test('каждый метод, который зовут через window.DynamicIsland, есть в шиме', () => {
    const shim = shimApi();
    const missing = [];
    for (const rel of listJsFiles('js')) {
      for (const m of code(rel).matchAll(/window\.DynamicIsland\??\.([\w$]+)/g)) {
        if (!shim.has(m[1])) missing.push(`${rel}: ${m[1]}`);
      }
    }
    assert.deepEqual(missing, [], 'вызов мимо шима умрёт молча до загрузки острова');
  });

  test('шим стоит на window, остров грузится только import(), и сам себя ставит на window', () => {
    assert.match(app, /window\.DynamicIsland\s*=\s*Object\.fromEntries\(\s*ISLAND_API\.map/);
    assert.match(app, /import\('\.\/shared\/dynamic-island\.js'\)/);
    assert.doesNotMatch(app, /^\s*import\s[^(]*['"]\.\/shared\/dynamic-island\.js['"]/m);
    // Без этого присваивания вызовы после загрузки шли бы через очередь вечно —
    // работало бы, но каждый тик таймера стоил бы промис.
    assert.match(island, /^window\.DynamicIsland = DynamicIsland;/m);
  });

  test('CSS острова грузится до модуля: init() из show() не моргает голым', () => {
    const loader = app.match(/function _loadIsland\(\)[\s\S]*?\n\}/)?.[0];
    assert.ok(loader, 'не нашёл _loadIsland() в js/app.js');
    const css = loader.indexOf("ensureCss('css/dynamic-island.css')");
    const mod = loader.indexOf("import('./shared/dynamic-island.js')");
    assert.ok(css !== -1 && mod !== -1 && css < mod, 'CSS острова должен грузиться раньше модуля');
  });
});
