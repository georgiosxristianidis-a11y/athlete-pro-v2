/**
 * Гард VER-1: ветка, которая правит продуктовый код, обязана нести бамп версии.
 *
 * Факт, ради которого заведён (разбор 2026-08-29): 27–28.08 в main уехали шесть
 * PR подряд — #271 (ИИ-статус), #272 (i18n), #273 (онбординг), #274 (счётчик),
 * #275 (WebKit), #276 (бэкап) — и ни один не тронул `js/version.js`. Прод
 * показывал 1.27.77 на коде шести карточек. Цена не косметическая: `npm run
 * smoke:prod` сверяет ровно этот номер, то есть на шести релизах подряд он
 * переставал отличать доехавший релиз от застрявшего, оставаясь зелёным.
 *
 * Почему существующих проверок не хватило: `version-sync.test.js` сверяет три
 * места между собой, а согласованными они остаются и когда номер не менялся
 * вовсе — вопрос «а менялся ли» он не задаёт по построению. Правило о бампе
 * жило только текстом в CLAUDE.md § Rules, то есть было промптом, а не гейтом.
 *
 * Сравнивается не «есть ли version.js в диффе», а сам номер против origin/main:
 * одинаковый бамп в стопке веток схлопывается при ребейзе БЕЗ конфликта, и
 * проверка по диффу зеленела бы там, где в прод уезжает старый номер.
 *
 * Осознанный обход: VERSION_BUMP_OK=1 npm test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAIN } from '../scripts/drift-core.mjs';
import { branchScope, fileAtRef } from '../scripts/branch-scope.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = 'js/version.js';

/** Код, который видит пользователь. Тесты, скрипты и доки бампа не требуют. */
function isProduct(p) {
  if (p === VERSION_FILE) return false;
  return p.startsWith('js/') || p.startsWith('css/');
}

/** BOM у файла есть — якорим по export, как в version-sync.test.js. */
function parseVersion(text) {
  return text?.match(/export const VERSION\s*=\s*'([^']+)'/)?.[1] ?? null;
}

/** -1 / 0 / 1; null — формат не x.y.z, судить о порядке нечем. */
function compareVersions(a, b) {
  const norm = (v) => v.split('.').map((n) => Number(n));
  const av = norm(a);
  const bv = norm(b);
  if (av.length !== 3 || bv.length !== 3) return null;
  if (av.some(Number.isNaN) || bv.some(Number.isNaN)) return null;
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  }
  return 0;
}

test('версия: разбор номера и порядок версий', () => {
  assert.equal(parseVersion("export const VERSION = '1.27.78';"), '1.27.78');
  assert.equal(parseVersion('﻿export const VERSION = \'1.2.3\';'), '1.2.3', 'BOM не должен мешать');
  assert.equal(parseVersion('const VERSION = 1;'), null);

  assert.equal(compareVersions('1.27.78', '1.27.77'), 1);
  assert.equal(compareVersions('1.27.77', '1.27.77'), 0);
  assert.equal(compareVersions('1.27.77', '1.28.0'), -1, 'минор старше патча');
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.equal(compareVersions('1.27', '1.27.77'), null, 'не x.y.z — порядок неизвестен');
});

test('версия: список продуктовых путей', () => {
  assert.equal(isProduct('js/app.js'), true);
  assert.equal(isProduct('css/base.css'), true);
  assert.equal(isProduct('js/version.js'), false, 'сам файл версии бампа не требует');
  assert.equal(isProduct('test/backup.test.js'), false);
  assert.equal(isProduct('sw.js'), false, 'генерируемое из js/ — не повод для второго бампа');
  assert.equal(isProduct('docs/RULES.md'), false);
});

test('версия: продуктовая правка несёт бамп относительно origin/main', (t) => {
  if (process.env.VERSION_BUMP_OK === '1') {
    t.diagnostic('VER-1 отключён через VERSION_BUMP_OK=1');
    return;
  }

  const scope = branchScope({ cwd: REPO_ROOT });
  if ('skip' in scope) {
    t.diagnostic(`VER-1 пропущен: ${scope.skip}`);
    return;
  }

  const product = scope.paths.filter(isProduct).sort();
  if (product.length === 0) {
    t.diagnostic('VER-1: продуктового кода в ветке нет — бамп не требуется');
    return;
  }

  const mine = parseVersion(readFileSync(path.join(REPO_ROOT, VERSION_FILE), 'utf8'));
  const base = parseVersion(fileAtRef(MAIN, VERSION_FILE, { cwd: REPO_ROOT }) ?? '');

  assert.ok(mine, `не удалось прочитать VERSION из ${VERSION_FILE}`);
  if (!base) {
    t.diagnostic(`VER-1 пропущен: ${VERSION_FILE} не читается на ${MAIN}`);
    return;
  }

  const shown = product.slice(0, 5).join(', ') + (product.length > 5 ? `, … (+${product.length - 5})` : '');
  const how =
    `Лечение: поднять VERSION в ${VERSION_FILE}, следом package.json и package-lock.json ` +
    `(npm install), затем npm run build:sw. Обход, если правка не едет в прод: VERSION_BUMP_OK=1.`;

  assert.notEqual(
    mine,
    base,
    `Ветка правит продуктовый код (${shown}), но версия та же, что в ${MAIN}: ${mine}. ` +
      `Прод и smoke:prod различают релизы по этому номеру. ${how}`,
  );

  const order = compareVersions(mine, base);
  assert.ok(
    order === null || order === 1,
    `Версия ветки ${mine} НИЖЕ, чем в ${MAIN} (${base}) — мёрж откатит номер назад. ` +
      `Обычно это след ребейза поверх чужого релиза. ${how}`,
  );
});
