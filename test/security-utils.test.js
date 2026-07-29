import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw } from '../js/shared/utils.js';

describe('Security & Sanitization Utils', () => {
  describe('esc', () => {
    test('escapes special HTML characters', () => {
      assert.equal(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      assert.equal(esc("John's & Jane's"), 'John&#039;s &amp; Jane&#039;s');
    });

    test('handles null and undefined gracefully', () => {
      assert.equal(esc(null), '');
      assert.equal(esc(undefined), '');
    });
  });

  describe('html tagged template', () => {
    test('automatically escapes interpolated variables', () => {
      const untrustedInput = '<img src=x onerror=alert(1)>';
      const result = html`<div class="user-card">${untrustedInput}</div>`;
      assert.equal(result, '<div class="user-card">&lt;img src=x onerror=alert(1)&gt;</div>');
    });

    test('preserves trusted raw HTML when wrapped with raw()', () => {
      const trustedBadge = raw('<span class="badge">PRO</span>');
      const untrustedName = '<b>Hacker</b>';
      const result = html`<div class="user">${trustedBadge} ${untrustedName}</div>`;
      assert.equal(result, '<div class="user"><span class="badge">PRO</span> &lt;b&gt;Hacker&lt;/b&gt;</div>');
    });

    test('escapes items in array interpolations', () => {
      const items = ['<script>', '<i>safe</i>'];
      const result = html`<ul>${items}</ul>`;
      assert.equal(result, '<ul>&lt;script&gt;&lt;i&gt;safe&lt;/i&gt;</ul>');
    });
  });
});
