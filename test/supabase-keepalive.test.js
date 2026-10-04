/**
 * Гейт для keep-alive Supabase (`.github/workflows/supabase-keepalive.yml` +
 * `supabase/keepalive.sql`, карточка SUPA-1).
 *
 * Прежний пинг был зелёным три прогона подряд, а проект всё равно уснул: SELECT
 * под anon, обрезанный RLS до `[]`, раз в три дня. Прогон workflow этого не
 * показывал и показать не мог, поэтому ошибка жила в шапке как «активность
 * засчитана». Здесь сторожится то, что YAML и SQL обещают словами, но ни один
 * прогон до прода не проверит:
 *
 *   1. ПРАВА И СЕКРЕТЫ. В CI только URL и anon-ключ, право только
 *      `issues: write`. Повысить ключ до `service_role` ради «надёжного» пинга —
 *      самый короткий путь сломать модель угроз, и он должен краснеть здесь.
 *   2. ПИНГ. POST в rpc ровно той функции, что объявлена в SQL-файле; тело
 *      ответа в лог не попадает; на каждый класс кода свой диагноз, и красный
 *      выход идёт только через `fail`, иначе issue останется без причины.
 *   3. SQL. SECURITY DEFINER с пустым search_path, EXECUTE только у anon, у
 *      таблицы RLS и ни одного права anon.
 *   4. ISSUE. Скрипт github-script исполняется с моками Octokit: провал заводит
 *      issue или дописывает в открытый, отказ API не глотает сигнал молча,
 *      зелёный прогон закрывает issue сам.
 *
 * Комментарии из shell, YAML и SQL вырезаются до проверки: гард на регекспе
 * зеленеет, если нужная строка осталась только в комментарии.
 *
 * Baseline: пути переопределяются переменными окружения, на прежнем workflow
 * (SELECT из workouts) тест обязан краснеть:
 *
 *   git show 9326e1a2:.github/workflows/supabase-keepalive.yml > /tmp/old.yml
 *   KEEPALIVE_WORKFLOW=/tmp/old.yml node --test test/supabase-keepalive.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = fs.readFileSync(
  process.env.KEEPALIVE_WORKFLOW || path.join(REPO_ROOT, '.github/workflows/supabase-keepalive.yml'),
  'utf8'
);
const SQL_RAW = fs.readFileSync(
  process.env.KEEPALIVE_SQL || path.join(REPO_ROOT, 'supabase/keepalive.sql'),
  'utf8'
);

const indentOf = (line) => line.match(/^ */)[0].length;
const dropHashComments = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

/**
 * Тело блок-скаляра `<key>: |` — по отступам, как в test/main-watchdog.test.js.
 * Нет блока — пустая строка, а не исключение: на baseline должны краснеть
 * отдельные проверки, а не загрузка файла целиком.
 */
function extractBlock(yaml, key) {
  const lines = yaml.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^\\s*${key}:\\s*\\|[-+]?\\s*$`).test(l));
  if (at === -1) return '';

  const keyIndent = indentOf(lines[at]);
  const body = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (indentOf(line) <= keyIndent) break;
    body.push(line);
  }
  const base = Math.min(...body.filter((l) => l !== '').map(indentOf));
  return body.map((l) => l.slice(base)).join('\n');
}

/** Верхнеуровневый `permissions:`. */
function extractPermissions(yaml) {
  const lines = yaml.split(/\r?\n/);
  const at = lines.findIndex((l) => /^permissions:\s*$/.test(l));
  assert.notEqual(at, -1, 'в воркфлоу нет верхнеуровневого блока `permissions:`');
  const perms = {};
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (indentOf(line) === 0) break;
    const m = line.match(/^\s+([\w-]+):\s*(\S+)\s*$/);
    if (m) perms[m[1]] = m[2];
  }
  return perms;
}

const YAML = dropHashComments(WORKFLOW);
const RUN = dropHashComments(extractBlock(WORKFLOW, 'run'));
const SCRIPT = extractBlock(WORKFLOW, 'script');
const SQL = SQL_RAW.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const FN = (SQL.match(/create or replace function public\.(\w+)\(\)/) ?? [])[1];

// --- 1. Права и секреты -------------------------------------------------------

test('keep-alive: в CI только SUPABASE_URL и anon-ключ, без service_role и токенов', () => {
  const secrets = [...new Set([...YAML.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(
    secrets,
    ['SUPABASE_ANON_KEY', 'SUPABASE_URL'],
    'keep-alive читает лишний секрет. Пингу хватает anon: функция SECURITY DEFINER ' +
      'открыта anon, service_role и management-токен в CI не нужны'
  );
  assert.match(RUN, /\[ "\$key_role" = "anon" \] \|\| fail /, 'проверка роли ключа снята: в секрет можно положить service_role');
});

test('keep-alive: права workflow — только issues: write', () => {
  assert.deepEqual(extractPermissions(WORKFLOW), { issues: 'write' });
  assert.doesNotMatch(
    YAML,
    /^ +permissions:/m,
    'у job свой блок permissions — верхнеуровневый минимум обходится'
  );
});

// --- 2. Пинг ------------------------------------------------------------------

test('keep-alive: пинг — POST в rpc функции, объявленной в supabase/keepalive.sql', () => {
  assert.ok(FN, 'в SQL-файле нет `create or replace function public.<имя>()`');
  assert.match(RUN, /-X POST /, 'вызов rpc без POST: GET на volatile-функцию PostgREST не пустит в запись');
  assert.ok(
    RUN.includes(`"$SUPABASE_URL/rest/v1/rpc/${FN}"`),
    `workflow зовёт не ту функцию, что объявлена в SQL (${FN})`
  );
  const restPaths = [...RUN.matchAll(/\/rest\/v1\/([\w/]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(restPaths)],
    [`rpc/${FN}`],
    'в пинге остался другой REST-путь — например, SELECT, который RLS режет в ноль'
  );
});

test('keep-alive: тело ответа в лог не попадает, только размер', () => {
  const touching = RUN.split('\n').filter((l) => l.includes('$resp'));
  assert.ok(touching.length > 0, 'переменная ответа $resp не найдена — пинг переписан?');
  const allowed = [/^\s*resp="\$RUNNER_TEMP\/[\w.-]+"$/, /rm -f "\$resp"/, /-o "\$resp"/, /wc -c[^|]*< "\$resp"/];
  const leaks = touching.filter((l) => !allowed.some((re) => re.test(l)));
  assert.deepEqual(leaks, [], 'ответ базы читается не только ради размера — тело может уйти в лог');
});

/** Ветви `case "$http_code" in … esac`: шаблон → тело ветви. */
function httpCodeArms(script) {
  const block = script.match(/case "\$http_code" in\n([\s\S]*?)\n\s*esac/);
  assert.ok(block, 'нет разбора кода ответа `case "$http_code" in`');
  const arms = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*([^\s)]+)\)\s*(.*)$/);
    if (m) arms[m[1]] = m[2];
  }
  return arms;
}

test('keep-alive: у каждого класса ответа свой диагноз', () => {
  const arms = httpCodeArms(RUN);
  assert.deepEqual(Object.keys(arms).sort(), ['*', '000|5??', '2??', '401|403', '404'].sort());
  assert.doesNotMatch(arms['2??'], /fail/, '2xx — успех, он не должен краснеть');
  assert.match(arms['404'], /^fail "SQL ещё не применён/, '404 на rpc = SQL не применён, и лог обязан сказать это прямо');
  assert.match(arms['000|5??'], /^fail ".*уснул/, '000/5xx — главный сигнал «проект спит»');
  assert.match(arms['401|403'], /^fail /);
  assert.match(arms['*'], /^fail /, 'неизвестный код молча проходит как успех');
});

test('keep-alive: красный выход только через fail, молчаливого пропуска нет', () => {
  const fnBody = RUN.match(/fail\(\) \{\n([\s\S]*?)\n\}/);
  assert.ok(fnBody, 'нет функции fail()');
  assert.match(fnBody[1], /> "\$verdict_file"/, 'fail не пишет диагноз в файл — issue останется без причины');
  const outside = RUN.replace(fnBody[0], '');
  assert.doesNotMatch(outside, /\bexit\b/, 'голый exit мимо fail: провал без диагноза или зелёный пропуск пинга');
  assert.match(
    SCRIPT,
    /keepalive-verdict\.txt/,
    'шаг issue читает диагноз не из того файла, куда его пишет fail'
  );
  assert.match(RUN, /verdict_file="\$RUNNER_TEMP\/keepalive-verdict\.txt"/);
});

test('keep-alive: шаг issue видит исход пинга и не бежит на отмене', () => {
  assert.ok(RUN, 'нет шага `run: |` с пингом');
  assert.ok(SCRIPT, 'нет шага github-script (`script: |`): провал не заведёт issue, Gio узнает о паузе последним');
  assert.match(YAML, /^ +id: ping *$/m);
  assert.match(YAML, /PING_OUTCOME: \$\{\{ steps\.ping\.outcome \}\}/);
  assert.match(YAML, /if: \$\{\{ !cancelled\(\) \}\}/, 'шаг issue без !cancelled() пропустится на провале пинга');
});

// --- 3. SQL -------------------------------------------------------------------

test('keep-alive SQL: SECURITY DEFINER с пустым search_path, EXECUTE только у anon', () => {
  assert.match(SQL, /security definer/);
  assert.match(SQL, /set search_path = ''/, 'SECURITY DEFINER без пустого search_path подменяется через схему');
  assert.match(
    SQL,
    new RegExp(`revoke all on function public\\.${FN}\\(\\) from public, anon, authenticated`),
    'EXECUTE не снят с PUBLIC и ролей Supabase до выдачи anon'
  );
  const grants = [...SQL.matchAll(/grant ([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(grants, [`execute on function public.${FN}() to anon`], 'лишний grant в SQL keep-alive');
});

test('keep-alive SQL: у таблицы RLS и ни одного права anon', () => {
  const table = (SQL.match(/create table if not exists (public\.\w+)/) ?? [])[1];
  assert.ok(table, 'нет таблицы сердцебиения');
  assert.ok(SQL.includes(`alter table ${table} enable row level security`), 'RLS на таблице не включён');
  assert.ok(
    SQL.includes(`revoke all on table ${table} from public, anon, authenticated`),
    'права по умолчанию у anon на таблицу не отозваны'
  );
  assert.doesNotMatch(SQL, /create policy/, 'политика открывает таблицу мимо функции');
});

// --- 4. Issue -----------------------------------------------------------------

const compiled = new Function(
  'github',
  'context',
  'core',
  'require',
  'process',
  `return (async () => {\n${SCRIPT}\n})();`
);

const MARKER = 'Supabase keep-alive:';
const VERDICT = 'SQL ещё не применён (HTTP 404 на rpc/keepalive_ping) — выполнить.';

function harness({ outcome = 'failure', verdict = VERDICT, openIssues = [], fail = {} } = {}) {
  const calls = [];
  const logs = { warning: [], info: [], failed: [] };
  const endpoint = (name, data) => (params) => {
    calls.push({ name, params });
    if (fail[name]) {
      const err = new Error('мок: отказ API');
      err.status = fail[name];
      return Promise.reject(err);
    }
    return Promise.resolve({ data });
  };
  const issues = {
    listForRepo: endpoint('issues.listForRepo', openIssues),
    create: endpoint('issues.create', { number: 7, html_url: 'https://github.com/o/r/issues/7' }),
    createComment: endpoint('issues.createComment', {}),
    update: endpoint('issues.update', {}),
  };
  const github = {
    rest: { issues },
    paginate: async (fn, params) => (await fn(params)).data,
  };
  const fakeFs = {
    readFileSync: (p) => {
      assert.match(String(p), /^\/runner-temp\/keepalive-verdict\.txt$/);
      if (verdict === null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return `${verdict}\n`;
    },
  };
  const req = (name) => {
    assert.equal(name, 'fs', `скрипт тянет модуль ${name} — в github-script v9 это может не работать`);
    return fakeFs;
  };
  const core = {
    warning: (m) => logs.warning.push(m),
    info: (m) => logs.info.push(m),
    setFailed: (m) => logs.failed.push(m),
  };
  const context = { repo: { owner: 'o', repo: 'r' }, serverUrl: 'https://github.com', runId: 99 };
  const proc = { env: { PING_OUTCOME: outcome, RUNNER_TEMP: '/runner-temp' } };
  return {
    calls,
    logs,
    run: () => compiled(github, context, core, req, proc),
    names: () => calls.map((c) => c.name).filter((n) => n !== 'issues.listForRepo'),
  };
}

const OPEN = { number: 5, title: `${MARKER} пинг не доходит до базы`, html_url: 'https://github.com/o/r/issues/5' };

test('issue: провал без открытого issue заводит новый с диагнозом и ссылкой на прогон', async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(h.names(), ['issues.create']);
  const { title, body } = h.calls.find((c) => c.name === 'issues.create').params;
  assert.ok(title.startsWith(MARKER));
  assert.ok(body.includes(VERDICT), 'в issue нет диагноза из шага пинга');
  assert.ok(body.includes('https://github.com/o/r/actions/runs/99'));
  assert.deepEqual(h.logs.failed, []);
});

test('issue: повторный провал дописывает в открытый, PR и чужие issue не путает', async () => {
  const h = harness({
    openIssues: [
      { number: 1, title: 'Сторож main: abc1234 приехал мимо ворот' },
      { number: 2, title: `${MARKER} как PR`, pull_request: {} },
      OPEN,
    ],
  });
  await h.run();
  assert.deepEqual(h.names(), ['issues.createComment']);
  const { issue_number, body } = h.calls.find((c) => c.name === 'issues.createComment').params;
  assert.equal(issue_number, 5);
  assert.ok(body.includes(VERDICT));
});

test('issue: не прочитал список — всё равно заводит (дубль лучше молчания)', async () => {
  const h = harness({ openIssues: [OPEN], fail: { 'issues.listForRepo': 403 } });
  await h.run();
  assert.deepEqual(h.names(), ['issues.create']);
  assert.equal(h.logs.warning.some((w) => w.includes('403')), true);
});

test('issue: не смог завести — красит прогон с названной причиной, не стеком', async () => {
  const h = harness({ fail: { 'issues.create': 403 } });
  await h.run();
  assert.equal(h.logs.failed.length, 1);
  assert.match(h.logs.failed[0], /403/);
  assert.ok(h.logs.failed[0].includes(VERDICT));
});

test('issue: шаг пинга упал без диагноза — в issue общий диагноз, не пустота', async () => {
  const h = harness({ verdict: null });
  await h.run();
  const { body } = h.calls.find((c) => c.name === 'issues.create').params;
  assert.match(body, /без диагноза/);
});

test('issue: зелёный пинг закрывает открытый issue', async () => {
  const h = harness({ outcome: 'success', openIssues: [OPEN] });
  await h.run();
  assert.deepEqual(h.names(), ['issues.createComment', 'issues.update']);
  const upd = h.calls.find((c) => c.name === 'issues.update').params;
  assert.equal(upd.issue_number, 5);
  assert.equal(upd.state, 'closed');
});

test('issue: зелёный пинг без открытого issue ничего не пишет', async () => {
  const h = harness({ outcome: 'success' });
  await h.run();
  assert.deepEqual(h.names(), []);
  assert.deepEqual(h.logs.failed, []);
});

test('issue: отказ при закрытии не красит зелёный пинг', async () => {
  const h = harness({ outcome: 'success', openIssues: [OPEN], fail: { 'issues.update': 403 } });
  await h.run();
  assert.deepEqual(h.logs.failed, []);
  assert.equal(h.logs.warning.some((w) => w.includes('Закрыть руками')), true);
});
