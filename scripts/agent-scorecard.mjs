#!/usr/bin/env node
/**
 * Agent scorecard (card AGENT-1).
 *
 * Question: which tool produced work that passed the gate on the first try.
 *
 * The naive answer — label every commit and count in `git log` — does not work
 * here. The repo merges through GitHub's rebase-merge, so the SHA that lands in
 * main is not the SHA CI ran on, and `--delete-branch` removes the branch that
 * held the original. The gate lives on the pull request, not on the commit, so
 * the join key is the PR number and the source is the Actions API.
 *
 * The commit trailer is still what says *who*: `Co-Authored-By: <name>` is
 * already written by Claude on every commit (207 of 246 in the 30 days before
 * this was added) and survives rebase-merge intact. Cursor gets its own line,
 * see `.cursor/rules/000-core.mdc`.
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
 * 2. Actions history is retained, not eternal, and this repo lost runs to the
 *    `push: ['**']` billing incident. The report prints the window it actually
 *    saw; a short window means a small sample, not a good score.
 *
 * Nothing enforces the trailer — there is no `commit-msg` hook and no CI check.
 * That is why `unsigned` is reported as its own row instead of being folded into
 * a tool: silent drift would bias every ratio here. A growing `unsigned` row is
 * the signal that the labels, not the tools, need attention (card AGENT-4).
 *
 * Read-only. Talks to GitHub, touches nothing.
 */
import { execFileSync } from 'node:child_process';

/**
 * Trailer name -> tool. Matched on the NAME, not the address: the address is
 * cosmetic and changes with whatever the vendor decides, the name is what the
 * rules tell each agent to write.
 */
const TOOLS = [
  { tool: 'claude', match: /^claude\b/i },
  { tool: 'cursor', match: /^cursor\b/i },
];

const MAX_PAGES = 10; // 100 runs per page; enough for the whole retained window
const CI_WORKFLOW = 'CI';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const limitArg = args.indexOf('--limit');
const PR_LIMIT = limitArg !== -1 ? Number(args[limitArg + 1]) : 100;

function gh(argv) {
  try {
    return execFileSync('gh', argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    const detail = (err.stderr || err.message || '').trim().split('\n')[0];
    console.error(`gh ${argv.slice(0, 2).join(' ')} — ${detail}`);
    console.error('Нужен установленный и авторизованный gh: gh auth status');
    process.exit(1);
  }
}

/** Every `Co-Authored-By:` name in a commit message body. */
function trailerNames(body) {
  const names = [];
  for (const line of (body || '').split('\n')) {
    const m = /^\s*Co-Authored-By:\s*(.+?)\s*(?:<[^>]*>)?\s*$/i.exec(line);
    if (m && m[1]) names.push(m[1]);
  }
  return names;
}

function toolOf(name) {
  return TOOLS.find((t) => t.match.test(name))?.tool ?? null;
}

/**
 * One tool per PR. A PR whose commits carry two different tools is `mixed` and
 * is counted separately — averaging it into either side would invent a number.
 */
function classify(pr) {
  const found = new Set();
  for (const c of pr.commits ?? []) {
    for (const name of trailerNames(c.messageBody)) {
      const tool = toolOf(name);
      if (tool) found.add(tool);
    }
  }
  if (found.size === 0) return 'unsigned';
  if (found.size > 1) return 'mixed';
  return [...found][0];
}

const prs = JSON.parse(
  gh([
    'pr',
    'list',
    '--state',
    'merged',
    '--limit',
    String(PR_LIMIT),
    '--json',
    'number,title,mergedAt,commits',
  ])
);

/**
 * Runs carry `pull_requests[]`, but GitHub leaves it empty often enough that a
 * fallback is worth the twenty lines: every PR commit SHA points back at its PR.
 */
const shaToPr = new Map();
for (const pr of prs) for (const c of pr.commits ?? []) shaToPr.set(c.oid, pr.number);

const runs = [];
for (let page = 1; page <= MAX_PAGES; page++) {
  const batch = JSON.parse(
    gh(['api', `repos/{owner}/{repo}/actions/runs?event=pull_request&per_page=100&page=${page}`])
  ).workflow_runs;
  if (!batch?.length) break;
  runs.push(...batch);
  if (batch.length < 100) break;
}

/** Earliest CI run per PR — "did the gate go green the first time it ran". */
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
  return {
    number: pr.number,
    title: pr.title,
    mergedAt: pr.mergedAt,
    tool: classify(pr),
    firstRun: run ? run.conclusion : null,
    greenFirst: run ? run.conclusion === 'success' : null,
  };
});

if (asJson) {
  console.log(JSON.stringify({ window: { from: seenFrom, to: seenTo }, rows }, null, 2));
  process.exit(0);
}

const byTool = new Map();
for (const r of rows) {
  const acc = byTool.get(r.tool) ?? { prs: 0, measured: 0, green: 0 };
  acc.prs++;
  if (r.greenFirst !== null) {
    acc.measured++;
    if (r.greenFirst) acc.green++;
  }
  byTool.set(r.tool, acc);
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');

console.log(`Влитых PR в выборке: ${rows.length} (--limit ${PR_LIMIT})`);
console.log(
  seenFrom
    ? `Окно прогонов CI: ${seenFrom.slice(0, 10)} … ${seenTo.slice(0, 10)}\n`
    : 'Прогонов CI в окне не найдено — считать нечего.\n'
);

console.log('  инструмент  |  PR  | с прогоном | зелёный 1-й | доля');
console.log('  ------------|------|------------|-------------|------');
for (const [tool, a] of [...byTool].sort((x, y) => y[1].prs - x[1].prs)) {
  console.log(
    `  ${tool.padEnd(11)} | ${String(a.prs).padStart(4)} | ${String(a.measured).padStart(10)} |` +
      ` ${String(a.green).padStart(11)} | ${pct(a.green, a.measured)}`
  );
}

const unmeasured = rows.filter((r) => r.greenFirst === null).length;
if (unmeasured) {
  console.log(`\nБез прогона CI: ${unmeasured} PR — старше окна Actions, в долю не входят.`);
}

const unsigned = byTool.get('unsigned')?.prs ?? 0;
if (unsigned) {
  console.log(
    `Без подписи: ${unsigned} PR. Это не «сделано руками» — трейлер ничем не гарантирован,\n` +
      'и растущая строка означает, что чинить надо подписи, а не инструмент (AGENT-4).'
  );
}

const red = rows.filter((r) => r.greenFirst === false);
if (red.length) {
  console.log(`\nКрасный первый прогон (${red.length}) — читать причину, не долю:`);
  for (const r of red.slice(0, 10)) {
    console.log(`  #${r.number} [${r.tool}] ${r.firstRun} — ${r.title.slice(0, 60)}`);
  }
  if (red.length > 10) console.log(`  … и ещё ${red.length - 10}`);
  console.log(
    '  Джобы прогона: gh api "repos/{owner}/{repo}/actions/runs/<id>/jobs" -q \'.jobs[]|[.name,.conclusion]\''
  );
}
