import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { toUserMessage, isBenignRejection } = await import('../js/shared/errors-ui.js');

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
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://app/js/workout.view.js'
    );
    const msg = toUserMessage(err);
    assert.match(msg, /refresh/i);
  });

  test('Firefox-style dynamic import failure while online → module-load message', () => {
    setOnline(true);
    const err = new TypeError(
      'error loading dynamically imported module: https://app/js/profile.js'
    );
    assert.match(toUserMessage(err), /refresh/i);
  });

  test('Safari-style dynamic import failure while online → module-load message', () => {
    setOnline(true);
    const err = new TypeError('Importing a module script failed.');
    assert.match(toUserMessage(err), /refresh/i);
  });

  test('dynamic import failure while actually offline → still reports no connection', () => {
    setOnline(false);
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://app/js/workout.view.js'
    );
    assert.match(toUserMessage(err), /connection/i);
  });

  test('a genuine fetch() network failure while online is unaffected', () => {
    setOnline(true);
    const err = new TypeError('Failed to fetch');
    assert.match(toUserMessage(err), /connection/i);
  });
});

describe('toUserMessage — PrivacyBlockedError', () => {
  test('ai-off is not a generic failure or a downed coach', () => {
    setOnline(true);
    const err = Object.assign(new Error('AI Coach is disabled (Settings → Privacy)'), {
      name: 'PrivacyBlockedError',
      code: 'ai-off',
    });
    assert.match(toUserMessage(err), /disabled|выключен/i);
    assert.equal(
      /something went wrong|что-то пошло не так|unavailable|недоступен/i.test(toUserMessage(err)),
      false
    );
  });

  test('airgap names the mode, not a network outage', () => {
    setOnline(true);
    const err = Object.assign(new Error('AI blocked in air-gapped mode'), {
      name: 'PrivacyBlockedError',
      code: 'airgap',
    });
    assert.match(toUserMessage(err), /air-gapped|airgap|без сети/i);
    assert.equal(/connection|соединен/i.test(toUserMessage(err)), false);
  });
});

// The classifier behind the single unhandled-rejection boundary (js/boot.js).
// It used to live inline in app.js, where a second, unconditional listener in
// boot.js re-logged and re-toasted every rejection it suppressed.
describe('isBenignRejection', () => {
  test('View Transition abort is benign', () => {
    const err = Object.assign(new Error('Transition was aborted because of invalid state'), {
      name: 'InvalidStateError',
    });
    assert.equal(isBenignRejection(err), true);
  });

  test('AbortError is benign', () => {
    assert.equal(
      isBenignRejection(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      true
    );
  });

  test('cloud-only module import failure is benign (air-gapped mode)', () => {
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://app/js/sync.js'
    );
    assert.equal(isBenignRejection(err), true);
  });

  test('an app module failing to import is NOT benign', () => {
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://app/js/workout.view.js'
    );
    assert.equal(isBenignRejection(err), false);
  });

  test('an InvalidStateError with another message is NOT benign', () => {
    const err = Object.assign(new Error('The object is in an invalid state'), {
      name: 'InvalidStateError',
    });
    assert.equal(isBenignRejection(err), false);
  });

  test('a genuine TypeError is NOT benign', () => {
    assert.equal(isBenignRejection(new TypeError('x is not a function')), false);
  });

  test('a null/undefined reason is not treated as benign', () => {
    assert.equal(isBenignRejection(null), false);
    assert.equal(isBenignRejection(undefined), false);
  });
});
