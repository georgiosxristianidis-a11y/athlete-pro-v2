/**
 * PLATE-2 — замок на игрушку-штангу: тап по грифу = пружина (только transform) + вибро
 * через Haptic Gate, всё за флагом plate-toy (OFF). Логику расчёта тест не трогает.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const js = stripJs(read('js/plate-calc.js'));
const flags = stripJs(read('js/flags.js'));
const block = js.slice(js.indexOf("if (flag('plate-toy'))"), js.indexOf("q('down')"));

test('plate-toy: флаг объявлен и выключен по умолчанию', () => {
  assert.match(flags, /'plate-toy':\s*false/);
});

test('plate-toy: тап по грифу за флагом, вибро через haptic(), пружина через Spring', () => {
  assert.ok(block.length > 0, "блок if (flag('plate-toy')) пропал из plate-calc.js");
  assert.match(block, /q\('barbell'\)\.addEventListener\('click'/);
  assert.match(block, /haptic\(/);
  assert.match(block, /poke\(/);
  assert.match(js, /import\s*\{\s*Spring\s*\}\s*from\s*'\.\/shared\/spring\.js'/);
  assert.doesNotMatch(js, /navigator\.vibrate/);
});

test('plate-toy: пружина крутит только transform детей грифа, не сам хост, с учётом reduced-motion', () => {
  const poke = js.slice(js.indexOf('function poke('), js.indexOf('const sideList'));
  assert.match(poke, /Spring\.animate\(/);
  assert.match(poke, /style\.transform/);
  assert.doesNotMatch(poke.replace(/style\.transform/g, ''), /style\.(?!transform)\w+|host\.style/, 'пружина трогает не только transform');
  assert.match(poke, /prefers-reduced-motion/);
  assert.match(poke, /host\.children/);
});
