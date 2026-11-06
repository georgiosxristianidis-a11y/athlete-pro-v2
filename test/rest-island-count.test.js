/**
 * REST-COUNT (флаг rest-island-count, вариант A, выбор Gio 02.11): в компактной
 * паузе остров показывает крупный отсчёт, «Подход N/M», «упражнение · вес ×
 * повт» и крупный пропуск. Проводка проверяется по исходнику:
 * dynamic-island.js не грузится под node --test (как rest-next-set).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFlags, LAB_FLAGS } from '../js/flags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'js', 'shared', 'dynamic-island.js'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'css', 'dynamic-island.css'), 'utf8');
const LOC = readFileSync(path.join(ROOT, 'js', 'locale.store.js'), 'utf8');
const EL = readFileSync(path.join(ROOT, 'js', 'locale.el.js'), 'utf8');

test('флаг rest-island-count: OFF по умолчанию, тумблер в Лаборатории', () => {
  assert.equal(allFlags()['rest-island-count'], false);
  assert.ok(LAB_FLAGS.includes('rest-island-count'));
});

test('цифра — textContent живого узла в setRestProgress, без innerHTML хоста', () => {
  const body = SRC.slice(SRC.indexOf('function setRestProgress('), SRC.indexOf('function _paintRestSet('));
  assert.match(body, /_restCountEl\.textContent = `\$\{Math\.floor\(s \/ 60\)\}:\$\{String\(s % 60\)\.padStart\(2, '0'\)\}`/);
  assert.doesNotMatch(body, /innerHTML/);
  const arm = SRC.slice(SRC.indexOf('function _armRestCount('), SRC.indexOf('function _armRestProgress('));
  assert.doesNotMatch(arm, /innerHTML/);
  // Узлы создаются один раз, не на каждый отдых.
  assert.match(arm, /if \(!_restCountEl\) \{[\s\S]*?createElement\('span'\)/);
  // aria-live острова не зачитывает цифру раз в секунду.
  assert.match(arm, /_restCountEl\.setAttribute\('aria-hidden', 'true'\)/);
});

test('флаг OFF: в шаблоне острова новых узлов нет, класс по флагу', () => {
  assert.doesNotMatch(SRC, /class="island-rest-count"|class="island-rest-meta"/);
  assert.match(SRC, /const on = flag\('rest-island-count'\);\s*_island\?\.classList\.toggle\('rest-count', on\);/);
});

test('класс rest-count снимается везде, где снимается rest-has-next', () => {
  const all = SRC.match(/'rest-has-next', 'rest-has-set'\)/g) || [];
  const both = SRC.match(/'rest-count', 'rest-has-next', 'rest-has-set'\)/g) || [];
  assert.equal(both.length, all.length);
  assert.ok(both.length >= 4);
});

test('строка «60 × 8» одна: при rest-count FIELD-7 не рисует свою копию', () => {
  assert.match(SRC, /function _paintRestSet\(line\) \{[\s\S]*?if \(_island\?\.classList\.contains\('rest-count'\)\) line = '';/);
  assert.match(SRC, /_restNumsEl\.textContent = `· \$\{line\}`/);
  assert.match(CSS, /\.island\.rest-count \.island-rest-next,\s*\.island\.rest-count \.island-rest-set \{ display: none; \}/);
});

test('360px: многоточие режет имя, «· вес × повт» не сжимается', () => {
  assert.match(SRC, /_restLineEl\.append\(_restNameEl, _restNumsEl\)/);
  assert.match(CSS, /\.island-rest-name \{[^}]*text-overflow: ellipsis;/);
  assert.match(CSS, /\.island-rest-nums \{ flex: none; \}/);
  const line = CSS.match(/\.island-rest-line \{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(line, /text-overflow/);
});

test('флаг выключили без перезагрузки: оставшиеся узлы легаси-пилюля не показывает', () => {
  assert.match(CSS, /\.island-rest-count,\s*\.island-rest-meta \{ display: none; \}/);
  assert.match(CSS, /\.island\.rest-count \.island-rest-count \{ display: block; \}/);
  assert.match(CSS, /\.island\.rest-count \.island-rest-meta \{ display: flex; \}/);
});

test('CSS: пилюля 328 на 360px, цифра --fs-6, пропуск 48×40', () => {
  assert.match(CSS, /\.island\.timer-mode\.rest-count:not\(\.expanded\) \{[^}]*width: calc\(100vw - 32px\);[^}]*max-width: 400px;[^}]*height: 56px;[^}]*border-radius: var\(--r-xxl\)/);
  assert.match(CSS, /\.island-rest-count \{[^}]*font-size: var\(--fs-6\);[^}]*font-weight: var\(--fw-black\);[^}]*tabular-nums/);
  assert.match(CSS, /\.island\.rest-count \.island-rest-btn \{ height: 40px; \}/);
  assert.match(CSS, /\.island\.rest-count \.island-rest-btn\.primary \{[^}]*width: 48px;[^}]*border-radius: var\(--r-m\)/);
  // Легаси-пилюля не тронута.
  assert.match(CSS, /\.island\.timer-mode\.rest-has-next:not\(\.expanded\) \{\s*width: 236px;/);
});

test('ключ «Подход {n}/{total}» на трёх языках', () => {
  assert.equal(LOC.split("'island.set_n':").length - 1, 2);
  assert.match(LOC, /'island\.set_n': 'Подход \{n\}\/\{total\}'/);
  assert.match(EL, /'island\.set_n': '[^']*\{n\}\/\{total\}'/);
});
