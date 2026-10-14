/**
 * FIELD-7 (флаг rest-next-set): вторая строка паузы — вес × повторы
 * ближайшего незакрытого сета упражнения из «далее: X».
 * Формат — чистая nextSetLine; проводка в острове проверяется по исходнику:
 * dynamic-island.js не грузится под node --test (как island-rest-expand).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextSetLine } from '../js/shared/rest-next-set.js';
import { allFlags, LAB_FLAGS } from '../js/flags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'js', 'shared', 'dynamic-island.js'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'css', 'dynamic-island.css'), 'utf8');

const RU = { 'island.next_set': '{w} кг × {r}', 'island.next_set_bw': '× {r}' };
const t = (k, p = {}) => RU[k].replace(/\{(\w+)\}/g, (_, n) => String(p[n]));

test('вес и повторы первого незакрытого сета', () => {
  const ex = { sets: [{ weight: 22, reps: 12, done: true }, { weight: 24, reps: 10, done: false }] };
  assert.equal(nextSetLine(ex, t), '24 кг × 10');
});

test('дробный вес без округления', () => {
  assert.equal(nextSetLine({ sets: [{ weight: 102.5, reps: 12 }] }, t), '102.5 кг × 12');
});

test('свой вес без отягощения — только повторы', () => {
  assert.equal(nextSetLine({ isBW: true, sets: [{ weight: 0, reps: 12 }] }, t), '× 12');
});

test('свой вес с отягощением — +N кг', () => {
  assert.equal(nextSetLine({ isBW: true, sets: [{ weight: 12.5, reps: 8 }] }, t), '+12.5 кг × 8');
});

test('core/планка — секунды голым числом, как в карточке', () => {
  const plank = { isBW: true, noDb: true, block: 'align', sets: [{ weight: 0, reps: 60 }] };
  assert.equal(nextSetLine(plank, t), '× 60');
});

test('нет упражнения или все сеты закрыты — строки нет', () => {
  assert.equal(nextSetLine(null, t), '');
  assert.equal(nextSetLine({ sets: [{ weight: 20, reps: 10, done: true }] }, t), '');
});

test('флаг rest-next-set: OFF по умолчанию, тумблер в Лаборатории', () => {
  assert.equal(allFlags()['rest-next-set'], false);
  assert.ok(LAB_FLAGS.includes('rest-next-set'));
});

test('остров: строка только при флаге и «далее», отдельным элементом', () => {
  // Модуль грузится лениво и только при флаге и «далее»: статический импорт
  // сажает его на бут-граф (boot-graph.test.js).
  assert.match(SRC, /_paintRestSet\(''\);\s*if \(nx && flag\('rest-next-set'\)\) \{\s*import\('\.\/rest-next-set\.js'\)/);
  assert.doesNotMatch(SRC, /^import[^;]*rest-next-set/m);
  // Пауза кончилась до загрузки модуля — строку не рисовать.
  assert.match(SRC, /if \(_timerActive\) _paintRestSet\(nextSetLine\(nx, t\)\)/);
  // Флаг OFF / нет «далее» → line пуст → элемент удаляется, не создаётся.
  assert.match(SRC, /if \(line && !setEl && _restNextEl\)[\s\S]*?createElement\('span'\)/);
  assert.match(SRC, /if \(line\) setEl\.textContent = line;\s*else setEl\.remove\(\);/);
  // В шаблоне острова элемента нет — флаг OFF разметку не меняет.
  assert.doesNotMatch(SRC, /id="di-rest-set"/);
  // Подпись не несёт вес: раскрытый остров копирует её в #di-sublabel.
  assert.match(SRC, /_restNextEl\.textContent = nx \? t\('island\.next', \{ name: islandLabel\(nx\) \}\) : ''/);
});

test('класс rest-has-set снимается везде, где снимается rest-has-next', () => {
  const next = SRC.match(/'rest-has-next'\)/g) || [];
  const both = SRC.match(/'rest-has-next', 'rest-has-set'\)/g) || [];
  assert.equal(next.length, 0, 'каждое снятие rest-has-next обязано снимать и rest-has-set');
  assert.ok(both.length >= 4);
});

test('CSS: грид только в компактной паузе со строкой', () => {
  assert.match(CSS, /\.island\.timer-mode\.rest-has-set:not\(\.expanded\) \.island-rest \{[^}]*display: grid/);
  assert.match(CSS, /\.island-rest-set \{[^}]*font-size: var\(--fs-2\)/);
});
