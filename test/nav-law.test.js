/**
 * Guard for the bottom-navigation law: the tab bar holds exactly four tabs.
 *
 * This is a product law, not a layout detail — `.nav-btn` is `flex:1`, so a
 * fifth tab does not break anything visually and slips in unnoticed (it did,
 * in the first pass of card LOG-1). The rule is only enforceable if something
 * fails when it is broken, so it lives here rather than in a doc.
 *
 * A new screen that is not one of the four gets its entry point from the
 * content it belongs to (Journal is reached from the Recent section header on
 * the dashboard) and MUST carry a back control — `s-body` is the counterexample
 * that proves it: it is registered in Nav and reachable from nowhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

/** The <nav id="nav"> block — tab buttons only, not every .nav-btn in the file. */
function navBlock() {
  const m = html.match(/<nav id="nav">([\s\S]*?)<\/nav>/);
  assert.ok(m, 'sanity: <nav id="nav"> should exist in index.html');
  return m[1];
}

const EXPECTED_TABS = ['s-home', 's-train', 's-stats', 's-profile'];

test('nav law: the tab bar holds exactly four tabs', () => {
  const tabs = [...navBlock().matchAll(/data-s="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    tabs,
    EXPECTED_TABS,
    'Нижняя навигация — ровно четыре вкладки (закон). Новый экран получает ' +
      'вход из своего контента, а не пятой кнопкой в таб-баре.'
  );
});

test('nav law: every tab button is labelled for screen readers', () => {
  const buttons = navBlock().match(/<button[^>]*class="nav-btn[^"]*"[^>]*>/g) || [];
  assert.equal(buttons.length, EXPECTED_TABS.length);
  for (const b of buttons) {
    assert.match(b, /aria-label="[^"]+"/, `nav-btn без aria-label: ${b}`);
  }
});

test('journal: an off-tab-bar screen keeps a way back', () => {
  const view = fs.readFileSync(path.join(REPO_ROOT, 'js', 'journal.view.js'), 'utf8');
  assert.match(
    view,
    /data-action="nav:back"/,
    'Экран вне таб-бара обязан нести кнопку «назад», иначе он тупик (кейс s-body).'
  );
});

test('journal: the dashboard carries the entry point into it', () => {
  const dash = fs.readFileSync(path.join(REPO_ROOT, 'js', 'dashboard.js'), 'utf8');
  assert.match(dash, /data-action="dash:openJournal"/, 'нет кнопки входа в журнал');
  assert.match(dash, /on\('dash:openJournal'/, 'кнопка входа есть, а обработчика нет');
  assert.match(dash, /Nav\.go\('s-journal'\)/, 'обработчик не ведёт на экран журнала');
});
