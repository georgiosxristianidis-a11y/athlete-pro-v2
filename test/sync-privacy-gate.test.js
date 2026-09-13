/**
 * A11 — движок синка обязан молчать в air-gapped режиме.
 *
 * Корень находки: гейт приватности живёт в `safeFetch` (js/privacy.store.js),
 * а Supabase SDK ходит наружу своим собственным `fetch` — мимо обёртки.
 * Поэтому «сеть закрыта в airgap» держалось не на общем барьере, а на ручных
 * проверках режима в каждой функции js/sync.js. Такая проверка была ровно
 * одна — в `pull()`, с комментарием «mirror the push privacy gate» про
 * зеркало, которого не существовало: ни `process()`, ни keep-alive, ни
 * `signIn()` режим не спрашивали.
 *
 * Сценарий отказа: пользователь один раз вошёл в Cloud, потом переключился в
 * airgap. Сессия жива → очередь продолжает отгружать записи в Supabase.
 * Ломается не дефолт (новый пользователь и так airgap), а ОТЗЫВ согласия —
 * то есть ровно то действие, ради которого режим в приложении и есть.
 *
 * Гард поведенческий, а не по исходнику: шпион стоит на самом объекте
 * `supabase`, и тест спрашивает «сколько раз движок потянулся наружу», а не
 * «есть ли в файле нужная строка». Строку можно переставить, вызов — нет.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── Браузерное окружение, которого в node нет ────────────────────────────
   Ставится ДО импорта js/sync.js: модуль на верхнем уровне вешает слушатель
   'online', а очередь живёт в localStorage. */
const _ls = new Map();
globalThis.localStorage = /** @type {*} */ ({
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
  clear: () => _ls.clear(),
});
globalThis.window = /** @type {*} */ ({
  addEventListener() {},
  dispatchEvent() {},
});
// navigator в node есть, но без onLine: без этого process() выйдет по
// «оффлайн» и тест позеленеет, ничего не проверив.
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const { supabase } = await import('../js/supabase.js');
const { getPrivacyMode } = await import('../js/privacy.store.js');
const { SyncManager } = await import('../js/sync.js');

const QUEUE_KEY = 'ap-sync-queue';

/** Каждое обращение к Supabase — строка в этом списке. Пустой список = тишина. */
let reached = [];

function installSpy() {
  reached = [];
  const user = { id: 'user-under-test' };
  supabase.auth.getUser = async () => { reached.push('auth.getUser'); return { data: { user } }; };
  supabase.auth.getSession = async () => { reached.push('auth.getSession'); return { data: { session: { user } } }; };
  supabase.auth.refreshSession = async () => { reached.push('auth.refreshSession'); return { data: { session: null } }; };
  supabase.auth.signInAnonymously = async () => { reached.push('auth.signInAnonymously'); return { data: { user }, error: null }; };
  supabase.auth.signOut = async () => { reached.push('auth.signOut'); return { error: null }; };
  supabase.from = (table) => {
    reached.push(`from:${table}`);
    const rows = { data: [], error: null };
    const chain = {
      select: () => chain, eq: () => chain, in: async () => rows, gt: () => chain,
      upsert: async () => { reached.push(`upsert:${table}`); return { data: null, error: null }; },
      then: (res) => res(rows), // прямой `await q` в pull()
    };
    return chain;
  };
}

/**
 * Гонит движок без планировщика.
 *
 * Негейтованный `process()` на каждой неудаче заводит retry-таймер на 10-15 с
 * и переставляет его снова и снова: без этой обёртки сломанный гейт не валит
 * тест, а вешает прогон насмерть — а зависший прогон читается как флак, не как
 * находка. Таймеры глушатся только на время вызова.
 */
async function runWithoutTimers(fn) {
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = /** @type {*} */ (() => undefined);
  try { return await fn(); }
  finally { globalThis.setTimeout = realSetTimeout; }
}

function seedQueue() {
  _ls.set(QUEUE_KEY, JSON.stringify([
    { store: 'workouts', id: 'w-1', timestamp: Date.now(), retry: 0, _key: 'workouts::w-1' },
  ]));
}

beforeEach(() => {
  _ls.clear();
  installSpy();
});

describe('A11: в air-gapped режиме движок синка не ходит в Supabase', () => {
  test('режим теста — действительно airgap (иначе проверять нечего)', () => {
    assert.equal(getPrivacyMode(), 'airgap',
      'дефолт приватности уехал — гард ниже потеряет смысл, его надо переписать под новый дефолт');
  });

  test('process() не отгружает очередь наружу', async () => {
    seedQueue();
    await runWithoutTimers(() => SyncManager.process());
    assert.deepEqual(reached, [],
      'очередь ушла в Supabase при airgap — отзыв согласия не работает. Достали: ' + reached.join(', '));
  });

  test('process() оставляет очередь на месте — это локальный журнал, не потеря', async () => {
    seedQueue();
    await runWithoutTimers(() => SyncManager.process());
    const queue = JSON.parse(_ls.get(QUEUE_KEY));
    assert.equal(queue.length, 1,
      'записи выброшены из очереди в airgap — при возврате в Cloud они не доедут');
  });

  test('pull() не тянет чужие правки с сервера', async () => {
    await runWithoutTimers(() => SyncManager.pull());
    assert.deepEqual(reached, [], 'pull() сходил наружу при airgap: ' + reached.join(', '));
  });

  test('signIn() не создаёт облачную сессию', async () => {
    await runWithoutTimers(() => SyncManager.signIn());
    assert.deepEqual(reached, [],
      'signIn() поднял анонимную сессию в airgap — движок сам себе выдал право возить данные');
  });

  test('push() продолжает вести локальную очередь', async () => {
    await runWithoutTimers(() => SyncManager.push('workouts', { id: 'w-2', timestamp: Date.now() }));
    const queue = JSON.parse(_ls.get(QUEUE_KEY) || '[]');
    assert.equal(queue.length, 1,
      'push() перестал писать в очередь — движок мёртв, и три теста выше зеленеют впустую');
    assert.deepEqual(reached, [], 'push() дёрнул сеть напрямую: ' + reached.join(', '));
  });
});

/* ════════════════════════════════════════════════════════
   Структурный довесок: keep-alive поведенческим тестом не достать —
   он стоит на setInterval в 10 минут.
   ════════════════════════════════════════════════════════ */
describe('A11: периодический keep-alive тоже под гейтом', () => {
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  /** Комментарии вырезаются: гард, зеленеющий на закомментированной строке, — не гард. */
  const source = fs.readFileSync(path.join(REPO_ROOT, 'js/sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('тик keep-alive спрашивает режим раньше, чем трогает supabase', () => {
    const body = source.slice(source.indexOf('function _startKeepAlive('), source.indexOf('function _loadQueue('));
    assert.ok(body.includes('_startKeepAlive'), 'не найдено тело _startKeepAlive в js/sync.js');

    const gate = body.search(/_netBlocked\(\)|getPrivacyMode\(\)/);
    const net = body.search(/supabase\./);
    assert.notEqual(gate, -1,
      'keep-alive не спрашивает режим: каждые 10 минут refreshSession стучится в Supabase даже в airgap');
    assert.ok(gate < net,
      'проверка режима стоит ПОСЛЕ обращения к supabase — запрос уже ушёл');
  });

  test('_netBlocked закрыт именно на airgap, а не на что попало', () => {
    const decl = source.match(/function _netBlocked\(\)\s*\{([\s\S]*?)\}/);
    assert.ok(decl, 'в js/sync.js нет _netBlocked — гейт растащили по функциям, проверять нечего');
    assert.match(decl[1], /getPrivacyMode\(\)\s*===\s*'airgap'/,
      'единственная дверь гейта перестала спрашивать режим приватности');
  });
});
