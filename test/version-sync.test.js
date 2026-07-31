/**
 * Guard: три места, где живёт номер версии, обязаны совпадать.
 *
 * Правило о бампе (CLAUDE.md § Rules) называло только js/version.js и
 * package.json — package-lock.json в нём не упоминался, и он тихо отставал
 * (1.25.37 при 1.25.39, потом 1.25.41 при 1.25.42). Цена не косметическая:
 * любой `npm install` в чистом чекауте переписывает lock под package.json,
 * и этот diff всплывает как «незакоммиченное изменение» у каждого агента —
 * шум, который легко утащить в чужой коммит.
 *
 * Проверка живёт в тестах (то есть в CI), а не только в preflight: preflight
 * лежит в чекауте и дрейфует вместе с ним, CI — нет.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('version: package.json == package-lock.json (оба поля)', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));

  assert.equal(
    lock.version,
    pkg.version,
    `package-lock.json "version" отстал: ${lock.version} против ${pkg.version} в package.json. Лечение: npm install`
  );
  assert.equal(
    lock.packages?.['']?.version,
    pkg.version,
    `package-lock.json packages[""].version отстал: ${lock.packages?.['']?.version} против ${pkg.version}. Лечение: npm install`
  );
});

test('version: js/version.js == package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  // BOM у файла есть, регэксп его переживает — якорим по export, не по началу.
  const shown = read('js/version.js').match(/export const VERSION\s*=\s*'([^']+)'/)?.[1];

  assert.equal(
    shown,
    pkg.version,
    `js/version.js показывает ${shown}, а package.json несёт ${pkg.version} — в профайл-меню будет чужой номер`
  );
});
