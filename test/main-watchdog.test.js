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
 * Входов три, и контракт у каждого свой — не по строгости, а по направлению.
 *
 *   `workflow_run` — сторож единственный зритель, упавший job уносит сигнал в
 *      тишину. «Не падать» абсолютно, любой отказ API деградирует в жалобу.
 *   `workflow_dispatch` — без прогона CI проверять нечего, падение и есть
 *      честный исход; требование в том, ЧЕМ падать. Только `core.setFailed` с
 *      названной причиной: необработанная ошибка даёт стек вместо «не хватает
 *      `actions: read`» — тот же способ умирания, что и в 1.27.23, просто на
 *      пути, где смерть заметят.
 *   `schedule` (WATCH-2) — закрывает слепое пятно: коммит, на котором CI не
 *      запускался ВООБЩЕ, события не создаёт, и `workflow_run` его не видит по
 *      построению. Контракт как у автоматического пути, «не падать», но с одним
 *      исключением: не прочитан HEAD `main` — сторож молчит. Это не поблажка, а
 *      арифметика. Без SHA нет ключа дедупликации, а прогон часовой: жалоба без
 *      ключа означала бы новый issue КАЖДЫЙ час. Молчание с записью в лог здесь
 *      дешевле спама, который научат игнорировать.
 *
 * У расписания есть льготное окно: на свежем коммите CI мог ещё не завестись, и
 * жалоба в этот момент — обвинение пустого места. Окно обязано отсекать ДО
 * запроса прогонов, иначе «сторож не спешит» превращается в «сторож гадает».
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
/** Коммит старше льготного окна — дефолт для расписания. */
const OLD_COMMIT = new Date(Date.now() - 3 * 3600_000).toISOString();
/** Коммит внутри льготного окна: CI на нём ещё может завестись. */
const FRESH_COMMIT = new Date(Date.now() - 5 * 60_000).toISOString();

const CI_RUN = { path: '.github/workflows/ci.yml', conclusion: 'success' };
/** Прогон другого воркфлоу на том же SHA — за CI считаться не должен. */
const WATCHDOG_RUN = { path: '.github/workflows/main-watchdog.yml', conclusion: 'success' };

function makeGithub({
  fail = {},
  prs = [],
  openIssues = [],
  run = runPayload(),
  runsOnSha = [CI_RUN],
  headDate = OLD_COMMIT,
} = {}) {
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
      // Отдаёт прогоны ВСЕХ воркфлоу на SHA — отбор «какие из них CI» делает сам
      // скрипт, и именно этот отбор проверяется тестом про чужие прогоны.
      listWorkflowRunsForRepo: endpoint('actions.listWorkflowRunsForRepo', () => ({
        data: { total_count: runsOnSha.length, workflow_runs: runsOnSha },
      })),
    },
    repos: {
      listPullRequestsAssociatedWithCommit: endpoint(
        'repos.listPullRequestsAssociatedWithCommit',
        () => ({ data: prs })
      ),
      // Один и тот же мок обслуживает два вызова: HEAD main на расписании (нужны
      // sha и дата) и чтение коммита для тела issue (нужны message и author).
      getCommit: endpoint('repos.getCommit', () => ({
        data: {
          sha: SHA,
          html_url: `https://github.com/o/r/commit/${SHA}`,
          commit: {
            message: 'fix: что-то\n\nтело',
            author: { name: 'Gio' },
            committer: { date: headDate },
          },
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
async function runWatchdog({ dispatch = null, scheduled = false, ...opts } = {}) {
  const github = makeGithub(opts);
  const core = makeCore();
  // Вход скрипт различает по context.eventName, а не по форме payload: на
  // расписании payload пуст, и «пусто» само по себе ничего не значит.
  const eventName = scheduled ? 'schedule' : dispatch ? 'workflow_dispatch' : 'workflow_run';
  const payload = scheduled
    ? {}
    : dispatch
      ? { inputs: dispatch }
      : { workflow_run: opts.run ?? runPayload() };
  const context = {
    repo: { owner: 'o', repo: 'r' },
    eventName,
    payload,
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
 * Не зеркало автоматического пути, а его противоположность — см. шапку файла.
 * Там отказ обязан деградировать в жалобу, здесь обязан остановить работу:
 * прогон CI не прочитан, проверять нечего, и любой вывод был бы выдуман.
 * Поэтому падение — правильный исход, но ровно одно: `core.setFailed` с
 * причиной и лечением. Выброс запрещён наравне с молчанием: он даёт стек
 * вместо «не хватает `actions: read`», а именно этой строки не хватало,
 * чтобы заметить смерть сторожа в 1.27.23.
 */
test('ручной прогон: отказ getWorkflowRun не проходит молча', async () => {
  const r = await runWatchdog({
    dispatch: { run_id: '777' },
    fail: { 'actions.getWorkflowRun': REFUSAL },
  });
  assert.equal(
    r.threw,
    null,
    `отказ getWorkflowRun уронил сторожа выбросом: ${r.threw?.message}. ` +
      `Падать здесь правильно, но через core.setFailed — стек трассы не называет ни причину, ни лечение.`
  );
  assert.equal(
    r.log.failed.length,
    1,
    'отказ getWorkflowRun не оставил следа: job зелёный, а сторож не проверил ничего'
  );
  assert.match(r.log.failed[0], /actions: read/, 'падение не называет лечение');
  assert.equal(r.called('issues.create'), false, 'сторож завёл issue, не прочитав прогон');
});

// ─── Расписание: слепое пятно WATCH-2 ────────────────────────────────────────

/** База пути расписания: старый коммит, прогонов CI на нём нет. */
const BLIND_SPOT = { scheduled: true, runsOnSha: [], prs: MERGED_PR };

test('расписание: на коммите нет НИ ОДНОГО прогона CI — заводится issue', async () => {
  const r = await runWatchdog(BLIND_SPOT);
  assert.equal(r.threw, null);
  assert.ok(r.created, 'коммит без единого прогона CI прошёл незамеченным — ровно баг WATCH-2');
  assert.match(r.created.params.title, /приехал мимо ворот/);
  assert.match(r.created.params.body, /нет НИ ОДНОГО прогона CI/);
  assert.match(
    r.created.params.body,
    /check-runs/,
    'issue не говорит, чем проверить руками'
  );
});

test('расписание: прогон CI на месте — issue не заводится', async () => {
  const r = await runWatchdog({ ...BLIND_SPOT, runsOnSha: [CI_RUN] });
  assert.equal(r.threw, null);
  assert.equal(r.called('issues.create'), false, 'сторож обвинил коммит с живым прогоном CI');
  assert.deepEqual(r.log.failed, []);
});

/**
 * Отбор идёт по пути файла, а не по имени воркфлоу: `name` у прогона
 * подменяется на `run-name`, если его когда-нибудь добавят в ci.yml. Без этого
 * теста подмена превратила бы сторожа в генератор ложных issue на каждый коммит.
 */
test('расписание: прогон чужого воркфлоу за CI не считается', async () => {
  const r = await runWatchdog({ ...BLIND_SPOT, runsOnSha: [WATCHDOG_RUN] });
  assert.ok(r.created, 'прогон другого воркфлоу зачтён за CI — отбор по пути не работает');
  assert.match(r.created.params.body, /нет НИ ОДНОГО прогона CI/);
});

test('расписание: свежий коммит внутри льготы не обвиняется', async () => {
  const r = await runWatchdog({ ...BLIND_SPOT, headDate: FRESH_COMMIT });
  assert.equal(r.threw, null);
  assert.equal(
    r.called('issues.create'),
    false,
    'обвинён коммит, на котором CI ещё мог не завестись — сторож гадает, а не ждёт'
  );
  assert.equal(
    r.called('actions.listWorkflowRunsForRepo'),
    false,
    'льгота обязана отсекать ДО запроса прогонов, иначе она ничего не экономит и не значит'
  );
  assert.deepEqual(r.log.failed, []);
});

test('расписание: отказ listWorkflowRunsForRepo — сторож слепнет, но не молчит', async () => {
  const r = await runWatchdog({
    ...BLIND_SPOT,
    fail: { 'actions.listWorkflowRunsForRepo': REFUSAL },
  });
  assert.equal(r.threw, null, 'отказ уронил сторожа — тот же способ, что и в 1.27.23');
  assert.ok(r.created, 'ослепший сторож промолчал');
  assert.match(r.created.params.body, /не смог проверить, запускался ли CI/);
  assert.match(r.created.params.body, /actions: read/, 'issue не называет лечение');
  assert.deepEqual(r.log.failed, [], 'слепота — не повод ронять job');
});

/**
 * Единственная осознанная тишина сторожа, и она вынужденная: без SHA нет ключа
 * дедупликации, а прогон часовой — жалоба без ключа означала бы новый issue
 * каждый час. Тишина обязана быть хотя бы записана в лог.
 */
test('расписание: не прочитан HEAD main — молчит, но не падает и не гадает', async () => {
  const r = await runWatchdog({ ...BLIND_SPOT, fail: { 'repos.getCommit': REFUSAL } });
  assert.equal(r.threw, null, 'отказ чтения HEAD уронил сторожа');
  assert.equal(
    r.called('issues.create'),
    false,
    'issue без SHA ломает дедуп — часовой прогон завёл бы его каждый час'
  );
  assert.ok(
    r.log.warning.some((w) => /HEAD main/.test(w)),
    'сторож замолчал, не оставив в логе ни слова'
  );
  assert.deepEqual(r.log.failed, []);
});

/**
 * Тот же разведчик, что и на автоматическом пути, но по пути расписания:
 * список эндпоинтов снимается со скрипта, поэтому новый вызов API попадёт под
 * проверку сам. Требование здесь одно — не падать. Требовать «issue всё равно»
 * нельзя: отказ `repos.getCommit` отменяет его намеренно, см. тест выше.
 */
test('расписание: ни один отказ API не роняет сторожа', async () => {
  const scout = await runWatchdog(BLIND_SPOT);
  assert.equal(scout.threw, null, 'разведочный прогон упал — моки не соответствуют скрипту');

  const touched = [...new Set(scout.calls.map((c) => c.name))];
  assert.ok(
    touched.includes('actions.listWorkflowRunsForRepo'),
    'разведчик не задел запрос прогонов — путь расписания не тот, что проверяется'
  );

  for (const name of touched) {
    const r = await runWatchdog({ ...BLIND_SPOT, fail: { [name]: REFUSAL } });
    assert.equal(
      r.threw,
      null,
      `отказ \`${name}\` уронил сторожа: ${r.threw?.message}. ` +
        `Необработанная ошибка убивает job вместе со ВСЕМИ сигналами — обернуть в try/catch.`
    );
  }
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
    call: 'listWorkflowRunsForRepo',
    scope: 'actions',
    level: 'read',
    why: 'вход по расписанию считает прогоны CI на HEAD main (WATCH-2)',
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

test('сторож просыпается и без события от CI', () => {
  assert.match(
    WORKFLOW,
    /^\s*schedule:/m,
    'нет входа по расписанию — коммит, на котором CI не запускался вообще, снова невидим (WATCH-2)'
  );
  assert.match(WORKFLOW, /cron:\s*'[^']+'/, '`schedule:` без `cron:` не сработает ни разу');
});

/**
 * Триггер `workflow_run` сцеплен с CI по ИМЕНИ, а отбор прогонов на расписании —
 * по ПУТИ файла. Обе связи внешние по отношению к этому воркфлоу: переименуют
 * `name:` в ci.yml или сам файл — сторож ослепнет молча, ровно как в 1.27.23.
 * Здесь они и сверяются с реальностью, потому что больше негде.
 */
test('имя CI в триггере совпадает с именем самого ci.yml', () => {
  const listens = WORKFLOW.match(/workflows:\s*\['([^']+)'\]/);
  assert.ok(listens, 'сторож не подписан на прогоны по имени');

  const ci = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  const name = ci.match(/^name:\s*(.+)$/m);
  assert.ok(name, 'в ci.yml нет верхнеуровневого `name:`');
  assert.equal(
    name[1].trim(),
    listens[1],
    `сторож ждёт события от воркфлоу «${listens[1]}», а ci.yml зовётся «${name?.[1].trim()}» — ` +
      `событие не придёт никогда, и сторож умрёт тихо`
  );
});

test('путь ci.yml в отборе прогонов указывает на существующий файл', () => {
  const m = SCRIPT.match(/const CI_PATH = '([^']+)'/);
  assert.ok(m, 'в скрипте нет CI_PATH — чем тогда отбираются прогоны CI?');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- путь добыт из самого скрипта, это и есть смысл сверки
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, m[1])),
    `CI_PATH указывает на \`${m[1]}\`, которого нет — отбор всегда даст ноль прогонов ` +
      `и сторож начнёт обвинять каждый коммит`
  );
});
