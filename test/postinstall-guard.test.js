/**
 * Guard: postinstall must not hard-depend on files stripped from the deploy.
 *
 * Baseline (PR#196, commit ff9ceed): `postinstall` was changed from an inline
 * `git config ...` to `node scripts/fix-hooks-path.mjs`. Locally and in CI it
 * was green — `test`, `e2e` and `drift` all passed. Vercel still failed the
 * deploy, because `.vercelignore` strips `scripts/` from the build context:
 * the file simply is not there, `node` exits non-zero, `npm install` dies and
 * takes the whole deployment with it.
 *
 * Every gate answered its own question and none of them owned this one. That
 * is the gap this test fills: npm lifecycle scripts run in the *deploy*
 * container too, where the repo is not the repo.
 *
 * Rule enforced: if a lifecycle script points at a path excluded by
 * `.vercelignore`, the invocation has to tolerate the file being absent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** npm lifecycle scripts that also run in the Vercel build container. */
const DEPLOY_LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
}

/** Top-level directories excluded from the deploy, e.g. `scripts/` -> `scripts`. */
function ignoredDirs() {
  return readFileSync(path.join(REPO_ROOT, '.vercelignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.endsWith('/'))
    .map((l) => l.replace(/\/$/, ''));
}

/**
 * A command survives a missing file if the failure is swallowed. `|| exit 0`
 * and `|| true` both work in sh and in cmd.exe, which npm uses on Windows.
 */
function toleratesFailure(cmd) {
  return /\|\|\s*(exit\s+0|true)\b/.test(cmd);
}

test('postinstall-guard: lifecycle scripts survive .vercelignore stripping', () => {
  const { scripts = {} } = readJson('package.json');
  const stripped = ignoredDirs();

  for (const name of DEPLOY_LIFECYCLE) {
    const cmd = scripts[name];
    if (!cmd) continue;

    for (const dir of stripped) {
      // Matches `scripts/foo.mjs` but not a bare word like `scripts`.
      const referenced = new RegExp(`(^|[\\s"'=])${dir}/\\S+`).test(cmd);
      if (!referenced) continue;

      assert.ok(
        toleratesFailure(cmd),
        `npm "${name}" runs "${cmd}", which reaches into "${dir}/" — a directory ` +
          `.vercelignore strips from the deploy. There the file does not exist, so ` +
          `npm install fails and the deployment dies while CI stays green. ` +
          `Append "|| exit 0", or stop depending on ${dir}/ from a lifecycle script.`,
      );
    }
  }
});

test('postinstall-guard: hook wiring is best-effort, not a build blocker', () => {
  const { scripts = {} } = readJson('package.json');
  // Pinned deliberately: this is the exact regression from PR#196. If someone
  // makes hook wiring strict again, the deploy breaks and CI would not notice.
  assert.ok(
    !scripts.postinstall || toleratesFailure(scripts.postinstall),
    `postinstall must not be able to fail the build: "${scripts.postinstall}". ` +
      'Git hook wiring is a developer convenience; the real guards are ' +
      '`npm run preflight` and this suite.',
  );
});
