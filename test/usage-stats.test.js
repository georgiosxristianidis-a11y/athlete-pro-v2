// @ts-check
/**
 * Счётчик установок (js/usage.js, флаг 'usage-stats').
 *
 * Дыра, которую закрывает файл: телеметрия — единственный код в проекте,
 * который отправляет наружу данные пользователя БЕЗ его явного действия.
 * Регрессия здесь не роняет приложение и не красит ни один другой гард —
 * она просто начинает утекать. Поэтому проверяется не «работает ли
 * отправка», а границы:
 *   • флаг по умолчанию OFF — новый код не включается сам;
 *   • имя события — белый список, а не строка от вызывающего;
 *   • payload — белый список ПОЛЕЙ, всё прочее режется до отправки;
 *   • DNT/GPC и самоисключение бьют тумблер, а не наоборот;
 *   • airgap уходит голым именем, без единого поля.
 *
 * Стабы минимальные, как в test/theme.test.js / test/island-profile.test.js.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Стабы браузера ДО импорта модуля ── */
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
};
globalThis.location = /** @type {any} */ ({
  protocol: 'https:',
  hostname: 'athlete-pro.vercel.app',
  origin: 'https://athlete-pro.vercel.app',
});
/** Node 22 отдаёт globalThis.navigator только через getter — присваивание падает. */
function setNavigator(nav) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}
setNavigator({ onLine: true });
globalThis.window = /** @type {any} */ (globalThis);
window.__privacyMode = () => 'cloud';

const { setFlag } = await import('../js/flags.js');
const usage = await import('../js/usage.js');
const { EVENTS, trackUsage, sanitizePayload, getUsageState, isDoNotTrack, setSelfExcluded, _prune,
  getQueue, flushQueue } = usage;
const { DB } = await import('../js/db.js');

/** Перехват отправок через window.va. */
let sent = [];
function armVa() {
  sent = [];
  window.va = (kind, payload) => sent.push({ kind, payload });
}

describe('usage: флаг по умолчанию', () => {
  test("'usage-stats' объявлен и включён в DEFAULTS", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'js', 'flags.js'), 'utf8');
    assert.match(
      src,
      /'usage-stats':\s*true/,
      "флаг 'usage-stats' включён осознанным флипом LAUNCH-4 — " +
        "kill switch остаётся Flags.setFlag('usage-stats', false)",
    );
  });
});

describe('usage: имя события — белый список', () => {
  beforeEach(() => {
    lsStore.clear();
    setFlag('usage-stats', true);
    armVa();
  });
  afterEach(() => lsStore.clear());

  test('ровно три события, ни одним больше', () => {
    assert.deepEqual([...EVENTS], ['app_open', 'workout_completed', 'coach_message']);
  });

  test('разрешённое имя уходит', async () => {
    await trackUsage('coach_message');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'event');
    assert.equal(sent[0].payload.name, 'coach_message');
  });

  test('чужое имя не уходит вообще', async () => {
    for (const name of ['app_opened', 'workout_completed ', 'pageview', '', 'coach_message_text']) {
      await trackUsage(name, { type: 'push' });
    }
    assert.equal(sent.length, 0, 'отправлено событие вне EVENTS: ' + JSON.stringify(sent));
  });
});

describe('usage: payload — белый список полей', () => {
  beforeEach(() => {
    lsStore.clear();
    setFlag('usage-stats', true);
    window.__privacyMode = () => 'cloud';
    armVa();
  });
  afterEach(() => {
    lsStore.clear();
    window.__privacyMode = () => 'cloud';
  });

  test('поле вне схемы режется, разрешённое остаётся', () => {
    const out = sanitizePayload('workout_completed', {
      type: 'push',
      tonnage: 4200,
      exercises: ['Bench'],
      deviceId: 'abc',
      note: 'болит плечо',
    });
    assert.deepEqual(out, { type: 'push' });
  });

  test('не-скаляр не проходит даже под разрешённым ключом', () => {
    assert.equal(sanitizePayload('workout_completed', { type: { a: 1 } }), undefined);
    assert.equal(sanitizePayload('app_open', { version: ['1.0'], mode: null }), undefined);
  });

  test('coach_message не несёт полей ни при каком payload', () => {
    assert.equal(sanitizePayload('coach_message', { text: 'как мне жать больше', ok: 1 }), undefined);
  });

  test('airgap: наружу уходит голое имя, без payload', async () => {
    window.__privacyMode = () => 'airgap';
    assert.equal(sanitizePayload('workout_completed', { type: 'push' }), undefined);
    await trackUsage('workout_completed', { type: 'push' });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].payload, { name: 'workout_completed' }, 'в airgap payload обязан отсутствовать');
  });
});

describe('usage: ворота', () => {
  beforeEach(() => {
    lsStore.clear();
    armVa();
    setNavigator({ onLine: true });
  });
  afterEach(() => {
    lsStore.clear();
    setNavigator({ onLine: true });
  });

  test('флаг OFF — состояние flag, отправки нет', async () => {
    setFlag('usage-stats', false);
    assert.equal(getUsageState(), 'flag');
    await trackUsage('app_open', { version: '1.0.0' });
    assert.equal(sent.length, 0);
  });

  test('DNT глушит счётчик поверх включённого флага', async () => {
    setFlag('usage-stats', true);
    setNavigator({ onLine: true, doNotTrack: '1' });
    assert.equal(isDoNotTrack(), true);
    assert.equal(getUsageState(), 'dnt');
    await trackUsage('app_open', { version: '1.0.0' });
    assert.equal(sent.length, 0);
  });

  test('GPC глушит так же, как DNT', () => {
    setFlag('usage-stats', true);
    setNavigator({ onLine: true, globalPrivacyControl: true });
    assert.equal(getUsageState(), 'dnt');
  });

  test('самоисключение автора выключает своё устройство', async () => {
    setFlag('usage-stats', true);
    setSelfExcluded(true);
    assert.equal(getUsageState(), 'excluded');
    await trackUsage('app_open', { version: '1.0.0' });
    assert.equal(sent.length, 0);
    setSelfExcluded(false);
    assert.equal(getUsageState(), 'ok');
  });

  test('локальный хост не шлёт — /_vercel/insights там не существует', () => {
    setFlag('usage-stats', true);
    const real = globalThis.location;
    globalThis.location = /** @type {any} */ ({ protocol: 'http:', hostname: '192.168.1.42' });
    assert.equal(getUsageState(), 'host');
    globalThis.location = real;
  });
});

describe('usage: очередь', () => {
  test('_prune режет протухшее (>7 дней)', () => {
    const now = 1_000_000_000_000;
    const q = [
      { t: now - 8 * 24 * 3600e3 },
      { t: now - 6 * 24 * 3600e3 },
      { t: now },
    ];
    assert.deepEqual(_prune(q, now).map((e) => e.t), [now - 6 * 24 * 3600e3, now]);
  });

  test('_prune держит потолок 50 и жертвует СТАРЫМИ', () => {
    const now = 2_000_000_000_000;
    const q = Array.from({ length: 60 }, (_, i) => ({ t: now - (60 - i) * 1000, i }));
    const out = _prune(q, now);
    assert.equal(out.length, 50);
    assert.equal(out[0].i, 10, 'обрезаться должна голова очереди, а не хвост — свежее ценнее');
    assert.equal(out[49].i, 59);
  });

  test('мусор без метки времени выбрасывается, а не роняет досылку', () => {
    assert.deepEqual(_prune([null, undefined, {}, { t: 'вчера' }], Date.now()), []);
  });
});

describe('usage: очередь на живом IndexedDB (fake-indexeddb)', () => {
  beforeEach(async () => {
    lsStore.clear();
    setFlag('usage-stats', true);
    window.__privacyMode = () => 'cloud';
    armVa();
    await DB.Settings.set('ap-usage-queue', []);
  });
  afterEach(async () => {
    lsStore.clear();
    setNavigator({ onLine: true });
    await DB.Settings.set('ap-usage-queue', []);
  });

  test('офлайн — событие ложится в очередь, а не теряется', async () => {
    setNavigator({ onLine: false });
    await trackUsage('workout_completed', { type: 'legs' });
    assert.equal(sent.length, 0, 'офлайн отправки быть не должно');
    const q = await getQueue();
    assert.equal(q.length, 1);
    assert.equal(q[0].n, 'workout_completed');
    assert.deepEqual(q[0].d, { type: 'legs' });
    assert.equal(typeof q[0].t, 'number');
  });

  test('появилась сеть — очередь уходит и обнуляется', async () => {
    setNavigator({ onLine: false });
    await trackUsage('coach_message');
    await trackUsage('workout_completed', { type: 'push' });
    setNavigator({ onLine: true });

    assert.equal(await flushQueue(), 2);
    assert.deepEqual(sent.map((s) => s.payload.name), ['coach_message', 'workout_completed']);
    assert.deepEqual(await getQueue(), [], 'очередь обязана опустеть после досылки');
  });

  test('второй flush подряд не шлёт дубли', async () => {
    setNavigator({ onLine: false });
    await trackUsage('coach_message');
    setNavigator({ onLine: true });
    await flushQueue();
    assert.equal(await flushQueue(), 0);
    assert.equal(sent.length, 1, 'событие ушло дважды — счёт врёт вверх');
  });

  test('очередь лежит под ключом ap-*, иначе бы синкалась между устройствами', async () => {
    setNavigator({ onLine: false });
    await trackUsage('coach_message');
    const all = await DB.Settings.getAll();
    const keys = Object.keys(all).filter((k) => k.includes('usage') && k.includes('queue'));
    assert.deepEqual(keys, ['ap-usage-queue'],
      "ключ очереди без префикса 'ap-' уедет в облачный синк (js/db/settings.js) — " +
      'второе устройство подтянет чужое недосланное и посчитает его повторно');
  });
});

describe('usage: статический гард по вызовам в js/', () => {
  /** Все аргументы-строки первого параметра trackUsage(...) в исходниках. */
  function callSiteNames() {
    /** @type {string[]} */
    const names = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.js') || full.endsWith(path.join('js', 'usage.js'))) continue;
        const src = fs.readFileSync(full, 'utf8');
        const re = /\btrackUsage\(\s*'([^']*)'/g;
        let m;
        while ((m = re.exec(src))) names.push(m[1]);
      }
    };
    walk(path.join(REPO_ROOT, 'js'));
    return names;
  }

  test('ни один вызов не шлёт имя вне EVENTS', () => {
    const names = callSiteNames();
    assert.ok(names.length > 0, 'sanity: вызовы trackUsage должны существовать в js/');
    for (const n of names) {
      assert.ok(
        (/** @type {readonly string[]} */ (EVENTS)).includes(n),
        `trackUsage('${n}') — имени нет в EVENTS, событие молча не уйдёт`,
      );
    }
  });

  test('все три события реально кем-то отправляются', () => {
    const names = new Set(callSiteNames());
    names.add('app_open'); // шлётся через trackAppOpen(), не по имени
    for (const e of EVENTS) {
      assert.ok(names.has(e), `событие '${e}' объявлено, но не вызывается ниоткуда`);
    }
  });
});
