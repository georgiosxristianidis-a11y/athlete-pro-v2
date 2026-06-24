import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Mock document for events.js
const listeners = {};
globalThis.document = {
  addEventListener: (eventName, handler, useCapture = false) => {
    listeners[eventName] = { handler, useCapture };
  }
};

const events = await import('../js/events.js');

test('Event Delegation', async (t) => {
  await t.test('registers and dispatches click (on) event', () => {
    let triggered = false;
    let receivedEl = null;
    let receivedEvent = null;
    
    events.on('test:click', (el, e) => {
      triggered = true;
      receivedEl = el;
      receivedEvent = e;
    });

    const mockElement = {
      dataset: { action: 'test:click' },
      closest: (selector) => {
        if (selector === '[data-action]') return mockElement;
        return null;
      }
    };

    const mockEvent = { target: mockElement };
    
    assert.ok(listeners['click'], 'click listener should be registered');
    listeners['click'].handler(mockEvent);
    
    assert.strictEqual(triggered, true);
    assert.strictEqual(receivedEl, mockElement);
    assert.strictEqual(receivedEvent, mockEvent);
  });

  await t.test('registers and dispatches change (onChange) event', () => {
    let triggered = false;
    events.onChange('test:change', () => { triggered = true; });

    const mockElement = {
      dataset: { change: 'test:change' },
      closest: (selector) => selector === '[data-change]' ? mockElement : null
    };
    
    assert.ok(listeners['change'], 'change listener should be registered');
    listeners['change'].handler({ target: mockElement });
    assert.strictEqual(triggered, true);
  });

  await t.test('registers and dispatches keydown (onKeydown) event', () => {
    let triggered = false;
    events.onKeydown('test:keydown', () => { triggered = true; });

    const mockElement = {
      dataset: { keydown: 'test:keydown' },
      closest: (selector) => selector === '[data-keydown]' ? mockElement : null
    };
    
    assert.ok(listeners['keydown'], 'keydown listener should be registered');
    listeners['keydown'].handler({ target: mockElement });
    assert.strictEqual(triggered, true);
  });

  await t.test('registers and dispatches input (onInput) event', () => {
    let triggered = false;
    events.onInput('test:input', () => { triggered = true; });

    const mockElement = {
      dataset: { input: 'test:input' },
      closest: (selector) => selector === '[data-input]' ? mockElement : null
    };
    
    assert.ok(listeners['input'], 'input listener should be registered');
    listeners['input'].handler({ target: mockElement });
    assert.strictEqual(triggered, true);
  });

  await t.test('registers and dispatches blur (onBlur) event with capture phase', () => {
    let triggered = false;
    events.onBlur('test:blur', () => { triggered = true; });

    const mockElement = {
      dataset: { blur: 'test:blur' },
      closest: (selector) => selector === '[data-blur]' ? mockElement : null
    };
    
    assert.ok(listeners['blur'], 'blur listener should be registered');
    assert.strictEqual(listeners['blur'].useCapture, true, 'blur listener must use capture phase');
    listeners['blur'].handler({ target: mockElement });
    assert.strictEqual(triggered, true);
  });
  
  await t.test('does not trigger if target does not match closest selector', () => {
    let triggered = false;
    events.on('test:ignore', () => { triggered = true; });

    const mockElement = {
      dataset: {},
      closest: () => null
    };
    
    listeners['click'].handler({ target: mockElement });
    assert.strictEqual(triggered, false);
  });
});

test('Gate: No inline on* attributes (CSP strict)', () => {
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  // Match on\w+= or on\w+\s*=, ignoring case. 
  // Specifically look for common ones like onclick, onchange, onsubmit, onkeydown, etc.
  const inlineEventRegex = /\s(onclick|onchange|onsubmit|onkeydown|onkeyup|onkeypress|oninput|onblur|onfocus|onmouseover|onmouseout|onmouseenter|onmouseleave)\s*=/i;
  
  const match = htmlContent.match(inlineEventRegex);
  
  if (match) {
    assert.fail(`Found inline event handler '${match[1]}' in index.html. Inline handlers are forbidden due to strict CSP (script-src-attr 'none').`);
  }

  // NB: a recursive js/ scanner was scaffolded here but left disabled — it would
  // recurse into js/_archive (legacy inline handlers still live there, excluded
  // from the CSP gate). The live src is covered by the build-time gate grep.
});
