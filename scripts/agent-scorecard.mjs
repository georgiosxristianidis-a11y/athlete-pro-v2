#!/usr/bin/env node
/**
 * Agent scorecard (cards AGENT-1, AGENT-6).
 *
 * Question: which tool produced work that passed the gate on the first try,
 * and how much LEAD had to layer on top of a finished worker PR.
 *
 * The naive answer — label every commit and count in `git log` — does not work
 * here. The repo merges through GitHub's rebase-merge, so the SHA that lands in
 * main is not the SHA CI ran on, and `--delete-branch` removes the branch that
 * held the original. The gate lives on the pull request, not on the commit, so
 * the join key is the PR number and the source is the Actions API.
 *
 * The commit trailer is still what says *who*: `Co-Authored-By: <name>` is
 * already written by Claude on every commit and survives rebase-merge intact.
 * Cursor gets its own line — see `.cursor/rules/000-core.mdc`.
 *
 * Attribution inside a PR (AGENT-6): the first commit with a known trailer is
 * the executor. Later commits signed by a different tool are the acceptance
 * cost (LEAD overlay — version bump, `sw.js` rebuild), not a dump into `mixed`.
 *
 * GraphQL node cap (AGENT-6): `gh pr list --json …,commits` at `--limit` 60+
 * blows the 500k ceiling because `commits` pulls `authors`. List metadata
 * without commits (cheap), then load commits per PR — each view is tiny.
 *
 *   node scripts/agent-scorecard.mjs            # report
 *   node scripts/agent-scorecard.mjs --json     # machine-readable
 *   node scripts/agent-scorecard.mjs --limit 50 # fewer PRs, fewer API calls
 *
 * Two things the number does NOT mean, and both matter more than the number:
 *
 * 1. A red first run is very often base drift, a collided version bump or a
 *    stale `drift` job — not bad code. Read the failing job before reading the
 *    percentage.
 * 2. Actions history is retained, not eternal. The report prints the window it
 *    actually saw; a short window means a small sample, not a good score.
 *
 * Nothing enforces the trailer — there is no `commit-msg` hook and no CI check.
 * That is why `unsigned` is reported as its own row instead of being folded into
 * a tool: silent drift would bias every ratio here. A growing `unsigned` row is
 * the signal that the labels, not the tools, need attention (card AGENT-4).
 *
 * Read-only. Talks to GitHub, touches nothing.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Trailer name -> tool. Matched on the NAME, not the address: the address is
 * cosmetic and changes with whatever the vendor decides, the name is what the
 * rules tell each agent to write.
 */
export const TOOLS = [
  { tool: 'claude', match: /^claude\b/i },
  { tool: 'cursor', match: /^cursor\b/i },
];

/** Soft cap reminder: a single list+commits query must stay at or below this. */
export const PR_PAGE_SIZE = 40;
export const DEFAULT_PR_LIMIT = 100;
const MAX_PAGES = 10; // 100 runs per page; enough for the whole retained window
const CI_WORKFLOW = 'CI';

/** Every `Co-Authored-By:` name in a commit message body. */
export function trailerNames(body) {
  const names = [];
  for (const line of (body || '').split('\n')) {
    const m = /^\s*Co-Authored-By:\s*(.+?)\s*(?:<[^>]*>)?\s*$/i.exec(line);
    if (m && m[1]) names.push(m[1]);
  }
  return names;
}

export function toolOf(name) {
  return TOOLS.find((t) => t.match.test(name))?.tool ?? null;
}

/**
 * First known trailer = executor. Later commits from another tool = LEAD overlay
 * (acceptance cost). `mixed` is reserved for a single commit carrying two tools,
 * not for LEAD stacking on a finished worker PR.
 *
 * @param {{ commits?: { messageBody?: string }[] }} pr
 * @returns {{ tool: string, leadOnTop: number }}
 */
export function classify(pr) {
  let tool = null;
  let leadOnTop = 0;
  for (const c of pr.commits ?? []) {
    const toolsInCommit = new Set();
    for (const name of trailerNames(c.messageBody)) {
      const t = toolOf(name);
      if (t) toolsInCommit.add(t);
    }
    if (toolsInCommit.size === 0) continue;
    if (tool === null) {
      tool = toolsInCommit.size > 1 ? 'mixed' : [...toolsInCommit][0];
      continue;
    }
    for (const t of toolsInCommit) {
      if (t !== tool) leadOnTop++;
    }
  }
  return { tool: tool ?? 'unsigned', leadOnTop };
}

/** Auth advice only when the failure itself points at credentials. */
export function authAdviceFor(detail) {
  if (
    !/auth|login|HTTP\s*401|credentials|not logged|GH_TOKEN|re-authenticate/i.test(detail || '')
  ) {
    return null;
  }
  return 'Нужен установленный и авторизованный gh: gh auth status';
}

export function parseArgs(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json');
  const limitArg = argv.indexOf('--limit');
  const prLimit = limitArg !== -1 ? Number(argv[limitArg + 1]) : DEFAULT_PR_LIMIT;
  return { asJson, prLimit };
}

export function formatGhFailure(argv, err) {
  const detail = (err.stderr || err.message || '').trim().split('\n')[0];
  const lines = [`gh ${argv.slice(0, 2).join(' ')} — ${detail}`];
  const advice = authAdviceFor(detail);
  if (advice) lines.push(advice);
  return { detail, lines };
}

function defaultGh(argv) {
  try {
    return execFileSync('gh', argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    for (const line of formatGhFailure(argv, err).lines) console.error(line);
    process.exit(1);
  }
}

/**
 * List merged PR metadata without `commits` (stays under the GraphQL node cap
 * at DEFAULT_PR_LIMIT), then load commits one PR at a time.
 * `gh` is injectable — tests never hit the network.
 */
export function fetchMergedPrs(prLimit, gh = defaultGh) {
  const meta = JSON.parse(
    gh([
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      String(prLimit),
      '--json',
      'number,title,mergedAt',
    ])
  );
  return meta.map((pr) =>
    JSON.parse(gh(['pr', 'view', String(pr.number), '--json', 'number,title,mergedAt,commits']))
  );
}

export function fetchCiRuns(gh = defaultGh) {
  const runs = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = JSON.parse(
      gh(['api', `repos/{owner}/{repo}/actions/runs?event=pull_request&per_page=100&page=${page}`])
    ).workflow_runs;
    if (!batch?.length) break;
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return runs;
}

export function buildRows(prs, runs) {
  const shaToPr = new Map();
  for (const pr of prs) for (const c of pr.commits ?? []) shaToPr.set(c.oid, pr.number);

  const firstRun = new Map();
  let seenFrom = null;
  let seenTo = null;
  for (const run of runs) {
    if (run.name !== CI_WORKFLOW) continue;
    const number = run.pull_requests?.[0]?.number ?? shaToPr.get(run.head_sha);
    if (!number) continue;
    if (!seenFrom || run.created_at < seenFrom) seenFrom = run.created_at;
    if (!seenTo || run.created_at > seenTo) seenTo = run.created_at;
    const prev = firstRun.get(number);
    if (!prev || run.created_at < prev.created_at) {
      firstRun.set(number, {
        created_at: run.created_at,
        conclusion: run.conclusion,
        attempt: run.run_attempt,
      });
    }
  }

  const rows = prs.map((pr) => {
    const run = firstRun.get(pr.number);
    const { tool, leadOnTop } = classify(pr);
    return {
      number: pr.number,
      title: pr.title,
      mergedAt: pr.mergedAt,
      tool,
      leadOnTop,
      firstRun: run ? run.conclusion : null,
      greenFirst: run ? run.conclusion === 'success' : null,
    };
  });

  return { rows, window: { from: seenFrom, to: seenTo } };
}

export function formatReport(rows, window, prLimit, out = console) {
  const byTool = new Map();
  for (const r of rows) {
    const acc = byTool.get(r.tool) ?? { prs: 0, measured: 0, green: 0, leadOnTop: 0 };
    acc.prs++;
    acc.leadOnTop += r.leadOnTop;
    if (r.greenFirst !== null) {
      acc.measured++;
      if (r.greenFirst) acc.green++;
    }
    byTool.set(r.tool, acc);
  }

  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');

  out.log(`Влитых PR в выборке: ${rows.length} (--limit ${prLimit})`);
  out.log(
    window.from
      ? `Окно прогонов CI: ${window.from.slice(0, 10)} … ${window.to.slice(0, 10)}\n`
      : 'Прогонов CI в окне не найдено — считать нечего.\n'
  );

  out.log('  инструмент  |  PR  | с прогоном | зелёный 1-й | доля | LEAD поверх');
  out.log('  ------------|------|------------|-------------|------|-------------');
  for (const [tool, a] of [...byTool].sort((x, y) => y[1].prs - x[1].prs)) {
    out.log(
      `  ${tool.padEnd(11)} | ${String(a.prs).padStart(4)} | ${String(a.measured).padStart(10)} |` +
        ` ${String(a.green).padStart(11)} | ${pct(a.green, a.measured).padStart(4)} |` +
        ` ${String(a.leadOnTop).padStart(11)}`
    );
  }

  const unmeasured = rows.filter((r) => r.greenFirst === null).length;
  if (unmeasured) {
    out.log(`\nБез прогона CI: ${unmeasured} PR — старше окна Actions, в долю не входят.`);
  }

  const unsigned = byTool.get('unsigned')?.prs ?? 0;
  if (unsigned) {
    out.log(
      `Без подписи: ${unsigned} PR. Это не «сделано руками» — трейлер ничем не гарантирован,\n` +
        'и растущая строка означает, что чинить надо подписи, а не инструмент (AGENT-4).'
    );
  }

  const overlay = rows.filter((r) => r.leadOnTop > 0);
  if (overlay.length) {
    out.log(`\nКоммитов LEAD поверх наряда (${overlay.length} PR):`);
    for (const r of overlay.slice(0, 10)) {
      out.log(`  #${r.number} [${r.tool}] +${r.leadOnTop} — ${r.title.slice(0, 60)}`);
    }
    if (overlay.length > 10) out.log(`  … и ещё ${overlay.length - 10}`);
  }

  const red = rows.filter((r) => r.greenFirst === false);
  if (red.length) {
    out.log(`\nКрасный первый прогон (${red.length}) — читать причину, не долю:`);
    for (const r of red.slice(0, 10)) {
      out.log(`  #${r.number} [${r.tool}] ${r.firstRun} — ${r.title.slice(0, 60)}`);
    }
    if (red.length > 10) out.log(`  … и ещё ${red.length - 10}`);
    out.log(
      '  Джобы прогона: gh api "repos/{owner}/{repo}/actions/runs/<id>/jobs" -q \'.jobs[]|[.name,.conclusion]\''
    );
  }
}

/**
 * @param {{ argv?: string[], gh?: Function, exit?: (code: number) => void, stdout?: { log: Function } }} [opts]
 */
export function run(opts = {}) {
  const argv = opts.argv ?? process.argv.slice(2);
  const gh = opts.gh ?? defaultGh;
  const exit = opts.exit ?? ((code) => process.exit(code));
  const stdout = opts.stdout ?? console;
  const { asJson, prLimit } = parseArgs(argv);

  if (!Number.isFinite(prLimit) || prLimit < 1) {
    console.error(`--limit должен быть положительным числом, получено: ${prLimit}`);
    exit(1);
    return;
  }

  const prs = fetchMergedPrs(prLimit, gh);
  const runs = fetchCiRuns(gh);
  const { rows, window } = buildRows(prs, runs);

  if (asJson) {
    stdout.log(JSON.stringify({ window, rows }, null, 2));
    exit(0);
    return { rows, window };
  }

  formatReport(rows, window, prLimit, stdout);
  exit(0);
  return { rows, window };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  run();
}
