/**
 * Гейт для сторожа main (`.github/workflows/main-watchdog.yml`).
 *
 * Сторож был мёртв с момента установки (1.27.23) и никто этого не заметил.
 * Причина — не опечатка в логике, а недостающее право: `permissions:` не
 * содержал `pull-requests: read`, запрос связанных PR отдавал 403, а
 * необработанная ошибка убивала job целиком. Вместе с job умирали ОБА сигнала,
 * включая тот, который до API вообще не доходит (красный CI). То есть сторож,
 * поставленный вместо недоступной по плану branch protection, не показывал
 * ничего — и выглядел при этом как настроенная защита.
 *
 * Почему обычный гейт этого не ловил: воркфлоу — YAML, его никто не исполняет
 * до прода, а `workflow_run` не воспроизвести иначе, как слив что-то в main.
 * Единственная обратная связь была ручной, и её никто не запрашивал.
 *
 * Здесь проверяются два разных класса поломки:
 *
 *   1. ПОВЕДЕНИЕ. Скрипт достаётся из блока `script: |` и исполняется через
 *      `new Function` с моками Octokit. Инвариант на автоматическом пути
 *      (`workflow_run`) жёсткий: НИ ОДИН отказ API не роняет скрипт и не
 *      отменяет issue. Список вызовов не захардкожен, а снимается с самого
 *      скрипта прогоном-разведчиком, поэтому новый вызов API попадает под
 *      проверку сам, без правки этого файла. Отказ обязан деградировать в
 *      жалобу, а не в тишину: сторож, потерявший зрение, всё равно заводит
 *      issue — просто с другим заголовком.
 *
 *   2. ПРАВА. Статическая сверка: есть в скрипте вызов — обязано быть право в
 *      `permissions:`. Именно этой проверки не хватало, чтобы баг 1.27.23 упал
 *      на гейте, а не в проде: поведенческие моки не знают про GitHub-права,
 *      а `permissions:` не знает про код. Соединяет их только этот блок.
 *
 * Ручной путь (`workflow_dispatch`) держится на более слабом контракте, и это
 * не поблажка, а разная цена отказа. На `workflow_run` сторож — единственный
 * зритель: упавший job уносит сигнал в тишину, поэтому там требование «не
 * падать» абсолютно. Ручной прогон смотрит тот, кто его запустил, поэтому там
 * требование другое и достаточное: отказ обязан быть ВИДИМЫМ — `core.setFailed`
 * или выброс, но не молчание с зелёным job.
 *
 * YAML разбирается по отступам, а не через js-yaml: js-yaml в проекте только
 * транзитивный (stylelint → cosmiconfig), и тянуть его в прямые зависимости
 * ради одного блок-скаляра дороже, чем двадцать строк разбора.
 *
 * Красный baseline воспроизводится без ребейза назад — путь к воркфлоу
 * переопределяется переменной окружения:
 *
 *   git show d9c248b:.github/workflows/main-watchdog.yml > /tmp/old.yml
 *   WATCHDOG_WORKFLOW=/tmp/old.yml node --test test/main-watchdog.test.js
 *
 * На версии 1.27.23 обязаны краснеть оба пункта: скрипт падает на 403/404 от
 * `/pulls`, и в `permissions:` нет `pull-requests: read` при живом вызове
 * `listPullRequestsAssociatedWithCommit`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH =
  process.env.WATCHDOG_WORKFLOW || path.join(REPO_ROOT, '.github/workflows/main-watchdog.yml');
// eslint-disable-next-line security/detect-non-literal-fs-filename -- путь из env, это и есть смысл baseline
const WORKFLOW = fs.readFileSync(WORKFLOW_PATH, 'utf8');

const indentOf = (line) => line.match(/^ */)[0].length;

/**
 * Тело блок-скаляра `script: |`. YAML запрещает табы в отступах, поэтому
 * «глубже ключа» однозначно определяется пробелами.
 */
function extractScript(yaml) {
  const lines = yaml.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*script:\s*\|[-+]?\s*$/.test(l));
  assert.notEqual(at, -1, 'в воркфлоу нет блока `script: |` — шаг github-script переписан?');

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
  while (body.length && body[body.length - 1] === '') body.pop();
  assert.ok(body.length > 0, 'блок `script: |` пуст');

  const base = Math.min(...body.filter((l) => l !== '').map(indentOf));
  return body.map((l) => l.slice(base)).join('\n');
}

/** Верхнеуровневый `permissions:` — тот, что действует на все jobs. */
function extractPermissions(yaml) {
  const lines = yaml.split(/\r?\n/);
  const at = lines.findIndex((l) => /^permissions:\s*$/.test(l));
  assert.notEqual(at, -1, 'в воркфлоу нет верхнеуровневого блока `permissions:`');

  const perms = {};
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (indentOf(line) === 0) break; // вернулись на нулевой уровень — блок кончился
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s+([\w-]+):\s*(\S+)\s*$/);
    if (m) perms[m[1]] = m[2];
  }
  return perms;
}

const SCRIPT = extractScript(WORKFLOW);
const PERMISSIONS = extractPermissions(WORKFLOW);

/**
 * actions/github-script оборачивает тело в AsyncFunction с этими аргументами.
 * Здесь то же самое: `new Function` синхронен, поэтому тело кладётся в
 * async-IIFE — это сохраняет и `await`, и ранний `return` из скрипта.
 */
const compiled = new Function(
  'github',
  'context',
  'core',
  `return (async () => {\n${SCRIPT}\n})();`
);

const SHA = 'abc1234def5678901234567890abcdef12345678';
const SHORT = SHA.slice(0, 7);

const runPayload = (over = {}) => ({
  head_sha: SHA,
  head_branch: 'main',
  conclusion: 'success',
  html_url: 'https://github.com/o/r/actions/runs/1',
  ...over,
});

/**
 * Мок Octokit. Каждый эндпоинт умеет отказать — так воспроизводится ровно та
 * ситуация, которая убила сторожа 1.27.23 (403 без права).
 */
function makeGithub({ fail = {}, prs = [], openIssues = [], run = runPayload() } = {}) {
  const calls = [];

  const endpoint = (name, handler) => (params) => {
    calls.push({ name, params });
    const f = fail[name];
    if (f) {
      const err = new Error(f.message ?? 'мок: отказ API');
      err.status = f.status;
      return Promise.reject(err);
    }
    return Promise.resolve(handler());
  };

  const issues = {
    listForRepo: endpoint('issues.listForRepo', () => ({ data: openIssues })),
    create: endpoint('issues.create', () => ({
      data: { html_url: 'https://github.com/o/r/issues/42', number: 42 },
    })),
  };

  const rest = {
    actions: {
      getWorkflowRun: endpoint('actions.getWorkflowRun', () => ({ data: run })),
    },
    repos: {
      listPullRequestsAssociatedWithCommit: endpoint(
        'repos.listPullRequestsAssociatedWithCommit',
        () => ({ data: prs })
      ),
      getCommit: endpoint('repos.getCommit', () => ({
        data: {
          html_url: `https://github.com/o/r/commit/${SHA}`,
          commit: { message: 'fix: что-то\n\nтело', author: { name: 'Gio' } },
        },
      })),
    },
    issues,
    // Прошлая реализация дедупа (1.27.23). Мок держит её живой намеренно:
    // иначе baseline падал бы на отсутствующем моке, а не на своём настоящем
    // баге, и «красный baseline» ничего бы не доказывал.
    search: {
      issuesAndPullRequests: endpoint('search.issuesAndPullRequests', () => ({
        data: { total_count: openIssues.length, items: openIssues },
      })),
    },
  };

  return {
    rest,
    calls,
    paginate: async (fn, params) => (await fn(params)).data,
  };
}

function makeCore() {
  const log = { info: [], warning: [], error: [], failed: [] };
  return {
    log,
    info: (m) => log.info.push(String(m)),
    warning: (m) => log.warning.push(String(m)),
    error: (m) => log.error.push(String(m)),
    notice: (m) => log.info.push(String(m)),
    debug: () => {},
    setFailed: (m) => log.failed.push(String(m)),
  };
}

/** Один прогон сторожа. Никогда не пробрасывает — падение возвращается как факт. */
async function runWatchdog({ dispatch = null, ...opts } = {}) {
  const github = makeGithub(opts);
  const core = makeCore();
  const context = {
    repo: { owner: 'o', repo: 'r' },
    payload: dispatch ? { inputs: dispatch } : { workflow_run: opts.run ?? runPayload() },
  };

  let threw = null;
  try {
    await compiled(github, context, core);
  } catch (err) {
    threw = err;
  }

  const called = (name) => github.calls.some((c) => c.name === name);
  const created = github.calls.find((c) => c.name === 'issues.create');
  return { threw, core, calls: github.calls, called, created, log: core.log };
}

const MERGED_PR = [{ number: 157, merged_at: '2026-08-06T00:00:00Z' }];
const RED_CI = { run: runPayload({ conclusion: 'failure' }), prs: MERGED_PR };
const REFUSAL = { status: 403, message: 'Resource not accessible by integration' };

// ─── 1. Поведение: отказ API не убивает сторожа ──────────────────────────────

test('чистый коммит: CI зелёный и PR на месте — issue не заводится', async () => {
  const r = await runWatchdog({ prs: MERGED_PR });
  assert.equal(r.threw, null);
  assert.equal(r.called('issues.create'), false);
  assert.deepEqual(r.log.failed, []);
});

test('красный CI: заводится issue «приехал мимо ворот»', async () => {
  const r = await runWatchdog(RED_CI);
  assert.equal(r.threw, null);
  assert.ok(r.created, 'сторож не завёл issue на красном CI');
  assert.match(r.created.params.title, /приехал мимо ворот/);
  assert.match(r.created.params.body, /failure/);
});

test('нет связанного PR: заводится issue про прямой пуш', async () => {
  const r = await runWatchdog({ prs: [] });
  assert.equal(r.threw, null);
  assert.ok(r.created, 'сторож не завёл issue на коммите без PR');
  assert.match(r.created.params.body, /нет связанного смёрженного PR/);
});

/**
 * Ядро гейта. Список вызовов снимается с самого скрипта, а не хардкодится:
 * следующий, кто добавит вызов API и забудет его обернуть, получит красный
 * тест, ничего в этом файле не правя. Ровно та дыра, через которую прошла
 * 1.27.23.
 *
 * Разведчик идёт по автоматическому пути (payload `workflow_run`) — именно там
 * упавший job уносит сигнал в тишину, и именно там требование абсолютно.
 */
test('автоматический путь: ни один отказ API не роняет сторожа', async () => {
  const scout = await runWatchdog(RED_CI);
  assert.equal(scout.threw, null, 'разведочный прогон упал — моки не соответствуют скрипту');

  const touched = [...new Set(scout.calls.map((c) => c.name))];
  assert.ok(touched.length >= 3, `скрипт задел всего ${touched.length} эндпоинт(ов) — моки мимо`);

  for (const name of touched) {
    const r = await runWatchdog({ ...RED_CI, fail: { [name]: REFUSAL } });
    assert.equal(
      r.threw,
      null,
      `отказ \`${name}\` уронил сторожа: ${r.threw?.message}. ` +
        `Необработанная ошибка убивает job вместе со ВСЕМИ сигналами — обернуть в try/catch.`
    );
  }
});

test('отказ API отменяет issue только в одном месте — на самом issues.create', async () => {
  const scout = await runWatchdog(RED_CI);
  const touched = [...new Set(scout.calls.map((c) => c.name))].filter(
    (n) => n !== 'issues.create'
  );

  for (const name of touched) {
    const r = await runWatchdog({ ...RED_CI, fail: { [name]: REFUSAL } });
    assert.ok(r.created, `отказ \`${name}\` отменил issue — сигнал потерян молча`);
  }
});

for (const status of [403, 404]) {
  test(`${status} на listPullRequestsAssociatedWithCommit: сторож слепнет, но не молчит`, async () => {
    const r = await runWatchdog({
      prs: MERGED_PR,
      fail: {
        'repos.listPullRequestsAssociatedWithCommit': { status, message: `мок: ${status}` },
      },
    });

    assert.equal(r.threw, null, 'отказ запроса связанных PR уронил сторожа (баг 1.27.23)');
    assert.ok(r.created, 'ослепший сторож не завёл issue');
    assert.match(
      r.created.params.title,
      /не удалось проверить происхождение/,
      'ослепший сторож обвиняет коммит вместо того, чтобы признать слепоту'
    );
    assert.match(r.created.params.body, /Сторож не смог проверить происхождение/);
    assert.match(r.created.params.body, /pull-requests: read/, 'issue не называет лечение');
    assert.deepEqual(r.log.failed, [], 'слепота — не повод ронять job');
  });
}

test('отказ issues.listForRepo (дедуп): issue заводится всё равно — дубль лучше молчания', async () => {
  const r = await runWatchdog({ ...RED_CI, fail: { 'issues.listForRepo': REFUSAL } });
  assert.equal(r.threw, null);
  assert.ok(r.created, 'упавший дедуп съел issue целиком');
  assert.ok(
    r.log.warning.some((w) => /дубл/i.test(w)),
    'отказ дедупа прошёл без единого слова в лог'
  );
});

test('отказ repos.getCommit: issue заводится со ссылкой, собранной из SHA', async () => {
  const r = await runWatchdog({ ...RED_CI, fail: { 'repos.getCommit': REFUSAL } });
  assert.equal(r.threw, null);
  assert.ok(r.created, 'нечитаемый коммит отменил issue');
  assert.match(
    r.created.params.body,
    new RegExp(`/commit/${SHA}`),
    'в issue нет ссылки на коммит, а её можно собрать из SHA без всякого API'
  );
});

test('дубль не плодится: issue на тот же коммит уже открыт', async () => {
  const r = await runWatchdog({
    ...RED_CI,
    openIssues: [
      { title: `Сторож main: ${SHORT} приехал мимо ворот`, html_url: 'https://x/1' },
    ],
  });
  assert.equal(r.threw, null);
  assert.equal(r.called('issues.create'), false, 'сторож завёл второй issue на тот же коммит');
});

test('PR в списке дедупа не считается за issue', async () => {
  const r = await runWatchdog({
    ...RED_CI,
    openIssues: [
      {
        title: `Сторож main: ${SHORT} приехал мимо ворот`,
        html_url: 'https://x/1',
        pull_request: { url: 'https://x/pull/1' },
      },
    ],
  });
  assert.equal(r.threw, null);
  assert.ok(r.created, 'PR с похожим заголовком заглушил сторожа');
});

test('единственное разрешённое падение — не удалось завести issue', async () => {
  const r = await runWatchdog({ ...RED_CI, fail: { 'issues.create': REFUSAL } });
  assert.equal(r.threw, null, 'падать надо через core.setFailed, а не выбросом');
  assert.equal(r.log.failed.length, 1, 'сигналу больше некуда деться — job обязан покраснеть');
  assert.match(r.log.failed[0], /приехал мимо ворот|не удалось проверить/);
});

// ─── Ручной прогон: единственный способ проверить сторожа, не пушив в main ───

test('ручной прогон: run_id разрешается в прогон CI', async () => {
  const r = await runWatchdog({
    dispatch: { run_id: '777' },
    run: runPayload({ conclusion: 'failure' }),
    prs: MERGED_PR,
  });
  assert.equal(r.threw, null);
  assert.ok(r.called('actions.getWorkflowRun'), 'ручной запуск не достал прогон по run_id');
  assert.equal(r.calls.find((c) => c.name === 'actions.getWorkflowRun').params.run_id, 777);
  assert.ok(r.created);
});

test('ручной прогон с мусорным run_id: setFailed, а не выброс', async () => {
  for (const run_id of ['', 'абв', '0', '-3']) {
    const r = await runWatchdog({ dispatch: { run_id } });
    assert.equal(r.threw, null, `run_id=${JSON.stringify(run_id)} уронил скрипт выбросом`);
    assert.equal(r.log.failed.length, 1, `run_id=${JSON.stringify(run_id)} прошёл молча`);
    assert.equal(r.called('issues.create'), false);
  }
});

/**
 * Слабее автоматического пути намеренно — см. шапку файла. Здесь достаточно,
 * чтобы отказ был виден: `setFailed` или выброс. Сейчас `getWorkflowRun` в
 * воркфлоу не обёрнут, и тест фиксирует поведение как есть, а не как хотелось
 * бы: ужесточать контракт — правка воркфлоу, а гейт её не подменяет.
 * Чего допускать нельзя ни в каком виде — зелёного job на непрочитанном
 * прогоне и issue, заведённого вслепую.
 */
test('ручной прогон: отказ getWorkflowRun не проходит молча', async () => {
  const r = await runWatchdog({
    dispatch: { run_id: '777' },
    fail: { 'actions.getWorkflowRun': REFUSAL },
  });
  assert.ok(
    r.threw !== null || r.log.failed.length > 0,
    'отказ getWorkflowRun не оставил следа: job зелёный, а сторож не проверил ничего'
  );
  assert.equal(r.called('issues.create'), false, 'сторож завёл issue, не прочитав прогон');
});

// ─── 2. Права: вызов в скрипте обязан быть обеспечен permissions ─────────────

/**
 * Связь «вызов API → право» не проверяет ни один мок: моки не знают про
 * GITHUB_TOKEN. Пока её не сверяет гейт, отсутствующее право видно только по
 * 403 в проде — то есть по мёртвому сторожу, о смерти которого некому сказать.
 */
const REQUIRED = [
  {
    call: 'listPullRequestsAssociatedWithCommit',
    scope: 'pull-requests',
    level: 'read',
    why: 'без него запрос связанных PR отдаёт 403 — ровно баг 1.27.23',
  },
  {
    call: 'getWorkflowRun',
    scope: 'actions',
    level: 'read',
    why: 'ручной прогон достаёт CI по run_id',
  },
  {
    call: 'issues.create',
    scope: 'issues',
    level: 'write',
    why: 'сторож существует ради того, чтобы завести issue',
  },
  {
    call: 'getCommit',
    scope: 'contents',
    level: 'read',
    why: 'сторож читает коммит, чтобы положить в issue сообщение и автора',
  },
];

const SUFFICIENT = { read: ['read', 'write'], write: ['write'] };

test('каждому вызову API в скрипте соответствует право в permissions', () => {
  for (const { call, scope, level, why } of REQUIRED) {
    if (!SCRIPT.includes(call)) continue;
    const granted = PERMISSIONS[scope];
    assert.ok(
      granted && SUFFICIENT[level].includes(granted),
      `скрипт вызывает \`${call}\`, но в permissions нет \`${scope}: ${level}\` ` +
        `(сейчас: ${granted ?? 'не выдано'}). ${why}.`
    );
  }
});

test('permissions не шире необходимого: write только там, где сторож пишет', () => {
  const writes = Object.entries(PERMISSIONS).filter(([, v]) => v === 'write');
  assert.deepEqual(
    writes.map(([k]) => k).sort(),
    ['issues'],
    'сторож только читает и заводит issue — остальное расширяет радиус поражения токена'
  );
});

test('сторож слушает завершение CI на main', () => {
  assert.match(WORKFLOW, /workflow_run:/, 'сторож не подписан на прогоны CI');
  assert.match(WORKFLOW, /workflows:\s*\['CI'\]/, 'сторож слушает не CI');
  assert.match(WORKFLOW, /branches:\s*\[main\]/, 'сторож слушает не main');
});
