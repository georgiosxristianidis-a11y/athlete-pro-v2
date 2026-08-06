import fs from 'node:fs';
import path from 'node:path';
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

let allFiles = [...rootFiles];

dirsToScan.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = walkDir(dir);
    allFiles = allFiles.concat(files);
  }
});

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

// Clean paths to be web-friendly (forward slash) and filter out non-web files
const assetsArray = allFiles
  .map(f => '/' + f.replace(/\\/g, '/'))
  .filter(f => !f.includes('.DS_Store') && !f.endsWith('.map') && !f.endsWith('.md') && !f.endsWith('.d.ts'))
  .filter(f => !MEDIA_RE.test(f))
  .filter(f => !INSTALL_ICON_RE.test(f))
  .filter(f => !FONT_SUBSET_RE.test(f));

const newAssetsString = 'const ASSETS = [\n  ' + assetsArray.map(f => `'${f}'`).join(',\n  ') + '\n];';

const swPath = 'sw.js';
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace the ASSETS array in sw.js
swContent = swContent.replace(/const ASSETS = \[[\s\S]*?\];/, newAssetsString);

// Auto-bump CACHE_NAME from a content hash of the precache manifest.
// Guarantees the cache invalidates whenever any precached file changes —
// removes the manual-bump failure mode (field bug: phone stuck on old SW).
// Hashing rules (incl. why text assets are normalized to LF) — scripts/sw-digest.mjs.
const digest = computeDigest(assetsArray, fs.readFileSync);
swContent = swContent.replace(/const CACHE_NAME = '([^']+)';/, (_m, full) => {
  const base = full.replace(/-[0-9a-f]{8}$/, '');
  return `const CACHE_NAME = '${base}-${digest}';`;
});

fs.writeFileSync(swPath, swContent);

console.log(`[SW Build] Injected ${assetsArray.length} assets; CACHE_NAME digest ${digest}.`);
