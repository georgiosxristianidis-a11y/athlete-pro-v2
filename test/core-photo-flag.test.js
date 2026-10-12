// @ts-check
/**
 * Guard: CORE-S / флаг 'core-photo-generate'.
 *
 * Кнопка «ГЕНЕРАЦИЯ» и всё, что ведёт фото к модели (камера, file-input,
 * превью), обязаны лежать под флагом, а флаг — быть OFF по умолчанию: Vision
 * шлёт любое фото как image/png (Anthropic его молча роняет), а на клиенте нет
 * уменьшения — фото с телефона получает 413. Живая разметка при ON/OFF —
 * `test/e2e/core-photo-flag.spec.js`; тут — то, что ловится без браузера.
 *
 * Аватар (`athlete-room.js`, ключ athlete-photo) — не фото для ИИ и флага
 * не читает: гард держит эту границу с обеих сторон.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Комментарии режем: гард на регекспе зеленеет от слова в `//`. Только те, что
 * начинают строку: `accept="image/*"` в шаблоне иначе открыл бы «блок-комментарий».
 */
const stripComments = (/** @type {string} */ s) =>
  s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');

const FLAG = 'core-photo-generate';

test('флаг заведён и выключен по умолчанию', async () => {
  const { flag, allFlags } = await import('../js/flags.js');
  assert.equal(flag(FLAG), false, 'без явного включения фото и ГЕНЕРАЦИЯ не должны быть видны');
  assert.ok(FLAG in allFlags(), 'флаг не заведён в DEFAULTS js/flags.js');
});

test('разметка Core: четыре элемента фото/генерации — только за флагом', () => {
  const view = stripComments(read('js/intel.view.js'));
  const start = view.indexOf('screen.innerHTML = `');
  const end = view.indexOf('renderLogs();', start);
  assert.ok(start !== -1 && end > start, 'якорь шаблона load() пропал');
  const template = view.slice(start, end);

  // В самом шаблоне экрана — только подстановки; сырая разметка живёт выше, под тернарником.
  for (const raw of [
    'intel:createWorkout',
    'intel-btn-camera',
    'intel-file-input',
    'intel-vision-preview-wrap',
    'type="file"',
  ]) {
    assert.equal(
      template.includes(raw),
      false,
      `«${raw}» лежит в шаблоне Core в обход флага — при OFF он снова попадёт в разметку`
    );
  }

  const before = view.slice(view.indexOf('async function load()'), start);
  assert.match(before, /flag\('core-photo-generate'\)/, 'load() не читает флаг');
  for (const raw of [
    'data-action="intel:createWorkout"',
    'id="intel-btn-camera"',
    'id="intel-file-input"',
    'id="intel-vision-preview-wrap"',
  ]) {
    const at = before.indexOf(raw);
    assert.notEqual(at, -1, `«${raw}» пропал из load() — код фото должен остаться рядом, за флагом`);
    // Ближайший тернарник по флагу должен стоять до элемента.
    const gate = before.lastIndexOf('photoGen', at);
    assert.notEqual(gate, -1, `«${raw}» не под условием photoGen`);
    assert.match(before.slice(gate, at), /^photoGen\s*\?/, `«${raw}» вне тернарника по photoGen`);
  }
});

test('подсказка в поле ввода при OFF не обещает фото; обе локали заведены', () => {
  const view = read('js/intel.view.js');
  assert.match(view, /placeholder="\$\{photoGen \? L\.input : L\.inputText\}"/, 'placeholder не зависит от флага');
  assert.equal((view.match(/inputText:/g) || []).length, 3, 'inputText обязан быть в ru, en и el (паритет _copy)');
});

test('аватар не читает флаг: athlete-photo — не фото для ИИ', () => {
  const room = read('js/shared/athlete-room.js');
  assert.equal(room.includes(FLAG), false, 'athlete-room.js прочёл флаг фото для ИИ — аватар спрятался бы вместе с ним');
  assert.match(room, /ar-photo-input/, 'вход аватара пропал');
});

test('Vision-путь сервера не тронут: images доходят до модели', () => {
  const orch = read('lib/aiOrchestrator.js');
  assert.match(orch, /images\.forEach/, 'серверный Vision-код снесён — по карточке он остаётся, недостижимый по умолчанию');
});
