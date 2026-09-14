// @ts-check
/**
 * A2 — Integrity.check() зовётся после каждого успешного lazy load.
 * integrity.js существовал с BOOT-TRIM, но check() никто не вызывал —
 * контракт был декларацией без проверки в рантайме.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const app = stripComments(readText('js/app.js'));

/** Вырезает тело именованной async function по балансу фигурных скобок. */
function functionBody(src, name) {
  const start = src.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `не нашёл function ${name} в app.js — гард потерял якорь`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  assert.fail(`не нашёл конец тела ${name}`);
}

describe('A2: Integrity.check() wired after lazy load', () => {
  test('_loadWorkout calls Integrity.check() before returning', () => {
    assert.match(functionBody(app, '_loadWorkout'), /Integrity\.check\(\)/);
  });

  test('_loadProfile calls Integrity.check() before returning', () => {
    assert.match(functionBody(app, '_loadProfile'), /Integrity\.check\(\)/);
  });

  test('_loadAthleteRoom calls Integrity.check() before returning', () => {
    assert.match(functionBody(app, '_loadAthleteRoom'), /Integrity\.check\(\)/);
  });

  test('Claude FAB lazy load calls Integrity.check() after renderFAB', () => {
    const claudeBlock = app.match(
      /Promise\.all\(\[import\('\.\/claude\.view\.js'\)[\s\S]*?\}\s*\);/
    )?.[0];
    assert.ok(claudeBlock, 'не нашёл блок ленивой загрузки Claude FAB');
    assert.match(claudeBlock, /Claude\.renderFAB\(\)/);
    assert.match(claudeBlock, /Integrity\.check\(\)/);
  });

  test("Nav.on('s-stats') calls Integrity.check() after Analytics import", () => {
    const statsBlock = app.match(/Nav\.on\('s-stats',[\s\S]*?\}\);/)?.[0];
    assert.ok(statsBlock, "не нашёл Nav.on('s-stats') в app.js");
    assert.match(statsBlock, /Integrity\.check\(\)/);
  });

  test('integrity.js stays a dynamic import — no static import re-enters boot graph', () => {
    // Каждый вызов обязан идти через await import(...), не через статический
    // import сверху файла: тот вернул бы integrity.js в бут-граф и покраснил
    // бы test/boot-graph.test.js (BOOT-TRIM).
    assert.doesNotMatch(app, /^\s*import\s+.*from\s+['"]\.\/shared\/integrity\.js['"]/m);
    const dynamicImports = app.match(/await import\('\.\/shared\/integrity\.js'\)/g) || [];
    assert.equal(
      dynamicImports.length,
      5,
      'ожидалось 5 точек вызова Integrity.check() (Workout/Profile/AthleteRoom/Claude/Analytics)'
    );
  });
});
