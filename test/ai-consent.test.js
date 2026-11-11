// @ts-check
/**
 * P0-AI-CONSENT — ИИ включается только экраном согласия.
 *
 * Маркер `ap-ai-consent` живёт в localStorage устройства отдельно от тумблера
 * `privacy.aiEnabled`, который едет в бэкап и синк. Каждый кейс ниже красный на
 * коде до карточки: там ИИ включался молча (история тренировок, онбординг cloud)
 * и одного тумблера хватало safeFetch.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const _ls = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
});
const node = () => ({
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {},
  appendChild() {},
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  remove() {},
  focus() {},
});
globalThis.document = /** @type {any} */ ({
  addEventListener() {},
  removeEventListener() {},
  createElement: node,
  head: node(),
  body: node(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
});
globalThis.window = /** @type {any} */ (globalThis);
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.dispatchEvent = () => true;
/** @type {string[]} */
const calls = [];
globalThis.fetch = /** @type {any} */ (
  async (/** @type {string} */ url) => {
    calls.push(String(url));
    return new Response('{}', { status: 200 });
  }
);

const P = await import('../js/privacy.store.js');
const { DB } = await import('../js/db.js');
const { LOCAL_BACKUP_KEYS } = await import('../js/db/backup.js');

/** Чистое устройство: пустые настройки и localStorage. */
async function freshDevice() {
  _ls.clear();
  calls.length = 0;
  await DB.Settings.set('privacy.mode', null);
  await DB.Settings.set('privacy.aiEnabled', null);
}

describe('P0-AI-CONSENT — молчаливых путей включения ИИ нет', () => {
  beforeEach(freshDevice);

  test('initPrivacy: история тренировок есть, настроек нет → режим cloud, ИИ выключен', async () => {
    await DB.Workouts.save({ id: 'w-consent-1', timestamp: Date.now(), exercises: [] });
    await P.initPrivacy();
    assert.equal(P.getPrivacyMode(), 'cloud', 'миграция режима старых пользователей не тронута');
    assert.equal(P.getAiEnabled(), false, 'история больше не включает ИИ молча');
    assert.equal(await DB.Settings.get('privacy.aiEnabled'), false);
  });

  test('онбординг не включает ИИ: commitOnboarding не трогает тумблер и маркер', () => {
    // Поведенческий прогон commitOnboarding в cloud упирается в crypto Worker (нет в Node),
    // anon онбординг не предлагает — держим исходник: до карточки здесь стоял setAiEnabled.
    const src = fs.readFileSync(path.join(ROOT, 'js/onboarding.js'), 'utf8').replace(/\/\/.*$/gm, '');
    const start = src.indexOf('export async function commitOnboarding(');
    const body = src.replace(/\r/g, '').slice(start, src.replace(/\r/g, '').indexOf('\n}\n', start));
    assert.ok(start !== -1, 'commitOnboarding пропала');
    assert.doesNotMatch(body, /setAiEnabled|grantAiConsent/);
  });

  test('тумблер без маркера — ИИ выключен; приехавший синком/бэкапом true не включает', async () => {
    await P.setPrivacyMode('cloud');
    await P.setAiEnabled(true);
    assert.equal(P.getAiEnabled(), false);
    await P.grantAiConsent();
    assert.equal(P.getAiEnabled(), true);
    assert.equal(_ls.get(P.AI_CONSENT_KEY), '1');
  });
});

describe('P0-AI-CONSENT — маркер устройства', () => {
  beforeEach(freshDevice);

  test('маркер не едет в бэкап и не принимается импортом', () => {
    assert.ok(!LOCAL_BACKUP_KEYS.includes(P.AI_CONSENT_KEY), 'маркер в LOCAL_BACKUP_KEYS');
  });

  test('выключение тумблером стирает маркер', async () => {
    await P.setPrivacyMode('cloud');
    await P.grantAiConsent();
    await P.revokeAiConsent();
    assert.equal(_ls.has(P.AI_CONSENT_KEY), false);
    await P.setAiEnabled(true);
    assert.equal(P.getAiEnabled(), false, 'повторное включение — снова только через экран');
  });

  test('переход в airgap стирает маркер', async () => {
    await P.setPrivacyMode('cloud');
    await P.grantAiConsent();
    await P.setPrivacyMode('airgap');
    assert.equal(_ls.has(P.AI_CONSENT_KEY), false);
    await P.setPrivacyMode('cloud');
    assert.equal(P.getAiEnabled(), false);
  });

  test('в airgap согласие не выдаётся', async () => {
    await P.setPrivacyMode('airgap');
    await assert.rejects(() => P.grantAiConsent());
    assert.equal(_ls.has(P.AI_CONSENT_KEY), false);
  });
});

describe('P0-AI-CONSENT — центральный барьер safeFetch', () => {
  beforeEach(freshDevice);

  test("kind 'ai' без маркера блокируется даже при включённом тумблере", async () => {
    await P.setPrivacyMode('cloud');
    await P.setAiEnabled(true);
    await assert.rejects(
      () => P.safeFetch('/api/coach', {}, 'ai'),
      (err) => err instanceof P.PrivacyBlockedError && err.code === 'ai-off'
    );
    assert.deepEqual(calls, [], 'запрос ушёл в сеть без согласия');
  });

  test("kind 'ai' с маркером проходит", async () => {
    await P.setPrivacyMode('cloud');
    await P.grantAiConsent();
    await P.safeFetch('/api/coach', {}, 'ai');
    assert.deepEqual(calls, ['/api/coach']);
  });
});
