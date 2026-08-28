/**
 * LAUNCH-9: F-6 (draft survives a tab close) and F-9 (Fast Skip does not
 * write a invented profile until the user confirms the placeholders).
 */
import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'onboarding.js'), 'utf8');

function makeNode() {
  const node = {
    style: {},
    innerHTML: '',
    textContent: '',
    id: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
  };
  return node;
}

const head = makeNode();
const body = makeNode();
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return makeNode();
  },
  head,
  body,
  getElementById: () => null,
};
globalThis.window = /** @type {any} */ (globalThis);
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.dispatchEvent = () => true;

const { DB } = await import('../js/db.js');
const {
  ONBOARDING_DRAFT_KEY,
  SKIP_PLACEHOLDERS,
  persistOnboardingDraft,
  restoreOnboardingDraft,
  clearOnboardingDraft,
  snapshotOnboarding,
  commitOnboarding,
  showOnboarding,
} = await import('../js/onboarding.js');

before(async () => {
  await DB.clearAll();
});

afterEach(async () => {
  await DB.clearAll();
  await restoreOnboardingDraft();
});

describe('F-6 onboarding draft', () => {
  test('step and answers survive a memory reset the way a tab close does', async () => {
    globalThis.window._obSetData({ goal: 'strength', exp: 'beginner' });
    await persistOnboardingDraft();
    await globalThis.window._obNext();
    await globalThis.window._obNext();

    const stored = await DB.Settings.get(ONBOARDING_DRAFT_KEY);
    assert.equal(stored.step, 3);
    assert.equal(stored.data.goal, 'strength');
    assert.equal(stored.data.exp, 'beginner');

    await clearOnboardingDraft();
    await restoreOnboardingDraft();
    assert.equal(snapshotOnboarding().step, 1);
    assert.equal(snapshotOnboarding().data.goal, '');

    await DB.Settings.set(ONBOARDING_DRAFT_KEY, stored);
    const restored = await restoreOnboardingDraft();
    assert.equal(restored, true);
    assert.equal(snapshotOnboarding().step, 3);
    assert.equal(snapshotOnboarding().data.goal, 'strength');
    assert.equal(snapshotOnboarding().data.exp, 'beginner');
  });

  test('corrupt draft is ignored, not treated as progress', async () => {
    await DB.Settings.set(ONBOARDING_DRAFT_KEY, { step: 99, data: { goal: 'strength' } });
    const restored = await restoreOnboardingDraft();
    assert.equal(restored, false);
    assert.equal(snapshotOnboarding().step, 1);
    assert.equal(snapshotOnboarding().data.goal, '');
  });
});

describe('F-9 Fast Skip confirmation', () => {
  test('_obQuickStart does not finish and does not write the profile', async () => {
    const start = SRC.indexOf('window._obQuickStart =');
    const end = SRC.indexOf('window._obSkipBack =');
    const body = SRC.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.equal(body.includes('_obFinish'), false);
    assert.match(body, /_skipConfirm = true/);

    globalThis.window._obQuickStart();
    await persistOnboardingDraft();
    const snap = snapshotOnboarding();
    assert.equal(snap.skipConfirm, true);
    assert.equal(snap.data.sex, SKIP_PLACEHOLDERS.sex);
    assert.equal(snap.data.dob, SKIP_PLACEHOLDERS.dob);
    assert.equal(snap.data.weight, SKIP_PLACEHOLDERS.weight);
    assert.equal(snap.data.height, SKIP_PLACEHOLDERS.height);
    assert.equal(await DB.Settings.get('onboarding-complete', false), false);
    assert.equal(await DB.Settings.get('profile.dob', null), null);
  });

  test('showOnboarding restores skip-confirm as a labelled placeholder screen', async () => {
    globalThis.window._obQuickStart();
    await persistOnboardingDraft();
    const shown = showOnboarding();
    const overlay = await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const node = document.body.children.at(-1);
        if (node && String(node.innerHTML).includes('data-action="ob:skipBack"')) {
          resolve(node);
          return;
        }
        if (Date.now() - t0 > 1000) {
          reject(new Error('onboarding overlay did not render skip-confirm'));
          return;
        }
        setImmediate(tick);
      };
      tick();
    });
    assert.match(overlay.innerHTML, /These are placeholders/);
    assert.match(overlay.innerHTML, /1995-01-01/);
    assert.match(overlay.innerHTML, /data-action="ob:finish"/);
    assert.equal(overlay.innerHTML.includes("You're set."), false);
    overlay._resolve();
    await shown;
  });

  test('skip-back drops placeholders without completing onboarding', async () => {
    globalThis.window._obQuickStart();
    await persistOnboardingDraft();
    await globalThis.window._obSkipBack();
    const snap = snapshotOnboarding();
    assert.equal(snap.skipConfirm, false);
    assert.equal(snap.data.dob, '');
    assert.equal(snap.step, 1);
    assert.equal(await DB.Settings.get('onboarding-complete', false), false);
  });

  test('confirm writes the placeholders only after the extra screen', async () => {
    const save = DB.Metrics.save;
    DB.Metrics.save = async () => {};
    try {
      globalThis.window._obQuickStart();
      await persistOnboardingDraft();
      await commitOnboarding();
      assert.equal(await DB.Settings.get('onboarding-complete'), true);
      assert.equal(await DB.Settings.get('profile.dob'), SKIP_PLACEHOLDERS.dob);
      assert.equal(await DB.Settings.get('profile.sex'), SKIP_PLACEHOLDERS.sex);
      assert.equal(await DB.Settings.get(ONBOARDING_DRAFT_KEY), null);
    } finally {
      DB.Metrics.save = save;
    }
  });
});
