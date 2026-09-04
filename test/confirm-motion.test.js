/**
 * Guard: shared confirm/prompt must stay CSS-driven.
 *
 * The same dual-driver that made the Body Metrics form stutter (Spring writing
 * transform every frame while .modal-sheet already ran @keyframes sheet-in)
 * lived here too — one primitive, every confirmation in the app. Overlay also
 * inherited blur(8px) from .modal-overlay. Recipe matches .bs-overlay.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(REPO_ROOT, 'js', 'shared', 'confirm.js'), 'utf8');
const css = fs.readFileSync(path.join(REPO_ROOT, 'css', 'base.css'), 'utf8');

describe('confirm/prompt motion', () => {
  test('the sheet is CSS-driven — a JS spring must not fight the transition', () => {
    assert.doesNotMatch(
      src,
      /from '\.\/spring\.js'/,
      'Spring на этом шите снова введёт dual-driver с CSS transition / sheet-in'
    );
    assert.doesNotMatch(
      src,
      /sheet\.style\.transform/,
      'инлайн transform перебивает transition и возвращает дёрганье'
    );
    assert.match(
      css,
      /\.modal-overlay\.confirm-overlay \{[\s\S]*?backdrop-filter:\s*none/,
      'оверлей не должен наследовать blur(8px) поверх комнаты атлета'
    );
    assert.match(
      css,
      /\.modal-overlay\.confirm-overlay \.modal-sheet \{[\s\S]*?transition:\s*transform 0\.26s var\(--ease-decel\)/,
      'шит едет как .ar-sheet / .bs-overlay, одним драйвером'
    );
  });

  test('Escape stops at confirm — F6 trap must not yank the overlay mid-exit', () => {
    const escStops = /if \(e\.key === 'Escape'\) \{[\s\S]*?e\.stopPropagation\(\)/g;
    const hits = src.match(escStops) || [];
    assert.equal(
      hits.length,
      2,
      'confirmDialog и promptFieldsDialog: stopPropagation на Escape, иначе _trapFocus делает overlay.remove() и CSS-выход не играет'
    );
  });
});
