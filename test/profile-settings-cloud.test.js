/**
 * CLOUD-1 — не обещать облако, которого нет.
 *
 * Конфиг Supabase читается из `import.meta.env`, бандлера нет — в браузере
 * всегда пустая заглушка (CLOUD-0). Карточка «Облако» в Настройках при этом
 * рисовалась всегда, и «Подключить» всегда падала. Теперь карточка есть только
 * при настроенном облаке; дефолт — нет.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// settings.js тянет events.js / shell.js: они вешают слушатели на document и
// читают history при импорте — глобалы до загрузки модуля.
const noop = () => {};
const node = () => ({
  style: {}, dataset: {}, setAttribute: noop, getAttribute: () => null, appendChild: noop,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  querySelector: () => null, querySelectorAll: () => [],
});
globalThis.document = /** @type {any} */ ({
  addEventListener: noop, removeEventListener: noop, createElement: node,
  head: node(), body: node(), documentElement: node(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
});
globalThis.window = /** @type {any} */ (globalThis);
globalThis.window.addEventListener = noop;
globalThis.window.removeEventListener = noop;
globalThis.window.dispatchEvent = () => true;
globalThis.window.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.history = /** @type {any} */ ({ state: null, pushState: noop, replaceState: noop });
globalThis.location = /** @type {any} */ ({ hash: '', pathname: '/', search: '' });
const _ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => _ls.get(k) ?? null, setItem: (k, v) => _ls.set(k, String(v)), removeItem: (k) => _ls.delete(k),
});

const { renderSettings } = await import('../js/profile.view/settings.js');

describe('CLOUD-1: карточка «Облако» только при настроенном облаке', () => {
  test('облака нет — ни кнопки синка, ни заголовка «Облако»', () => {
    const html = renderSettings({}, 'ru', 'offline', false);
    assert.equal(html.includes('settings:syncToggle'), false, 'кнопка «Подключить» без облака всегда падает');
    assert.equal(html.includes('sync-connect-icon'), false);
  });

  test('дефолт без четвёртого аргумента — тоже без облака', () => {
    assert.equal(renderSettings({}, 'ru', 'offline').includes('settings:syncToggle'), false);
  });

  test('облако настроено — карточка на месте и ведёт себя как раньше', () => {
    const off = renderSettings({}, 'ru', 'offline', true);
    assert.match(off, /data-action="settings:syncToggle" data-sync="offline"/);
    const on = renderSettings({}, 'ru', 'idle', true);
    assert.match(on, /data-sync="idle"/);
  });

  test('бэкап и экспорт рисуются в обоих случаях', () => {
    for (const cloud of [false, true]) {
      const html = renderSettings({}, 'ru', 'offline', cloud);
      assert.match(html, /data-action="settings:exportData"/, `экспорт пропал при cloud=${cloud}`);
      assert.match(html, /data-action="settings:importData"/);
    }
  });

  test('profile.js передаёт флаг облака в оба рендера настроек', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'js/profile.js'), 'utf8');
    const calls = [...src.matchAll(/renderSettings\(([^)]*)\)/g)].map((m) => m[1].split(',').length);
    assert.ok(calls.length >= 2, 'не найдены вызовы renderSettings в profile.js');
    assert.deepEqual(calls.filter((n) => n < 4), [], 'есть рендер без флага облака — карточка там пропадёт и при живом облаке');
    assert.match(src, /import\('\.\/supabase\.js'\)/, 'флаг берётся не из модуля supabase.js');
  });
});
