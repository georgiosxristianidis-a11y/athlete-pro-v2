/**
 * Гард счётчика агентов (карточка AGENT-6).
 *
 * Baseline до правки: `node scripts/agent-scorecard.mjs` падал на GraphQL
 * «1,000,000 possible nodes» при дефолтном `--limit 100`, потому что
 * `commits` тянет `authors`. Плюс любая ошибка `gh` врала про «нужен auth».
 *
 * Тест без сети: `run()` принимает инъекцию `gh`, разбор трейлеров — на
 * синтетических коммитах. Долю зелёных не хардкодим — она плывёт каждым мёржем.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PR_PAGE_SIZE,
  DEFAULT_PR_LIMIT,
  trailerNames,
  toolOf,
  classify,
  authAdviceFor,
  formatGhFailure,
  parseArgs,
  fetchMergedPrs,
  buildRows,
  run,
} from '../scripts/agent-scorecard.mjs';

const cursorBody = 'work\n\nCo-Authored-By: Cursor <noreply@cursor.com>\n';
const claudeBody = 'lead\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n';

test('parseArgs — дефолт без аргументов это DEFAULT_PR_LIMIT, не падение', () => {
  assert.equal(parseArgs([]).prLimit, DEFAULT_PR_LIMIT);
  assert.equal(parseArgs([]).asJson, false);
  assert.ok(
    DEFAULT_PR_LIMIT > PR_PAGE_SIZE,
    'дефолт шире одной безопасной страницы — поэтому коммиты отдельно'
  );
});

test('trailerNames / toolOf — имя, не адрес', () => {
  assert.deepEqual(trailerNames(cursorBody), ['Cursor']);
  assert.equal(toolOf('Cursor'), 'cursor');
  assert.equal(toolOf('Claude Opus 5'), 'claude');
  assert.equal(toolOf('Someone Else'), null);
});

test('classify — чистый исполнитель без LEAD поверх', () => {
  const pr = {
    commits: [{ messageBody: cursorBody }, { messageBody: cursorBody }],
  };
  assert.deepEqual(classify(pr), { tool: 'cursor', leadOnTop: 0 });
});

test('classify — LEAD поверх наряда Cursor не сваливает в mixed', () => {
  // Картина PR #255 / #256: исполнитель сдал, LEAD дописал бамп/sw.js.
  const pr = {
    commits: [
      { messageBody: cursorBody },
      { messageBody: cursorBody },
      { messageBody: claudeBody },
    ],
  };
  assert.deepEqual(classify(pr), { tool: 'cursor', leadOnTop: 1 });
});

test('classify — несколько коммитов LEAD считаются по одному', () => {
  const pr = {
    commits: [
      { messageBody: cursorBody },
      { messageBody: claudeBody },
      { messageBody: claudeBody },
    ],
  };
  assert.deepEqual(classify(pr), { tool: 'cursor', leadOnTop: 2 });
});

test('classify — unsigned и пустой PR', () => {
  assert.deepEqual(classify({ commits: [{ messageBody: 'no trailer\n' }] }), {
    tool: 'unsigned',
    leadOnTop: 0,
  });
  assert.deepEqual(classify({}), { tool: 'unsigned', leadOnTop: 0 });
});

test('classify — первый коммит задаёт исполнителя, даже если дальше другой', () => {
  const pr = {
    commits: [{ messageBody: claudeBody }, { messageBody: cursorBody }],
  };
  assert.deepEqual(classify(pr), { tool: 'claude', leadOnTop: 1 });
});

test('authAdviceFor — совет про auth только когда он в тему', () => {
  assert.equal(authAdviceFor('GraphQL: requesting up to 1,000,000 possible nodes'), null);
  assert.match(authAdviceFor('HTTP 401: Bad credentials') || '', /gh auth/);
  assert.match(authAdviceFor('To re-authenticate, run: gh auth login') || '', /gh auth/);
});

test('formatGhFailure — печатает текст ошибки, не подменяет его auth-советом', () => {
  const { lines } = formatGhFailure(['pr', 'list', '--limit', '100'], {
    stderr: 'GraphQL: requesting up to 1,000,000 possible nodes\n',
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /GraphQL: requesting up to 1,000,000/);
  assert.doesNotMatch(lines[0], /gh auth/);
});

test('fetchMergedPrs — список без commits, коммиты отдельно; ни одного limit>PAGE с commits', () => {
  const calls = [];
  const gh = (argv) => {
    calls.push(argv);
    if (argv[0] === 'pr' && argv[1] === 'list') {
      assert.ok(!argv.includes('commits'), 'list не должен просить commits');
      const limit = Number(argv[argv.indexOf('--limit') + 1]);
      assert.equal(limit, 100);
      return JSON.stringify([
        { number: 1, title: 'a', mergedAt: '2026-08-01T00:00:00Z' },
        { number: 2, title: 'b', mergedAt: '2026-08-02T00:00:00Z' },
      ]);
    }
    if (argv[0] === 'pr' && argv[1] === 'view') {
      const n = Number(argv[2]);
      return JSON.stringify({
        number: n,
        title: n === 1 ? 'a' : 'b',
        mergedAt: '2026-08-01T00:00:00Z',
        commits: [{ oid: `oid-${n}`, messageBody: cursorBody }],
      });
    }
    throw new Error(`unexpected gh ${argv.join(' ')}`);
  };

  const prs = fetchMergedPrs(100, gh);
  assert.equal(prs.length, 2);
  assert.equal(prs[0].commits.length, 1);
  assert.ok(calls.some((a) => a[0] === 'pr' && a[1] === 'list'));
  assert.equal(calls.filter((a) => a[0] === 'pr' && a[1] === 'view').length, 2);
});

test('run — дефолтный вызов с инъекцией gh не падает и отдаёт LEAD поверх', () => {
  const lines = [];
  const gh = (argv) => {
    if (argv[0] === 'pr' && argv[1] === 'list') {
      return JSON.stringify([{ number: 255, title: 'launch-5', mergedAt: '2026-08-26T00:00:00Z' }]);
    }
    if (argv[0] === 'pr' && argv[1] === 'view') {
      return JSON.stringify({
        number: 255,
        title: 'launch-5',
        mergedAt: '2026-08-26T00:00:00Z',
        commits: [
          { oid: 'a', messageBody: cursorBody },
          { oid: 'b', messageBody: claudeBody },
        ],
      });
    }
    if (argv[0] === 'api') {
      return JSON.stringify({ workflow_runs: [] });
    }
    throw new Error(`unexpected gh ${argv.join(' ')}`);
  };

  let exitCode = null;
  const result = run({
    argv: [],
    gh,
    exit: (code) => {
      exitCode = code;
    },
    stdout: { log: (s) => lines.push(String(s)) },
  });

  assert.equal(exitCode, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].tool, 'cursor');
  assert.equal(result.rows[0].leadOnTop, 1);
  assert.ok(lines.some((l) => /LEAD поверх/.test(l)));
  assert.ok(lines.some((l) => /#255 \[cursor\] \+1/.test(l)));
});

test('buildRows — join по номеру PR и shaToPr запас не ломает leadOnTop', () => {
  const prs = [
    {
      number: 10,
      title: 'x',
      mergedAt: '2026-08-01T00:00:00Z',
      commits: [
        { oid: 'sha-worker', messageBody: cursorBody },
        { oid: 'sha-lead', messageBody: claudeBody },
      ],
    },
  ];
  const runs = [
    {
      name: 'CI',
      head_sha: 'sha-worker',
      pull_requests: [],
      created_at: '2026-08-01T01:00:00Z',
      conclusion: 'success',
      run_attempt: 1,
    },
  ];
  const { rows } = buildRows(prs, runs);
  assert.equal(rows[0].tool, 'cursor');
  assert.equal(rows[0].leadOnTop, 1);
  assert.equal(rows[0].greenFirst, true);
});
