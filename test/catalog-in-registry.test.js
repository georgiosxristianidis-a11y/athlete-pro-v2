// UX-2c: каталог ⊂ реестр. Имя каталога, которого нет в реестре, молча выпадает из семейств
// Stats (так «Hack Squat» не попадал в присед). Добавлять строки в реестр — решением Gio (DATA-1),
// поэтому полное вложение не требуем: тренажёрные приседы обязаны резолвиться, остальное — храповик.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { findExercise } = await import('../js/shared/exercise-registry.js');

const jsonNames = JSON.parse(readFileSync(new URL('../exercises-library.json', import.meta.url), 'utf8'))
  .exercises.map((e) => e.name);
const store = readFileSync(new URL('../js/workout.store.js', import.meta.url), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');
const fallbackBlock = store.match(/HARDCODED_LIBRARY = \[([\s\S]*?)\]\.sort/);
const fallbackNames = fallbackBlock ? [...fallbackBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

test('гард видит оба каталога (иначе проверка пуста)', () => {
  assert.ok(jsonNames.length > 100, `exercises-library.json: ${jsonNames.length}`);
  assert.ok(fallbackNames.length > 50, `HARDCODED_LIBRARY: ${fallbackNames.length}`);
});

test('тренажёрный присед каталога резолвится в squat.machine (обе записи каталога)', () => {
  const hack = [...jsonNames, ...fallbackNames].filter((n) => /hack squat/i.test(n));
  assert.ok(hack.includes('Hack Squat'), 'fallback-каталог зовёт тренажёр `Hack Squat`');
  assert.ok(hack.includes('Hack Squat (Machine)'), 'JSON-каталог зовёт `Hack Squat (Machine)`');
  for (const n of hack) assert.equal(findExercise(n)?.id, 'squat.machine', n);
  assert.equal(findExercise('Hack Squat').lift, undefined, 'тренажёр — не DOTS');
});

// Храповик: имена каталога вне реестра. Число не растёт; уменьшилось — опустить потолок.
// Новая строка реестра — решением Gio; спорные имена — в HANDOFF_ux_irritants.md.
const CEILING = { json: 136, fallback: 49 };

test('храповик: непризнанных имён каталога не больше потолка', () => {
  const miss = (names) => [...new Set(names.filter((n) => !findExercise(n)))];
  assert.ok(miss(jsonNames).length <= CEILING.json, `JSON: ${miss(jsonNames).join(' | ')}`);
  assert.ok(miss(fallbackNames).length <= CEILING.fallback, `fallback: ${miss(fallbackNames).join(' | ')}`);
});
