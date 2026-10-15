// @ts-check
/**
 * Guard for the AI settings store (card PC-1).
 *
 * The view is DOM, so the logic under it lives in js/ai-settings.store.js
 * and is tested here: prefix checks, the indicator's start state, and
 * which settings key belongs to which engine.
 */
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { DB } = await import('../js/db.js');
const {
  keyLooksValid,
  keyConnInitState,
  keyField,
  keyPrefix,
  KEY_PREFIX,
  KEY_FIELD,
  getAllSettings,
} = await import('../js/ai-settings.store.js');

// Writes outside airgap poke the sync queue (localStorage) and the event bus
// (window). Stubs go AFTER the imports so module load stays browser-free.
const _ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
});
globalThis.window = /** @type {any} */ ({
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

describe('keyLooksValid', () => {
  test('Gemini key needs AIza prefix and length over 30', () => {
    assert.equal(keyLooksValid('gemini', 'AIza' + 'x'.repeat(27)), true);
    assert.equal(keyLooksValid('gemini', 'AIza' + 'x'.repeat(26)), false);
    assert.equal(keyLooksValid('gemini', 'sk-ant-' + 'x'.repeat(30)), false);
    assert.equal(keyLooksValid('gemini', ''), false);
    assert.equal(keyLooksValid('gemini', '   '), false);
  });

  test('Claude key needs sk-ant- prefix and length over 30', () => {
    assert.equal(keyLooksValid('anthropic', 'sk-ant-' + 'x'.repeat(24)), true);
    assert.equal(keyLooksValid('anthropic', 'sk-ant-' + 'x'.repeat(23)), false);
    assert.equal(keyLooksValid('anthropic', 'AIza' + 'x'.repeat(30)), false);
  });
});

describe('keyConnInitState', () => {
  const gem = KEY_PREFIX.gemini;
  const ant = KEY_PREFIX.anthropic;

  test('empty field, no server key → empty', () => {
    assert.equal(keyConnInitState('', gem, false), 'empty');
  });

  test('empty field with server key → server', () => {
    assert.equal(keyConnInitState('', gem, true), 'server');
    assert.equal(keyConnInitState('   ', ant, true), 'server');
  });

  test('saved looks like a key but is not yet pinged', () => {
    assert.equal(keyConnInitState('AIza' + 'y'.repeat(27), gem, false), 'saved');
    assert.equal(keyConnInitState('sk-ant-' + 'y'.repeat(24), ant, false), 'saved');
  });

  test('partial — wrong prefix or too short', () => {
    assert.equal(keyConnInitState('AIza-short', gem, false), 'partial');
    assert.equal(keyConnInitState('not-a-key-at-all-but-long-enough-xx', gem, false), 'partial');
  });
});

describe('key field by engine', () => {
  test('each engine reads its own BYOK slot', () => {
    assert.equal(keyField('gemini'), 'gemini-key');
    assert.equal(keyField('anthropic'), 'anthropic-key');
    assert.equal(keyField('gemini'), KEY_FIELD.gemini);
    assert.equal(keyField('anthropic'), KEY_FIELD.anthropic);
  });

  test('unknown engine falls back to gemini (the launch default)', () => {
    assert.equal(keyField('openai'), 'gemini-key');
    assert.equal(keyPrefix(undefined), 'AIza');
  });
});

describe('getAllSettings (A15: the sheet reads settings via the store)', () => {
  after(async () => {
    await DB.clearAll();
  });

  test('returns the same snapshot as DB.Settings.getAll()', async () => {
    await DB.clearAll();
    await DB.Settings.set('ai-engine', 'anthropic');
    await DB.Settings.set('anthropic-key', 'sk-ant-' + 'x'.repeat(30));
    await DB.Settings.set('intel-tone', 70);

    const viaStore = await getAllSettings();
    assert.deepEqual(viaStore, await DB.Settings.getAll());
    assert.equal(viaStore['ai-engine'], 'anthropic');
    assert.equal(viaStore['intel-tone'], 70);
  });

  test('empty base gives the same empty snapshot', async () => {
    await DB.clearAll();
    assert.deepEqual(await getAllSettings(), await DB.Settings.getAll());
  });
});
