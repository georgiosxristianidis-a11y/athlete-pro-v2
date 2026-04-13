const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readJson(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function readText(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  return fs.readFileSync(abs, 'utf8');
}

test('manifest.json has required PWA fields', () => {
  const manifest = readJson('manifest.json');

  assert.ok(manifest.name);
  assert.ok(manifest.short_name);
  assert.ok(manifest.start_url);
  assert.ok(manifest.display);
  assert.ok(manifest.theme_color);

  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 1);
  for (const icon of manifest.icons) {
    assert.ok(icon.src);
    assert.ok(icon.sizes);
  }
});

test('sw.js contains core service worker handlers', () => {
  const sw = readText('sw.js');
  assert.match(sw, /addEventListener\(['"]install['"]/);
  assert.match(sw, /addEventListener\(['"]activate['"]/);
  assert.match(sw, /addEventListener\(['"]fetch['"]/);
  assert.match(sw, /caches\.open\(/);
});
