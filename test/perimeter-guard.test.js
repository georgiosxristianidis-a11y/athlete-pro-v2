/**
 * GUARD-1 — периметр в красный тест (HANDOFF_panda_core.md § GUARD-1).
 *
 * Карточка куплена линией `feature/elite-hud-wow`: 22 ревью-агента вынесли
 * «Verdict is CLEAN» на ветке, где BYOK-ключ уезжал открытым текстом и
 * возвращался анониму. Они проверяли ровно четыре требования задания —
 * вопроса «периметр цел?» в задании не было, и его никто не задал.
 *
 * Отсюда правило карточки: то, что можно спросить тестом, спрашивает тест,
 * а не честное слово агента. Четыре инварианта, каждый — на живом факте
 * (заголовок реального ответа, реальный 413), а не на пересказе намерений:
 *
 *   1. Секреты не покидают устройство: `*-key` не попадает ни в очередь
 *      синка, ни в payload, ни обратно из pull.
 *   2. Глобальный лимит тела `express.json` не разрастается (в линии он
 *      уехал 100kb → 10mb одной строкой под заголовком «ui polish»).
 *   3. `script-src` не пускает новые сторонние origin (там же приехал
 *      `vercel.live`).
 *   4. Whitelist AIR-гарда не отключается на целый файл (`'intel.css': [/./]`
 *      снял проверку Tier-2 blur с файла с девятью `backdrop-filter`).
 *
 * Инвариант 4 — про сам гард: **дифф `test/` при аудите читается раньше
 * диффа кода**, одна строка в whitelist тише любого кода отключает проверку.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSecretKey, stripSecrets } from '../js/shared/sync-secrets.js';
import { startServer } from '../server.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/* ════════════════════════════════════════════════════════
   1. Секреты не уезжают с устройства
   ════════════════════════════════════════════════════════ */
describe('Периметр: BYOK-ключи не попадают в синк', () => {
  test('isSecretKey знает секреты в лицо и не трогает обычные настройки', () => {
    for (const key of ['gemini-key', 'anthropic-key', 'openai-key', 'x_token', 'api.secret']) {
      assert.equal(isSecretKey(key), true, `${key} обязан считаться секретом`);
    }
    // Живые ключи настроек из js/ — ни один не должен попасть под фильтр,
    // иначе синк молча перестанет возить обычные настройки.
    for (const key of ['keep-awake', 'weight-unit', 'ai-engine', 'lang', 'avatar-color',
      'onboarding-complete', 'rest-duration', 'profile.goal', 'athlete-name']) {
      assert.equal(isSecretKey(key), false, `${key} — обычная настройка, синк её возит`);
    }
  });

  test('DB.Settings.set не ставит секрет в очередь синка', () => {
    const src = read('js/db/settings.js');
    assert.match(src, /import\s*\{[^}]*isSecretKey[^}]*\}\s*from\s*'\.\.\/shared\/sync-secrets\.js'/,
      'js/db/settings.js не спрашивает isSecretKey — значит секреты уезжают вместе с языком и весом');

    const gate = src.match(/if\s*\(([\s\S]*?)\)\s*\{\s*_triggerSync\(/);
    assert.ok(gate, 'не найдено условие вокруг _triggerSync в js/db/settings.js');
    assert.match(gate[1], /!\s*isSecretKey\(\s*key\s*\)/,
      'условие перед _triggerSync не отсекает секреты');
  });

  test('SyncManager.push отбивает секрет и на прямом вызове, мимо DB.Settings', () => {
    const src = read('js/sync.js');
    const body = src.slice(src.indexOf('async function push('), src.indexOf('async function process('));
    assert.match(body, /isSecretKey\(/,
      'push() принимает записи напрямую — без фильтра барьер в DB.Settings.set обходится одним вызовом');
    assert.match(body, /isSecretKey\([^)]*\)\s*\)\s*return/,
      'push() должен выходить РАНЬШЕ записи в очередь, а не помечать задачу');
  });

  test('pull не втягивает секрет обратно с сервера', () => {
    const src = read('js/sync.js');
    const body = src.slice(src.indexOf('async function pull('));
    assert.match(body, /isSecretKey\(/,
      'ключ, уехавший на сервер с прошлых версий, вернётся в локальную базу и снова начнёт возиться');
  });

  test('секретов нет в исходниках — ключ живёт только в базе пользователя', () => {
    const offenders = [];
    for (const rel of ['js/sync.js', 'js/db/settings.js', 'js/shared/sync-secrets.js']) {
      const src = read(rel);
      // AIza… (Google) и sk-ant-… (Anthropic) — префиксы, по которым проект сам валидирует ключи
      const hit = src.match(/AIza[\w-]{10,}|sk-ant-[\w-]{10,}/);
      if (hit) offenders.push(`${rel}: ${hit[0].slice(0, 12)}…`);
    }
    assert.deepEqual(offenders, [], 'ключ попал в исходник:\n' + offenders.join('\n'));
  });
});

/* ════════════════════════════════════════════════════════
   1b. Секреты не уезжают в промпт

   Инварианты выше сторожат ОЧЕРЕДЬ СИНКА. Дверь наружу была не одна:
   `DB.Settings.getAll()` отдаёт store `settings` целиком, включая `gemini-key`,
   и этот объект уезжал в тело запроса полем `profile`, а роутер подставлял его
   в текст промпта (`Profile: ${JSON.stringify(profile)}`). Путь идёт мимо
   `push()`/`Settings.set()`, поэтому все четыре инварианта были зелёными,
   пока ключ ехал в контекст стороннего движка открытым текстом.

   Тот же класс бага, что купил карточку GUARD-1, — и прежний гард его не видел.
   ════════════════════════════════════════════════════════ */
describe('Периметр: BYOK-ключи не попадают в промпт', () => {
  test('stripSecrets выкидывает секреты и не трогает остальной профиль', () => {
    const safe = stripSecrets({
      'athlete-name': 'Gio', 'weight-unit': 'kg', goal: 'strength',
      'gemini-key': 'AIzaSyDUMMY_TEST_VALUE', 'anthropic-key': 'sk-ant-DUMMY', x_token: 't',
    });
    assert.deepEqual(Object.keys(safe).sort(), ['athlete-name', 'goal', 'weight-unit']);
    assert.equal(JSON.stringify(safe).includes('DUMMY'), false,
      'секрет пережил фильтр — он уедет в текст промпта');
  });

  test('stripSecrets не падает на мусоре и не отдаёт исходную ссылку', () => {
    for (const junk of [null, undefined, 'str', 42]) {
      assert.deepEqual(stripSecrets(/** @type {*} */ (junk)), {});
    }
    const src = { lang: 'ru' };
    assert.notEqual(stripSecrets(src), src, 'вернулась та же ссылка — мутация профиля утечёт наружу');
  });

  test('ни один call-site не шлёт наружу сырой Settings.getAll()', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/');
        // Профиль, уезжающий на сервер, обязан быть отфильтрован в момент снятия.
        // Локальные читатели настроек (profile.js, privacy.view.js, backup) — не в счёт:
        // они рисуют UI и пишут файл на устройстве, наружу не ходят.
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
          const m = line.match(/\bprofile\s*=\s*(?:await\s+)?(?:DB\.)?Settings\.getAll\(\)/);
          if (m && !line.includes('stripSecrets')) offenders.push(`${rel}: ${line.trim()}`);
        }
      }
    };
    walk(path.join(REPO_ROOT, 'js'));
    assert.deepEqual(offenders, [],
      'снимок настроек уходит в `profile` без stripSecrets — вместе с BYOK-ключом:\n' +
      offenders.join('\n'));
  });

  test('роутер не доверяет клиенту: profile фильтруется на сервере', () => {
    const src = read('routes/coach.js');
    assert.match(src, /import\s*\{[^}]*stripSecrets[^}]*\}\s*from\s*'\.\.\/js\/shared\/sync-secrets\.js'/,
      'routes/coach.js не спрашивает stripSecrets — фильтр держится только на клиенте');

    // Каждый маршрут, подставляющий profile в промпт, обязан взять его через фильтр.
    const prompts = [...src.matchAll(/JSON\.stringify\(profile\)/g)].length;
    const strips = [...src.matchAll(/stripSecrets\(\s*(?:raw)?[Pp]rofile\s*\)/g)].length;
    assert.ok(strips >= prompts,
      `profile уходит в промпт ${prompts} раз, а через stripSecrets проходит ${strips} — ` +
      'значит есть маршрут, который печатает store настроек в контекст модели как есть');
  });
});

/* ════════════════════════════════════════════════════════
   2 и 3. Периметр сервера — на живом ответе, не на чтении конфига
   ════════════════════════════════════════════════════════ */
describe('Периметр сервера: лимит тела и script-src', () => {
  let server, baseUrl;

  before(async () => {
    server = await startServer(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const MAX_BODY_BYTES = 100 * 1024; // 100kb — потолок, а не текущее значение

  test('express.json объявлен с лимитом не выше 100kb', () => {
    const src = read('server.js');
    const decl = src.match(/express\.json\(\s*\{[^}]*limit:\s*['"]([^'"]+)['"]/);
    assert.ok(decl, 'express.json смонтирован без явного limit — вернулся дефолт body-parser');
    const [, raw] = decl;
    const m = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
    assert.ok(m, `не разобрать лимит '${raw}'`);
    const mult = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[m[2] || 'b'];
    assert.ok(Number(m[1]) * mult <= MAX_BODY_BYTES,
      `глобальный лимит тела вырос до '${raw}'. Он глобальный: поднятый ради одного эндпоинта, ` +
      'он поднят для всех. Нужен большой upload — лимит ставится на его роутере, не в app.use.');
  });

  test('тело крупнее лимита отбивается 413, а не доходит до роутера', async () => {
    const res = await fetch(`${baseUrl}/api/coach/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES + 4096) }),
    });
    assert.equal(res.status, 413, `ожидался 413 Payload Too Large, пришёл ${res.status}`);
  });

  /** Директивы CSP из живого заголовка: 'script-src' → ["'self'", ...]. */
  async function directives() {
    const res = await fetch(`${baseUrl}/`);
    const header = res.headers.get('content-security-policy');
    assert.ok(header, 'сервер не отдал Content-Security-Policy — политики нет вообще');
    const map = new Map();
    for (const part of header.split(';')) {
      const [name, ...values] = part.trim().split(/\s+/);
      if (name) map.set(name.toLowerCase(), values);
    }
    return map;
  }

  /** Сторонние origin в script-src — только эти. Новый требует решения, а не строки в конфиге. */
  const SCRIPT_SRC_ALLOWED = new Set(["'self'", 'https://cdn.jsdelivr.net']);

  test('script-src не пускает новые сторонние origin', async () => {
    const d = await directives();
    const extra = (d.get('script-src') || []).filter((v) => !SCRIPT_SRC_ALLOWED.has(v));
    assert.deepEqual(extra, [],
      'в script-src приехал сторонний origin: ' + extra.join(', ') +
      '. Каждый — это чужой код с правами страницы; расширять список осознанно, вместе с этим тестом.');
  });

  test('connect-src не пускает origin, которого нет в списке решённых', async () => {
    const d = await directives();
    const ALLOWED = new Set([
      "'self'", 'https://cdn.jsdelivr.net', 'https://api.anthropic.com',
      'https://*.supabase.co', 'https://*.firebaseio.com', 'https://*.googleapis.com',
      'https://generativelanguage.googleapis.com',
    ]);
    const extra = (d.get('connect-src') || []).filter((v) => !ALLOWED.has(v));
    assert.deepEqual(extra, [], 'в connect-src приехал новый адрес: ' + extra.join(', '));
  });
});

/* ════════════════════════════════════════════════════════
   4. Гард нельзя отключить строкой в собственном whitelist
   ════════════════════════════════════════════════════════ */
describe('Периметр гардов: whitelist AIR не отключается на целый файл', () => {
  /** Файлы, которым catch-all в whitelist разрешён: файл целиком — Tier-2 поверхность. */
  const CATCH_ALL_OK = new Set(['dynamic-island.css']);

  test("в TIER2_WHITELIST нет `[/./]` на файл, кроме островного", () => {
    const src = read('test/air-guard.test.js');
    const block = src.slice(src.indexOf('const TIER2_WHITELIST'), src.indexOf('/** Strips comments'));
    assert.ok(block.includes('TIER2_WHITELIST'), 'не найден блок TIER2_WHITELIST в test/air-guard.test.js');

    const offenders = [];
    for (const line of block.split('\n')) {
      const entry = line.match(/^\s*'([^']+\.css)'\s*:\s*\[(.*)\]/);
      if (!entry) continue;
      const [, file, list] = entry;
      // `/./` (и `/.*/ `) матчит любой селектор — это выключение проверки для файла
      if (!/\[?\s*\/\.\*?\/\s*,?/.test(`[${list}]`)) continue;
      if (CATCH_ALL_OK.has(file)) continue;
      offenders.push(`${file}: ${list.trim()}`);
    }

    assert.deepEqual(offenders, [],
      'catch-all в whitelist AIR-гарда снимает проверку Tier-2 blur со всего файла:\n' +
      offenders.join('\n') +
      '\nИменно так `intel.css` прошёл с девятью backdrop-filter. Нужен blur — вносится селектор, не файл.');
  });

  test('AIR-гард жив: whitelist не разросся до всех css-файлов', () => {
    const src = read('test/air-guard.test.js');
    const block = src.slice(src.indexOf('const TIER2_WHITELIST'), src.indexOf('/** Strips comments'));
    const listed = block.match(/^\s*'[^']+\.css'\s*:/gm) || [];
    const cssFiles = fs.readdirSync(path.join(REPO_ROOT, 'css')).filter((f) => f.endsWith('.css'));
    assert.ok(listed.length < cssFiles.length,
      `в whitelist ${listed.length} файлов из ${cssFiles.length} — гард перестал что-либо проверять`);
  });
});
