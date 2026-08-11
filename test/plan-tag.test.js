// ABBR-1 п.2 — manual per-exercise display tag (Edit Plan). The field must
// survive buildSession() (plan definition → live session object) since the
// Island reads State.plan, not the raw plan; a whitelist miss there would
// make the tag silently dead despite being saved correctly (see
// reference-workout-facade-manual-wiring.md-style trap).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, loadPlan, savePlan } from '../js/workout.store.js';

function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(mockStorage);

test('a tag saved via the plan editor survives into the live session object', () => {
  const plan = loadPlan('A');
  plan.push[0].tag = 'DB';
  savePlan(plan, 'A');

  const session = buildSession('push');
  assert.equal(session[0].tag, 'DB');
});

test('an exercise without a tag has no tag key on the session object (not undefined-valued)', () => {
  const session = buildSession('push');
  assert.equal('tag' in session[0], false);
});

test('clearing the tag (empty string) removes it from the plan and the session', () => {
  const plan = loadPlan('A');
  plan.push[0].tag = 'DB';
  savePlan(plan, 'A');
  assert.equal(buildSession('push')[0].tag, 'DB');

  const plan2 = loadPlan('A');
  delete plan2.push[0].tag;
  savePlan(plan2, 'A');
  assert.equal('tag' in buildSession('push')[0], false);
});

test('name and alias are untouched by setting a tag', () => {
  const plan = loadPlan('A');
  const before = { name: plan.push[0].name, alias: plan.push[0].alias };
  plan.push[0].tag = 'DB';
  savePlan(plan, 'A');
  const after = loadPlan('A').push[0];
  assert.equal(after.name, before.name);
  assert.deepEqual(after.alias, before.alias);
});
