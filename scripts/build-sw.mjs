import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeDigest } from './sw-digest.mjs';

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const rootFiles = ['index.html', 'manifest.json', 'exercises-library.json'];
const dirsToScan = ['js', 'css', 'icons', 'assets', 'fonts'];

// Media never rides in the precache (card F-7). Measured on prod: install
// pulled 4.15 MB, of which 3.11 MB was panda video — over cellular, in the
// background, before the mascot had ever been shown (and it lives behind the
// 'fab-video' flag, off by default). ~6 s on 6 Mbps LTE, ~22 s on a congested
// gym cell. The SW caches media at runtime on first real playback, so offline
// still works after one view; the poster stays precached for an instant frame.
const MEDIA_RE = /\.(?:mp4|webm|m4a|mp3|ogg|mov)$/i;

// Крупные иконки установки — по той же логике, что и медиа. Их читает ОС при
// установке PWA и разборе манифеста, а приложение в рантайме их не трогает: в
// UI живёт icon-64 (статус-бар) и icon-192 (favicon/og:image). Три штуки (384 · 512 · maskable-512)
// весят 564 КБ — прекеш с ними прыгал 1.46 → 2.02 МБ, мимо потолка 1.5 МБ,
// и каждый установивший тянул их дважды: один раз для ОС, второй в кеш.
const INSTALL_ICON_RE = /\/icons\/(?:icon-384|icon-512|icon-maskable-512)\.png$/i;

// Font subsets the UI never renders (LOAD-7). UI is RU/EN only — the browser
// already skips these via @font-face unicode-range, but the SW precached them
// anyway. Not deleted from the repo: sw.js fetch handler cache-firsts fonts
// like media (F-7), so a stray Greek/Vietnamese/diacritic glyph still warms
// the cache and works offline after the first real render. latin-ext is
// included deliberately despite carrying Latin diacritics (exercise/gym
// names) — same runtime-fallback safety net, not a functional loss.
const FONT_SUBSET_RE = /\/fonts\/(?:manrope-(?:greek|vietnamese|latin-ext|cyrillic-ext)|instrument-sans-latin-ext)\.woff2$/i;

/**
 * The precache manifest as web paths, exactly as it lands in ASSETS.
 * Exported because the staleness guard (test/sw-cache-name.test.js, card O-8)
 * has to rebuild the manifest with *this* logic — a second copy of the rules
 * would drift from this one and start lying green.
 */
export function collectAssets(root = process.cwd()) {
  let allFiles = rootFiles.map((f) => path.join(root, f));

  dirsToScan.forEach((dir) => {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) allFiles = allFiles.concat(walkDir(abs));
  });

  // Clean paths to be web-friendly (forward slash) and filter out non-web files
  return allFiles
    .map((f) => '/' + path.relative(root, f).replace(/\\/g, '/'))
    .filter(f => !f.includes('.DS_Store') && !f.endsWith('.map') && !f.endsWith('.md') && !f.endsWith('.d.ts'))
    .filter(f => !MEDIA_RE.test(f))
    .filter(f => !INSTALL_ICON_RE.test(f))
    .filter(f => !FONT_SUBSET_RE.test(f));
}

/** sha1 of the manifest, platform-independent — rules in scripts/sw-digest.mjs. */
export function digestFor(assetsArray, root = process.cwd()) {
  return computeDigest(assetsArray, (p) => fs.readFileSync(path.join(root, p)));
}

/**
 * sw.js with ASSETS and CACHE_NAME replaced. Pure: takes the current source,
 * returns the new one. The guard compares its output with the file on disk.
 */
export function renderSw(swSource, assetsArray, digest) {
  const newAssetsString = 'const ASSETS = [\n  ' + assetsArray.map(f => `'${f}'`).join(',\n  ') + '\n];';
  let out = swSource.replace(/const ASSETS = \[[\s\S]*?\];/, newAssetsString);

  // Auto-bump CACHE_NAME from a content hash of the precache manifest.
  // Guarantees the cache invalidates whenever any precached file changes —
  // removes the manual-bump failure mode (field bug: phone stuck on old SW).
  out = out.replace(/const CACHE_NAME = '([^']+)';/, (_m, full) => {
    const base = full.replace(/-[0-9a-f]{8}$/, '');
    return `const CACHE_NAME = '${base}-${digest}';`;
  });
  return out;
}

/** Everything the CLI does, minus the write — so the guard can ask "is this what's on disk?". */
export function buildSw(root = process.cwd()) {
  const swPath = path.join(root, 'sw.js');
  const assets = collectAssets(root);
  const digest = digestFor(assets, root);
  return {
    assets,
    digest,
    swPath,
    current: fs.readFileSync(swPath, 'utf8'),
    get expected() { return renderSw(this.current, assets, digest); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const built = buildSw();
  fs.writeFileSync(built.swPath, built.expected);
  console.log(`[SW Build] Injected ${built.assets.length} assets; CACHE_NAME digest ${built.digest}.`);
}
