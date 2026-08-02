import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Минимальные стабы под node --test (как в test/island-profile.test.js).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { resolveTheme, getThemePref, THEME_KEY } = await import('../js/shared/theme.js');

describe('theme — resolveTheme', () => {
  test('дефолт тёмный: пусто, мусор и явный dark', () => {
    for (const pref of [null, undefined, '', 'DARK', 'sepia', 'dark']) {
      assert.equal(resolveTheme(pref, false), 'dark');
      assert.equal(resolveTheme(pref, true), 'dark', 'системная тема не должна перебивать явный выбор');
    }
  });

  test('light всегда светлая, независимо от системы', () => {
    assert.equal(resolveTheme('light', false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
  });

  test('auto — единственный режим, который слушает систему', () => {
    assert.equal(resolveTheme('auto', true), 'light');
    assert.equal(resolveTheme('auto', false), 'dark');
  });
});

describe('theme — предпочтение', () => {
  beforeEach(() => store.clear());

  test('без записи — dark', () => {
    assert.equal(getThemePref(), 'dark');
  });

  test('читает все три валидных значения', () => {
    for (const p of ['dark', 'light', 'auto']) {
      store.set(THEME_KEY, p);
      assert.equal(getThemePref(), p);
    }
  });

  test('мусор в хранилище не роняет и падает на dark', () => {
    store.set(THEME_KEY, '{"theme":"light"}');
    assert.equal(getThemePref(), 'dark');
  });
});

/* Гард на дубль: js/theme-boot.js — классический скрипт, он НЕ может
   импортировать shared/theme.js, поэтому ключ и развилка прошиты в нём
   отдельно. Разъедутся молча (тема просто перестанет применяться до
   отрисовки), поэтому сверяем текстом. */
describe('theme-boot — синхронный дубль', () => {
  const boot = readFileSync(new URL('../js/theme-boot.js', import.meta.url), 'utf8');

  test('использует тот же ключ хранилища', () => {
    assert.equal(THEME_KEY, 'ap-theme');
    assert.ok(boot.includes("'ap-theme'"), 'ключ в theme-boot.js разъехался с shared/theme.js');
  });

  test('ставит data-theme и знает про auto + prefers-color-scheme', () => {
    assert.ok(boot.includes('data-theme'));
    assert.ok(boot.includes('prefers-color-scheme: light'));
    assert.ok(boot.includes("=== 'auto'"));
  });

  test('не module: без import/export — иначе браузер отложит его и тема моргнёт', () => {
    assert.ok(!/^\s*(import|export)\s/m.test(boot));
  });
});

describe('светлая палитра', () => {
  const css = readFileSync(new URL('../css/base.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('блок токенов объявлен в base.css', () => {
    assert.ok(css.includes(":root[data-theme='light']"));
  });

  test('критический CSS несёт светлый фон — иначе вспышка тёмным на старте', () => {
    assert.ok(html.includes(":root[data-theme='light'] body"));
    assert.ok(html.includes('js/theme-boot.js'));
  });

  test('фон страницы в двух местах совпадает (критический CSS ↔ base.css)', () => {
    const inBase = /:root\[data-theme='light'\][\s\S]*?--c-bg:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
    const inHtml = /:root\[data-theme='light'\] body \{[\s\S]*?background:\s*(#[0-9a-f]{6})/i.exec(html)?.[1];
    assert.ok(inBase, '--c-bg светлой темы не найден в base.css');
    assert.equal(inHtml?.toLowerCase(), inBase.toLowerCase());
  });
});
