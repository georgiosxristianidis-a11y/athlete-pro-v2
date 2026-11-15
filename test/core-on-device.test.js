// @ts-check
/**
 * CORE-06 — Core без ИИ: «На устройстве · 0 ₽» вместо замка (флаг core-on-device).
 *
 * Три слоя: режим включается только при ИИ выключен И флаге ON; разметка
 * карточки (дверь «Подключить ключ», без замка, esc, порог «устала»); данные
 * берутся из локальной базы без единого fetch. Плюс шов view: шапка и плашка
 * идут через keyBadge/onDeviceMode, легаси-плашка с замком осталась за OFF.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const stripComments = (/** @type {string} */ s) =>
  s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');

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

/** @type {string[]} */
const calls = [];
globalThis.fetch = /** @type {any} */ (
  async (/** @type {string} */ url) => {
    calls.push(String(url));
    return new Response('{}', { status: 200 });
  }
);

const { initPrivacy, setPrivacyMode, setAiEnabled, grantAiConsent } = await import('../js/privacy.store.js');
const { setFlag } = await import('../js/flags.js');
const { onDeviceMode, keyBadge, onDeviceCardHtml, onDeviceRows, onDeviceMuscles, ON_DEVICE_MUSCLES_MAX } = await import(
  '../js/intel.on-device.js'
);
const { DB } = await import('../js/db.js');

const L = { keyOk: 'KEY OK', keyAirgap: 'AIRGAP', keyMissing: 'NO KEY' };

describe('CORE-06: режим включается только без ИИ и с флагом', () => {
  test('флаг OFF по умолчанию — шапка прежняя', async () => {
    _ls.clear();
    await initPrivacy();
    assert.equal(onDeviceMode(), false);
    assert.deepEqual(keyBadge(L, false, 'airgap'), { dot: 'missing', cls: 'is-missing', text: 'AIRGAP' });
    assert.deepEqual(keyBadge(L, false, 'server'), { dot: 'missing', cls: 'is-missing', text: 'NO KEY' });
  });

  test('флаг ON + airgap (нет ключа, ИИ выключен) — «На устройстве» вместо «НЕТ КЛЮЧА»', async () => {
    _ls.clear();
    await initPrivacy();
    setFlag('core-on-device', true);
    assert.equal(onDeviceMode(), true);
    const b = keyBadge(L, false, 'airgap');
    assert.equal(b.cls, 'is-device');
    assert.equal(b.dot, 'airgap');
    assert.notEqual(b.text, 'AIRGAP');
  });

  test('флаг ON, но ИИ включён — режим не трогает рабочий ИИ', async () => {
    _ls.clear();
    setFlag('core-on-device', true);
    await setPrivacyMode('cloud');
    grantAiConsent();
    setAiEnabled(true);
    assert.equal(onDeviceMode(), false);
    assert.deepEqual(keyBadge(L, true, 'server'), { dot: 'active', cls: 'is-ok', text: 'KEY OK' });
  });
});

describe('CORE-06: карточка', () => {
  test('без замка, с дверью «Подключить ключ» в настройки ИИ и биометрией без ИИ', () => {
    const html = String(onDeviceCardHtml({ canEnableAi: false }));
    assert.match(html, /data-action="intel:openSettings"/);
    assert.match(html, /data-action="intel:biometrics"/);
    assert.match(html, /id="intel-device-muscles"/);
    assert.doesNotMatch(html, /M8 11V7a4 4 0 0 1 8 0v4/, 'дужка замка из старой плашки');
    assert.doesNotMatch(html, /intel:enableAi/, 'в airgap шторка согласия не открывается');
    assert.match(String(onDeviceCardHtml({ canEnableAi: true })), /data-action="intel:enableAi"/);
  });

  test('мышцы: топ по нагрузке, потолок, порог «устала»', () => {
    const rows = onDeviceRows({ chest: 30, quad: 80, calf: 10, lat: 55, glute: 61, mystery: 20 });
    assert.equal(rows.length, ON_DEVICE_MUSCLES_MAX);
    assert.deepEqual(rows.map((r) => r.pct), [80, 61, 55, 30]);
    assert.deepEqual(rows.map((r) => r.high), [true, true, false, false]);
    assert.deepEqual(onDeviceRows({ nope: 0, bad: NaN }), []);
  });
});

describe('CORE-06: данные — только локальная база, 0 запросов', () => {
  test('onDeviceMuscles читает тренировку из IDB и не ходит в сеть', async () => {
    _ls.clear();
    await initPrivacy();
    calls.length = 0;
    await DB.Workouts.save({
      timestamp: Date.now() - 3600000,
      exercises: [{ name: 'Bench Press', sets: [{ done: true }, { done: true }, { done: true }] }],
    });
    const m = await onDeviceMuscles();
    assert.ok(m.chest > 0, `грудь нагружена: ${JSON.stringify(m)}`);
    assert.deepEqual(calls, []);
  });
});

describe('CORE-06: шов view', () => {
  const view = stripComments(read('js/intel.view.js'));
  test('шапка — одна функция keyBadge в load() и refreshKeyBadge()', () => {
    assert.equal((view.match(/keyBadge\(L, _hasValidKey, _keySource\)/g) || []).length, 2);
    assert.doesNotMatch(view, /_keySource === 'airgap'/, 'старая тернарка шапки осталась в обход флага');
  });
  test('замок не снесён: легаси-плашка живёт за OFF', () => {
    assert.match(view, /onDevice \? onDeviceCardHtml\(\) : local \? aiLocalBannerHtml\(/);
    assert.match(view, /if \(onDevice\) renderOnDevice\(/);
  });
});
