/**
 * LAUNCH-5B: first-run language from the device locale (F-1) and the
 * audit tails that used to stay English after the user chose RU.
 */
import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
};

/** Node 22 отдаёт navigator только через getter — присваивание падает. */
function setNavigator(nav) {
  Object.defineProperty(globalThis, 'navigator', {
    value: nav,
    configurable: true,
    writable: true,
  });
}
setNavigator({ languages: ['en-US'], language: 'en-US' });
globalThis.window = /** @type {any} */ (globalThis);

const { DB } = await import('../js/db.js');
const { detectDeviceLang, initLocale, getLang } = await import('../js/locale.store.js');

before(async () => {
  await DB.clearAll();
});
afterEach(async () => {
  await DB.clearAll();
  setNavigator({ languages: ['en-US'], language: 'en-US' });
});

describe('detectDeviceLang', () => {
  test('ru-RU primary tag → ru', () => {
    assert.equal(detectDeviceLang(['ru-RU', 'ru']), 'ru');
    assert.equal(detectDeviceLang(['ru']), 'ru');
  });

  test('anything else stays en, including empty', () => {
    assert.equal(detectDeviceLang(['en-US']), 'en');
    assert.equal(detectDeviceLang(['uk-UA']), 'en');
    assert.equal(detectDeviceLang([]), 'en');
  });

  test('without args reads navigator.languages', () => {
    setNavigator({ languages: ['ru-RU'], language: 'ru-RU' });
    assert.equal(detectDeviceLang(), 'ru');
    setNavigator({ languages: [], language: 'ru' });
    assert.equal(detectDeviceLang(), 'ru');
  });
});

describe('initLocale', () => {
  test('no saved lang + ru device → persists ru', async () => {
    setNavigator({ languages: ['ru-RU', 'ru'], language: 'ru-RU' });
    await initLocale();
    assert.equal(getLang(), 'ru');
    assert.equal(await DB.Settings.get('lang'), 'ru');
  });

  test('saved en is not overwritten by a ru device', async () => {
    await DB.Settings.set('lang', 'en');
    setNavigator({ languages: ['ru-RU'], language: 'ru-RU' });
    await initLocale();
    assert.equal(getLang(), 'en');
    assert.equal(await DB.Settings.get('lang'), 'en');
  });

  test('persisted choice survives a later device-locale change', async () => {
    setNavigator({ languages: ['ru-RU'], language: 'ru-RU' });
    await initLocale();
    setNavigator({ languages: ['en-US'], language: 'en-US' });
    await initLocale();
    assert.equal(getLang(), 'ru');
  });
});

describe('LAUNCH-5B tails leave the views', () => {
  test('initLocale no longer defaults Settings.get(lang) to en', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'locale.store.js'), 'utf8');
    assert.equal(
      /Settings\.get\('lang',\s*'en'\)/.test(src),
      false,
      'дефолт новичка больше не прибит к en в initLocale'
    );
    assert.match(src, /export function detectDeviceLang/);
  });

  test('known English tails are gone from the views that showed them', () => {
    const claude = fs.readFileSync(path.join(ROOT, 'js', 'claude.view.js'), 'utf8');
    assert.equal(claude.includes('Assistant hidden. Enable in Profile.'), false);
    assert.equal(claude.includes('title="Sound"'), false);
    assert.equal(claude.includes('title="Hide Assistant"'), false);

    const render = fs.readFileSync(path.join(ROOT, 'js', 'workout.view', 'render.js'), 'utf8');
    assert.equal(render.includes('No sessions yet'), false);
    assert.equal(render.includes('Add Set'), false);
    assert.equal(render.includes('Complete Session'), false);
    assert.equal(render.includes('Swipe down to close'), false);

    const profile = fs.readFileSync(path.join(ROOT, 'js', 'profile.js'), 'utf8');
    assert.equal(profile.includes("t('profile.danger_zone')"), true);
    assert.equal(profile.includes("t('profile.clear_all')"), true);
    assert.equal(profile.includes("'Clear All Data'"), false);

    const island = fs.readFileSync(path.join(ROOT, 'js', 'shared', 'dynamic-island.js'), 'utf8');
    assert.equal(island.includes('title="Skip Exercise"'), false);
    assert.equal(island.includes('title="Finish workout"'), false);
    assert.equal(island.includes("t('island.skip_ex')"), true);

    const onboarding = fs.readFileSync(path.join(ROOT, 'js', 'onboarding.js'), 'utf8');
    assert.equal(/const ru = false/.test(onboarding), false);
    assert.equal(onboarding.includes("What's your goal?"), false);
    assert.equal(onboarding.includes('data-action="ob:setLang"'), true);
    assert.equal(onboarding.includes('setLang'), true);
  });
});
