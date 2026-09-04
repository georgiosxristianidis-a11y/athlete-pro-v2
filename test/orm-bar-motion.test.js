/**
 * Guard: 1RM bars (`.orm-bar-fill`) are Spring-driven. A CSS `transition` on
 * the same `transform` restarts every spring frame — the dual-driver bug that
 * 1.27.89 (body-metrics sheet) and 1.27.90 (confirm) already closed elsewhere.
 *
 * Keep Spring.animate in dashboard.js / analytics.view.js. Do not put
 * `transition: transform` back on `.orm-bar-fill`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(REPO_ROOT, 'css');
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Every `.orm-bar-fill { ... }` body across css/*.css. */
function ormBarFillBodies() {
  const files = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
  const out = [];
  for (const file of files) {
    const css = stripComments(readFileSync(path.join(CSS_DIR, file), 'utf8'));
    const re = /\.orm-bar-fill\b[^{]*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      out.push({ file, body: m[1], line: css.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

/** Spring.animate that writes transform, within a window after the bar id. */
function springDrivesBar(src, getterNeedle) {
  const idx = src.indexOf(getterNeedle);
  if (idx < 0) return { found: false, animates: false, writesTransform: false };
  const window = src.slice(idx, idx + 800);
  return {
    found: true,
    animates: /Spring\.animate\s*\(/.test(window),
    writesTransform: /bar\.style\.transform/.test(window),
  };
}

test('.orm-bar-fill has no CSS transition on transform (Spring is the only driver)', () => {
  const rules = ormBarFillBodies();
  assert.ok(rules.length > 0, '.orm-bar-fill пропал из css/ — бары 1RM без правила');

  const fights = rules.filter(({ body }) =>
    /transition(?:-property)?\s*:[^;]*\b(?:transform|all)\b/.test(body)
  );
  assert.deepEqual(
    fights,
    [],
    'CSS transition на transform снова введёт dual-driver со Spring:\n' +
      fights.map((f) => `  ${f.file}:${f.line}`).join('\n')
  );
});

test('.orm-bar-fill still starts at scaleX(0) so Spring has a from-state', () => {
  const rules = ormBarFillBodies();
  const withOrigin = rules.filter(({ body }) => /transform\s*:\s*scaleX\(\s*0\s*\)/.test(body));
  assert.ok(
    withOrigin.length > 0,
    'начальный transform: scaleX(0) снят — бар вспыхнет на полной ширине до первого кадра Spring'
  );
});

test('dashboard 1RM bars still animate via Spring.animate → transform', () => {
  const src = read('js/dashboard.js');
  const hit = springDrivesBar(src, 'getElementById(`dash-orm-bar-${i}`)');
  assert.ok(hit.found, 'dash-orm-bar id пропал из dashboard.js');
  assert.ok(hit.animates, 'Spring.animate на дашборд-барах 1RM снят — карточка велела оставить');
  assert.ok(hit.writesTransform, 'Spring больше не пишет bar.style.transform на дашборд-барах');
});

test('analytics 1RM bars still animate via Spring.animate → transform', () => {
  const src = read('js/analytics.view.js');
  const hit = springDrivesBar(src, 'getElementById(`an-orm-bar-${i}`)');
  assert.ok(hit.found, 'an-orm-bar id пропал из analytics.view.js');
  assert.ok(hit.animates, 'Spring.animate на Stats-барах 1RM снят — карточка велела оставить');
  assert.ok(hit.writesTransform, 'Spring больше не пишет bar.style.transform на Stats-барах');
});
