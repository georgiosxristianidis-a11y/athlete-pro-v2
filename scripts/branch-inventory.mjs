#!/usr/bin/env node
/**
 * Branch inventory (card O-5).
 *
 * 73 of 92 local branches were unmerged when this was written. That is not
 * untidiness, it is exposure: the ETag fix that let the phone freeze on stale
 * code sat finished, tested and unmerged while production was sick. Every
 * living branch is another place where done work can quietly fail to arrive.
 *
 * The classification below leans on `git cherry`, i.e. patch equivalence rather
 * than ancestry: the repo merges through GitHub's rebase-merge, so SHAs are
 * rewritten and `--is-ancestor` reports "unmerged" for work that did in fact
 * ship. Ancestry answers "is this commit in main", cherry answers the question
 * that matters here — "is this *change* in main".
 *
 *   node scripts/branch-inventory.mjs           # report
 *   node scripts/branch-inventory.mjs --json    # machine-readable
 *
 * Read-only by design. Deleting branches is a decision, not a script.
 */
import { execFileSync } from 'node:child_process';

const BASE = 'origin/main';
const STALE_DAYS = 24 * 60 * 60 * 1000;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Branch refs, excluding the base itself and symbolic origin/HEAD. */
function branches() {
  const raw = git([
    'for-each-ref',
    '--format=%(refname)\t%(refname:short)\t%(committerdate:iso8601)\t%(authorname)',
    'refs/heads',
    'refs/remotes/origin',
  ]);

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [refname, short, date, author] = line.split('\t');
      return { refname, short, date: new Date(date), author, remote: refname.startsWith('refs/remotes/') };
    })
    .filter((b) => b.short !== 'origin/main' && b.short !== 'main' && b.short !== 'origin/HEAD');
}

/** Branches a worktree is holding — they cannot be deleted without detaching it. */
function worktreeBranches() {
  const held = new Set();
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('branch ')) held.add(line.slice('branch refs/heads/'.length));
  }
  return held;
}

/**
 * Commits on `ref` whose patch is absent from BASE. `git cherry` prefixes
 * equivalent commits with '-' and genuinely new ones with '+'.
 */
function unmergedCommits(ref) {
  let out;
  try {
    out = git(['cherry', BASE, ref]);
  } catch {
    return null; // unrelated history
  }
  return out.split('\n').filter((l) => l.startsWith('+')).length;
}

/** Every path BASE currently tracks — the yardstick for "does this file exist today". */
const baseFiles = new Set(git(['ls-tree', '-r', '--name-only', BASE]).split('\n').filter(Boolean));

/**
 * Basenames too: card H-3 moved every HANDOFF_*.md under docs/handoff/, so a
 * branch that adds HANDOFF_air_refactor.md at the root looks novel while the
 * document is very much alive one directory down. Matching on basename can
 * over-forgive, and that is the right bias here — this report exists to shorten
 * the list a human reads, not to decide anything.
 */
const baseBasenames = new Set([...baseFiles].map((f) => f.split('/').pop()));

/**
 * Files the branch adds that BASE does not have at all — the "is something lost
 * here" signal.
 *
 * `diff A...B` is relative to the merge base, so its --diff-filter=A list
 * includes files that main has since grown on its own path (test/alias-prefill
 * .test.js showed up this way while living in main all along). Intersecting
 * with main's actual tree is what turns the list from noise into a finding.
 */
function novelFiles(ref) {
  try {
    return git(['diff', '--diff-filter=A', '--name-only', `${BASE}...${ref}`])
      .split('\n')
      .filter(Boolean)
      .filter((f) => !baseFiles.has(f) && !baseBasenames.has(f.split('/').pop()));
  } catch {
    return [];
  }
}

function ageDays(date) {
  return Math.floor((Date.now() - date.getTime()) / STALE_DAYS);
}

const held = worktreeBranches();
const rows = branches().map((b) => {
  const ahead = unmergedCommits(b.short);
  const novel = ahead ? novelFiles(b.short) : [];
  return {
    branch: b.short,
    remote: b.remote,
    ahead,
    novel,
    age: ageDays(b.date),
    author: b.author,
    heldByWorktree: held.has(b.short),
    verdict: ahead === null ? 'unrelated' : ahead === 0 ? 'shipped' : novel.length ? 'carries-new-files' : 'edits-only',
  };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const shipped = rows.filter((r) => r.verdict === 'shipped');
const editsOnly = rows.filter((r) => r.verdict === 'edits-only');
const carrying = rows.filter((r) => r.verdict === 'carries-new-files');
const unrelated = rows.filter((r) => r.verdict === 'unrelated');

const fmt = (r) =>
  `  ${r.branch}${r.remote ? ' (origin)' : ''} — +${r.ahead ?? '?'}, ${r.age} дн.` +
  (r.novel.length ? `, новых файлов: ${r.novel.length}` : '') +
  (r.heldByWorktree ? ' [worktree]' : '');

console.log(`Инвентаризация веток относительно ${BASE} (${git(['rev-parse', '--short', BASE])})\n`);
console.log(`Всего веток: ${rows.length} (локальных ${rows.filter((r) => !r.remote).length}, origin ${rows.filter((r) => r.remote).length})\n`);

console.log(`ВЛИТО (патчи уже в main, безопасно удалять): ${shipped.length}`);
shipped.forEach((r) => console.log(fmt(r)));

console.log(`\nНЕСЁТ НОВЫЕ ФАЙЛЫ (смотреть первым — здесь теряется работа): ${carrying.length}`);
carrying
  .sort((a, b) => b.novel.length - a.novel.length)
  .forEach((r) => {
    console.log(fmt(r));
    r.novel.slice(0, 5).forEach((f) => console.log(`      + ${f}`));
    if (r.novel.length > 5) console.log(`      … и ещё ${r.novel.length - 5}`);
  });

console.log(`\nТОЛЬКО ПРАВКИ существующих файлов: ${editsOnly.length}`);
editsOnly.sort((a, b) => b.ahead - a.ahead).forEach((r) => console.log(fmt(r)));

if (unrelated.length) {
  console.log(`\nНЕСВЯЗАННАЯ ИСТОРИЯ (разбирать вручную): ${unrelated.length}`);
  unrelated.forEach((r) => console.log(fmt(r)));
}

console.log(
  `\nУдержано worktree (сначала снять worktree): ${rows.filter((r) => r.heldByWorktree).length}`
);
console.log('\nСкрипт ничего не удаляет. Решение по каждой группе — за Gio.');
