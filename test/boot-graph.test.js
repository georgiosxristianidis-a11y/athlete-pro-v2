// @ts-check
/**
 * BOOT-TRIM — Athlete Room, Integrity and panda stay off the first-frame graph.
 *
 * import-guard.test.js only checks that each modulepreload href exists on disk.
 * This file checks the inverse: the trimmed modules are not static imports of
 * the boot entry and are not advertised as modulepreload.
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

/** Strip /* block *\/ and // line comments so JSDoc type-imports never match. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Specifiers of ESM static import (not import()). */
function staticSpecs(src) {
  const code = stripComments(src);
  const specs = [];
  const re = /^[ \t]*import(?:\s+(?:type\s+)?(?:[\w${}*,\s]+)\s+from\s+|\s+)['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(code))) specs.push(m[1]);
  return specs;
}

function modulepreloadHrefs(html) {
  const re = /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g;
  const hrefs = [];
  let m;
  while ((m = re.exec(html))) hrefs.push(m[1]);
  return hrefs;
}

const OFF_BOOT = {
  app: ['athlete-room', 'integrity', 'panda-video', 'panda-mood'],
  pandaHosts: ['panda-video', 'panda-mood'],
  preload: [
    'js/shared/athlete-room.js',
    'js/shared/integrity.js',
    'js/shared/panda-video.js',
    'js/shared/panda-mood.js',
    'js/strength-engine.js',
    'js/shared/lift-map.js',
    'js/profile.view/lift-bars.js',
    'js/profile.store.js',
  ],
  keepPreload: [
    'js/shared/dynamic-island.js',
    'js/rest-timer.js',
    'js/features/pip.js',
    'js/shared/confirm.js',
    'js/ui/factory.js',
    'js/shared/cryptoClient.js',
    'js/shared/chamber-pill.js',
    'js/db/core.js',
    'js/shared/sparkline.js',
    'js/claude.store.js',
    'js/shared/spring.js',
    'js/flags.js',
    'js/shared/format.js',
    'js/shared/ppl-gauge.js',
  ],
};

describe('BOOT-TRIM: static imports off the critical path', () => {
  test('app.js has no static import of athlete-room / integrity / panda-*', () => {
    const specs = staticSpecs(readText('js/app.js'));
    for (const needle of OFF_BOOT.app) {
      assert.ok(
        !specs.some((s) => s.includes(needle)),
        `app.js still statically imports a module matching '${needle}': ${specs.filter((s) => s.includes(needle)).join(', ')}`
      );
    }
  });

  test('dashboard.js has no static import of panda-*', () => {
    const specs = staticSpecs(readText('js/dashboard.js'));
    for (const needle of OFF_BOOT.pandaHosts) {
      assert.ok(
        !specs.some((s) => s.includes(needle)),
        `dashboard.js still statically imports a module matching '${needle}'`
      );
    }
  });

  test('rest-timer.js has no static import of panda-*', () => {
    const specs = staticSpecs(readText('js/rest-timer.js'));
    for (const needle of OFF_BOOT.pandaHosts) {
      assert.ok(
        !specs.some((s) => s.includes(needle)),
        `rest-timer.js still statically imports a module matching '${needle}'`
      );
    }
  });
});

describe('BOOT-TRIM: modulepreload is the boot closure only', () => {
  const hrefs = modulepreloadHrefs(readText('index.html'));

  test('sanity: index.html still declares the remaining boot preloads', () => {
    assert.ok(hrefs.length > 0, 'ожидались <link rel="modulepreload">');
    for (const keep of OFF_BOOT.keepPreload) {
      assert.ok(hrefs.includes(keep), `modulepreload lost boot module '${keep}'`);
    }
  });

  test('trimmed modules are not modulepreload-ed', () => {
    for (const href of OFF_BOOT.preload) {
      assert.ok(!hrefs.includes(href), `index.html still modulepreloads '${href}'`);
    }
  });
});

describe('BOOT-TRIM: empty Home paints before the panda chunk', () => {
  const dash = stripComments(readText('js/dashboard.js'));

  test('_buildEmptyState stays synchronous', () => {
    assert.equal(
      /async\s+function\s+_buildEmptyState/.test(dash),
      false,
      'разметка пустого Home снова ждёт импорт: _buildEmptyState стал async'
    );
    assert.match(dash, /screen\.innerHTML\s*=\s*_buildEmptyState\(/);
    assert.equal(
      /screen\.innerHTML\s*=\s*await\s+_buildEmptyState\(/.test(dash),
      false,
      'load() снова await-ит разметку пустого Home'
    );
  });

  test('mascot hydration degrades instead of rejecting load()', () => {
    assert.match(dash, /async\s+function\s+_hydrateMascot/);
    // Тело берём окном по LF-нормализованному тексту: слайс по '\n  }\n'
    // зеленел бы в CI и краснел на CRLF-чекауте.
    const lf = dash.replace(/\r\n/g, '\n');
    const body = lf.slice(lf.indexOf('async function _hydrateMascot'));
    assert.match(
      body.slice(0, body.indexOf('\n  }\n') + 5),
      /catch/,
      '_hydrateMascot без catch: провал чанка панды роняет Home'
    );
  });
});

describe('BOOT-TRIM: empty Home video does not preload=auto', () => {
  test('dashboard.js and claude.view.js use preload=metadata, not auto', () => {
    const dash = stripComments(readText('js/dashboard.js'));
    const claude = stripComments(readText('js/claude.view.js'));
    assert.equal(dash.includes('preload="auto"'), false, 'dashboard.js still has preload="auto"');
    assert.equal(
      claude.includes('preload="auto"'),
      false,
      'claude.view.js still has preload="auto"'
    );
    assert.match(dash, /preload="metadata"/);
    assert.match(claude, /preload="metadata"/);
  });
});
