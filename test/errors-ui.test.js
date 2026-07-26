import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { toUserMessage } = await import('../js/shared/errors-ui.js');

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

// F-6: a failed dynamic import() (lazy-loaded module) must not be misreported
// as "no connection" when the device is actually online — the browser phrases
// module-load failures as a "fetch" error regardless of cause (stale chunk
// after deploy, syntax error, CSP block).
describe('toUserMessage — dynamic import failures (F-6)', () => {
  test('Chrome-style dynamic import failure while online → module-load message, not offline', () => {
    setOnline(true);
    const err = new TypeError('Failed to fetch dynamically imported module: https://app/js/workout.view.js');
    const msg = toUserMessage(err);
    assert.match(msg, /refresh/i);
  });

  test('Firefox-style dynamic import failure while online → module-load message', () => {
    setOnline(true);
    const err = new TypeError('error loading dynamically imported module: https://app/js/profile.js');
    assert.match(toUserMessage(err), /refresh/i);
  });

  test('Safari-style dynamic import failure while online → module-load message', () => {
    setOnline(true);
    const err = new TypeError('Importing a module script failed.');
    assert.match(toUserMessage(err), /refresh/i);
  });

  test('dynamic import failure while actually offline → still reports no connection', () => {
    setOnline(false);
    const err = new TypeError('Failed to fetch dynamically imported module: https://app/js/workout.view.js');
    assert.match(toUserMessage(err), /connection/i);
  });

  test('a genuine fetch() network failure while online is unaffected', () => {
    setOnline(true);
    const err = new TypeError('Failed to fetch');
    assert.match(toUserMessage(err), /connection/i);
  });
});
