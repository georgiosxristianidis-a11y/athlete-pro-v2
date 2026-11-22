// UX-2j — Лаборатория открывается жестом: 5 тапов по строке версии.
// Переустановка SW — кнопка внутри Лаборатории, а не тапы по версии.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createTapGesture } = await import('../js/shared/tap-gesture.js');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Вырезать `//` и блочные комментарии — гард не должен зеленеть на комментарии. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Тело функции по имени (до следующей функции того же отступа). */
function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `нет функции ${name}`);
  const rest = src.slice(i + 1);
  const m = rest.search(/\n {2}(?:async )?function |\n {2}\/\*/);
  return m < 0 ? rest : rest.slice(0, m);
}

test('жест: 5 тапов в окне открывают, меньше — нет', () => {
  const hit = createTapGesture(5, 3000);
  assert.deepEqual([0, 100, 200, 300].map((t) => hit(t)), [false, false, false, false]);
  assert.equal(hit(400), true, 'пятый тап');
});

test('жест: после срабатывания счёт начинается заново', () => {
  const hit = createTapGesture(5, 3000);
  for (let i = 0; i < 5; i++) hit(i * 100);
  assert.equal(hit(600), false, 'шестой тап — уже первый новой серии');
  assert.equal(hit(700), false);
});

test('жест: пауза длиннее окна обнуляет серию', () => {
  const hit = createTapGesture(5, 3000);
  for (let i = 0; i < 4; i++) hit(i * 100);
  assert.equal(hit(300 + 3001), false, 'пятый тап после паузы — это первый новой серии');
  for (let i = 1; i < 4; i++) assert.equal(hit(3301 + i * 100), false);
  assert.equal(hit(3301 + 400), true, 'пять тапов уже в новой серии');
});

test('жест: окно скользящее — медленные, но не длиннее окна тапы считаются', () => {
  const hit = createTapGesture(5, 3000);
  const out = [0, 2500, 5000, 7500, 10000].map((t) => hit(t));
  assert.equal(out[4], true);
});

test('Лаборатория скрыта по умолчанию и без жеста недостижима', () => {
  const src = code(read('js/profile.js'));
  assert.match(src, /id="profile-lab-block"[^>]*\bhidden\b/, 'блок рисуется с hidden');
  // Единственное место, снимающее hidden с блока, — _openLab.
  const unhides = src.match(/profile-lab-block'\)[\s\S]{0,200}?\.hidden = false/g) || [];
  assert.equal(unhides.length, 1, 'hidden снимается ровно в одном месте');
  assert.match(fnBody(src, '_openLab'), /block\.hidden = false/);
  assert.match(fnBody(src, '_wireVersionTap'), /if \(hit\(\)\) _openLab\(\)/);
  assert.match(src, /LAB_TAPS = 5;/);
});

test('тапы по версии больше не переустанавливают SW', () => {
  const src = code(read('js/profile.js'));
  assert.doesNotMatch(fnBody(src, '_wireVersionTap'), /forceUpdate/);
  assert.doesNotMatch(fnBody(src, '_openLab'), /forceUpdate/);
  assert.match(fnBody(src, 'reinstallSw'), /forceUpdate\(\)/);
  assert.match(src, /^\s{4}reinstallSw,$/m, 'reinstallSw в публичном API Profile');
});

test('кнопка переустановки SW — внутри Лаборатории и подключена к действию', () => {
  const view = code(read('js/profile.view/settings.js'));
  const lab = view.slice(view.indexOf('export function renderLab'));
  assert.match(lab, /data-action="settings:reinstallSw"/);
  assert.match(view, /on\('settings:reinstallSw', \(\) => P\(\)\.reinstallSw\(\)\)/);
  const settings = view.slice(view.indexOf('export function renderSettings'), view.indexOf('export function renderLab'));
  assert.doesNotMatch(settings, /reinstallSw/, 'в обычных настройках кнопки нет');
});

test('«Снаряды» переехали в Лабораторию свёрнутым блоком, из настроек ушли', () => {
  const view = code(read('js/profile.view/settings.js'));
  const settings = view.slice(view.indexOf('export function renderSettings'), view.indexOf('function _renderEquipment'));
  assert.doesNotMatch(settings, /_renderEquipment|equip-checklist/, 'в настройках снарядов нет');
  const lab = view.slice(view.indexOf('export function renderLab'));
  assert.match(lab, /_renderEquipment\(equipmentOff\)/);
  const equip = view.slice(view.indexOf('function _renderEquipment'), view.indexOf('export function renderLab'));
  assert.match(equip, /<details class="lab-sub" id="lab-equipment"/);
  assert.doesNotMatch(equip, /<details[^>]*\bopen\b/, 'свёрнут по умолчанию');
  assert.match(equip, /flag\('gym-equipment'\) \? '' : ' hidden'/, 'виден только при флаге gym-equipment');
});
