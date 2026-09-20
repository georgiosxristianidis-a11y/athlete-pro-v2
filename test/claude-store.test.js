// @ts-check
/**
 * A15 — поверхность claude: `js/claude.view.js` больше не ходит в IndexedDB.
 *
 * Гард `test/import-guard.test.js` считает вызовы и видит только ноль; чем
 * этот ноль заплачен — здесь, на реальной базе (`fake-indexeddb`), без моков.
 * Три вещи, которые перенос мог потерять молча:
 *   1. индикатор FAB читает ключ ИМЕННО выбранного движка, а не любой;
 *   2. крестик на панде пишет ОБЕ половины пары `ai-panda-hidden`/`show-mascot`
 *      (раньше view писал их сам, мимо владельца пары в `profile.store.js`);
 *   3. переключатель движка уважает airgap — прямой `DB.Settings.set` его обходил.
 *
 * DOM здесь не поднимается намеренно: сторы обязаны работать без него.
 * Появится в сторе `document` — файл упадёт на импорте, а не на ассерте.
 * Поэтому заглушки `localStorage`/`window` стоят ПОСЛЕ импортов, а не до:
 * до импортов они бы заодно замаскировали обращение к браузеру на загрузке
 * модуля — ровно то, что этот файл обязан ловить.
 */
import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { DB } = await import('../js/db.js');
const claudeStore = await import('../js/claude.store.js');
const { hasLocalKey, getEngine, setEngine } = await import('../js/ai-settings.store.js');
const { togglePandaHidden } = await import('../js/profile.store.js');
const { setPrivacyMode } = await import('../js/privacy.store.js');

// Вне airgap запись в базу дёргает очередь синка (`js/sync.js`), а та живёт в
// localStorage. Без заглушки падает не ассерт, а фон — unhandledRejection.
const _ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
});

// `window` без `document`: это не DOM, а шина событий. Сторы шлют через неё
// 'ap-ai-engine' / 'ap-privacy-mode', и отложенный флаш очереди синка тоже
// трогает window уже после теста. Заодно даёт проверить сам факт события —
// на него подписан FAB, и прямая запись в базу его не рождала.
/** @type {Array<{type:string, detail?:any}>} */
const firedEvents = [];
globalThis.window = /** @type {any} */ ({
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (/** @type {any} */ e) => {
    firedEvents.push({ type: e.type, detail: e.detail });
    return true;
  },
});

const GEM_KEY = 'AIza' + 'x'.repeat(30);
const ANT_KEY = 'sk-ant-' + 'x'.repeat(30);

before(async () => {
  await DB.clearAll();
});
afterEach(async () => {
  await DB.clearAll();
});

describe('A15 claude — BYOK-ключ для индикатора FAB', () => {
  test('пустой слот — ключа нет', async () => {
    assert.equal(await hasLocalKey('gemini'), false);
    assert.equal(await hasLocalKey('anthropic'), false);
  });

  test('пробелы ключом не считаются — индикатор не должен гореть «ready»', async () => {
    await DB.Settings.set('gemini-key', '   ');
    assert.equal(await hasLocalKey('gemini'), false);
  });

  test('ключ одного движка не засчитывается другому', async () => {
    await DB.Settings.set('gemini-key', GEM_KEY);
    assert.equal(await hasLocalKey('gemini'), true);
    assert.equal(await hasLocalKey('anthropic'), false, 'чужой слот — чужой ключ');

    await DB.Settings.set('anthropic-key', ANT_KEY);
    assert.equal(await hasLocalKey('anthropic'), true);
  });

  test('движок по умолчанию читается тем же адресом, что и слот', async () => {
    await DB.Settings.set('gemini-key', GEM_KEY);
    assert.equal(await hasLocalKey(await getEngine()), true, 'дефолтный движок — gemini');
  });
});

describe('A15 claude — крестик на FAB прячет маскота', () => {
  test('по умолчанию панда видна', async () => {
    assert.equal(await claudeStore.getPandaHidden(), false);
  });

  test('hideMascot пишет обе половины пары', async () => {
    await claudeStore.hideMascot();
    assert.equal(await DB.Settings.get('ai-panda-hidden'), true, 'читает FAB');
    assert.equal(await DB.Settings.get('show-mascot'), 'off', 'читает пустой Home');
    assert.equal(await claudeStore.getPandaHidden(), true);
  });

  test('после крестика тумблер профиля возвращает маскота целиком', async () => {
    await claudeStore.hideMascot();
    assert.equal(await togglePandaHidden(), false, 'тумблер видит состояние, а не свой счётчик');
    assert.equal(await DB.Settings.get('ai-panda-hidden'), false);
    assert.equal(await DB.Settings.get('show-mascot'), 'on');
  });
});

describe('A15 claude — переключатель движка идёт через стор', () => {
  test('airgap: движок не меняется и ключ в базе остаётся прежним', async () => {
    await setPrivacyMode('airgap');
    await DB.Settings.set('ai-engine', 'gemini');

    const res = await setEngine('anthropic');
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, 'airgap');
    assert.equal(await getEngine(), 'gemini', 'прямая запись обходила этот стоп');
  });

  test('cloud: движок пишется в тот же ключ, что читает getEngine', async () => {
    await setPrivacyMode('cloud');
    const res = await setEngine('anthropic');
    assert.equal(res.ok, true);
    assert.equal(await getEngine(), 'anthropic');

    await setPrivacyMode('airgap'); // вернуть дефолт модуля следующему файлу
  });

  test('смена движка рождает ap-ai-engine — на него перерисовывается FAB', async () => {
    await setPrivacyMode('cloud');
    firedEvents.length = 0;

    await setEngine('gemini');
    const ev = firedEvents.find((e) => e.type === 'ap-ai-engine');
    assert.ok(ev, 'без события индикатор FAB останется от прошлого движка');
    assert.equal(ev.detail.engine, 'gemini');

    await setPrivacyMode('airgap');
  });
});
