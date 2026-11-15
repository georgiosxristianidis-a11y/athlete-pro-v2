// @ts-check
/**
 * Guard: CORE-03 / флаг 'core-composer-dock'.
 *
 * ON — модули закреплены доком над композером (вне скролла ленты), пилюли
 * статуса в потоке нет, журнал открывается листом из иконки в шапке.
 * OFF — разметка прежняя: сетка модулей в ленте, пилюля лога над композером.
 * Флаг OFF по умолчанию и в Лаборатории. Живой прогон (попадание пальцем,
 * 5+ реплик) — ручной в превью; здесь то, что ловится без браузера.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (/** @type {string} */ s) =>
  s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');

const FLAG = 'core-composer-dock';
const flags = stripComments(read('js/flags.js'));
const view = stripComments(read('js/intel.view.js'));
const css = read('css/intel.css');

test('core-composer-dock: флаг объявлен OFF и выведен в Лабораторию', () => {
  assert.match(flags, new RegExp(`'${FLAG}':\\s*false`));
  const lab = flags.match(/LAB_FLAGS = Object\.freeze\(\[([^\]]*)\]/);
  assert.ok(lab && lab[1].includes(`'${FLAG}'`), 'флаг должен быть в LAB_FLAGS');
});

test('core-composer-dock: ON — док над композером, OFF — легаси-пилюля и сетка в ленте', () => {
  assert.match(view, new RegExp(`const dock = flag\\('${FLAG}'\\)`));
  // OFF-ветка не снесена: пилюля лога и сетка в ленте живы.
  assert.match(view, /\$\{dock \? '' : modulesGrid\}/);
  assert.match(view, /: logsPill\}/);
  assert.match(view, /class="intel-logs" data-action="intel:toggleLogs"/);
  // ON: док стоит ПЕРЕД композером и вне .intel-body.
  const dockAt = view.indexOf('<nav class="intel-dock"');
  const cmdAt = view.indexOf('<div class="intel-cmd-wrap">');
  const bodyEnd = view.indexOf('${dock ? \'\' : modulesGrid}');
  assert.ok(dockAt > bodyEnd && dockAt < cmdAt, 'док — между лентой и композером');
});

test('core-composer-dock: журнал — иконка шапки и лист с теми же узлами лога', () => {
  assert.match(view, /data-action="intel:openJournal"/);
  assert.match(view, /on\('intel:openJournal'/);
  assert.match(view, /on\('intel:closeJournal'/);
  const open = view.slice(view.indexOf('function openJournal'), view.indexOf('function closeJournal'));
  assert.match(open, /id="intel-logs-status-pill"/);
  assert.match(open, /id="intel-logs-container"/);
  assert.match(open, /modal-overlay sd-overlay/);
});

test('core-composer-dock: док плоский — без нового стекла на экране', () => {
  const block = css.slice(css.indexOf('.intel-dock {'), css.indexOf('/* ── Tier 2 · пилюля лога'));
  assert.ok(block.length > 0);
  assert.doesNotMatch(block, /backdrop-filter/);
});
