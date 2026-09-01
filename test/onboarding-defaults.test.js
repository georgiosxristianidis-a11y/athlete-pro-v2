/**
 * LAUNCH-9: F-7 (sex preset) and F-8 (privacy passes without a tap).
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
  const attrs = {};
  return {
    style: {},
    innerHTML: '',
    textContent: '',
    id: '',
    tabIndex: 0,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    querySelector() {
      return null;
    },
    focus() {},
  };
}

globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return makeNode();
  },
  head: makeNode(),
  body: makeNode(),
  getElementById: () => null,
};
globalThis.window = /** @type {any} */ (globalThis);
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.dispatchEvent = () => true;

const { DB } = await import('../js/db.js');
const {
  canAdvanceFromStep,
  snapshotOnboarding,
  restoreOnboardingDraft,
  commitOnboarding,
  SKIP_PLACEHOLDERS,
} = await import('../js/onboarding.js');

before(async () => {
  await DB.clearAll();
});

afterEach(async () => {
  await DB.clearAll();
  await restoreOnboardingDraft();
});

describe('F-7 sex is not chosen until the user taps', () => {
  test('fresh onboarding data has no sex preset', () => {
    const snap = snapshotOnboarding();
    assert.equal(snap.data.sex, '');
  });

  test('bio step stays blocked with DOB only — no silent male default', () => {
    const data = {
      goal: 'strength',
      exp: 'beginner',
      sex: '',
      dob: '1990-05-15',
      height: '',
      weight: '',
      privacy: '',
    };
    assert.equal(canAdvanceFromStep(3, data), false);
    assert.equal(canAdvanceFromStep(3, { ...data, sex: 'm' }), true);
  });

  test('source no longer seeds sex as m in blankOnboardingData', () => {
    const start = SRC.indexOf('function blankOnboardingData');
    const end = SRC.indexOf('export function isSexChosen');
    const body = SRC.slice(start, end);
    assert.match(body, /sex: ''/);
    assert.equal(body.includes("sex: 'm'"), false);
  });

  test('_obNext cannot skip sex on step 3', async () => {
    globalThis.window._obSetData({ goal: 'strength' });
    await globalThis.window._obNext();
    assert.equal(snapshotOnboarding().step, 2);

    globalThis.window._obSetData({ exp: 'beginner' });
    await globalThis.window._obNext();
    assert.equal(snapshotOnboarding().step, 3);

    globalThis.window._obSetData({ dob: '1990-05-15' });
    await globalThis.window._obNext();
    assert.equal(snapshotOnboarding().step, 3);

    globalThis.window._obSetData({ sex: 'f' });
    await globalThis.window._obNext();
    assert.equal(snapshotOnboarding().step, 4);
  });

  test('commit mirrors profile.sex onto the legacy sex key body-stats reads', async () => {
    globalThis.window._obQuickStart();
    globalThis.window._obSetData({ sex: 'f' });
    const save = DB.Metrics.save;
    DB.Metrics.save = async () => {};
    try {
      await commitOnboarding();
      assert.equal(await DB.Settings.get('profile.sex'), 'f');
      assert.equal(await DB.Settings.get('sex'), 'f');
    } finally {
      DB.Metrics.save = save;
    }
  });
});

describe('F-8 privacy is not chosen until the user taps', () => {
  test('fresh onboarding data has no privacy preset', () => {
    assert.equal(snapshotOnboarding().data.privacy, '');
  });

  test('privacy step stays blocked until airgap or cloud is selected', () => {
    const base = {
      goal: 'strength',
      exp: 'beginner',
      sex: 'f',
      dob: '1990-05-15',
      height: '170',
      weight: '65',
      privacy: '',
    };
    assert.equal(canAdvanceFromStep(5, base), false);
    assert.equal(canAdvanceFromStep(5, { ...base, privacy: 'airgap' }), true);
    assert.equal(canAdvanceFromStep(5, { ...base, privacy: 'cloud' }), true);
  });

  test('privacy step no longer calls _navButtons(true)', () => {
    const start = SRC.indexOf('function _stepPrivacy');
    const end = SRC.indexOf('function _choiceLabel');
    const body = SRC.slice(start, end);
    assert.equal(body.includes('_navButtons(true)'), false);
    assert.match(body, /canAdvanceFromStep\(5, _data\)/);
  });

  test('commit rejects profile without an explicit privacy choice', async () => {
    globalThis.window._obQuickStart();
    globalThis.window._obSetData({ privacy: '' });
    await assert.rejects(
      () => commitOnboarding(),
      /privacy required/,
      'finish must not write airgap silently'
    );
    assert.equal(await DB.Settings.get('onboarding-complete', false), false);
  });

  test('Fast Skip still applies explicit placeholders after confirm', async () => {
    globalThis.window._obQuickStart();
    const snap = snapshotOnboarding();
    assert.equal(snap.data.privacy, SKIP_PLACEHOLDERS.privacy);
    assert.equal(snap.data.sex, SKIP_PLACEHOLDERS.sex);
    const save = DB.Metrics.save;
    DB.Metrics.save = async () => {};
    try {
      await commitOnboarding();
      assert.equal(await DB.Settings.get('privacy.mode'), 'airgap');
      assert.equal(await DB.Settings.get('profile.sex'), 'm');
      assert.equal(await DB.Settings.get('sex'), 'm');
    } finally {
      DB.Metrics.save = save;
    }
  });
});
