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
// apple-touch-icon (7.5 КБ) — та же порода: его читает iOS в момент «на
// экран Домой», в рантайме приложение его не рисует. Выселен, когда SEO-мета
// (title/og/JSON-LD) добила прекеш до потолка 1.55 МБ: платить лишним
// килобайтом установки за иконку, которую никто не запрашивает из UI, дороже.
const INSTALL_ICON_RE = /\/icons\/(?:icon-384|icon-512|icon-maskable-512|apple-touch-icon)\.png$/i;

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

/**
 * Boot closure: what index.html itself asks the browser for on a cold first
 * load — entry scripts, every `modulepreload`, the render-blocking stylesheets,
 * preloaded fonts, the manifest and the favicons.
 *
 * Derived from the HTML instead of a hand-kept list on purpose (card PRECACHE-1):
 * a second copy of "what boots the app" would drift away from the file that
 * actually decides it, and drift would show up as a blank screen offline, not
 * as a red test. Anything declared with `data-lazy` (print-media stylesheets
 * swapped in by shared/lazy-css.js) is not boot — it is warm.
 *
 * Only paths that are already in the precache manifest survive: an asset the
 * OS reads but the UI never renders (apple-touch-icon, INSTALL_ICON_RE) stays
 * out of both phases.
 */
export function collectBootAssets(root = process.cwd(), assets = collectAssets(root)) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const inManifest = new Set(assets);
  // index.html — сам источник списка; icon-64 рисует JS статус-бара с первого
  // кадра, но в разметке его нет, так что вывести из HTML его нельзя.
  const boot = new Set(['/index.html', '/icons/icon-64.png']);

  const add = (href) => {
    // Только свои относительные пути: внешний и data: URL в прекеше не живут.
    if (!href || href.startsWith('//') || href.startsWith('data:')) return;
    if (/^https?:/.test(href)) return;
    const web = '/' + href.replace(/^\//, '');
    if (inManifest.has(web)) boot.add(web);
  };

  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = m[0];
    if (/\bdata-lazy\b/.test(tag)) continue;
    if (!/\brel="(?:stylesheet|modulepreload|manifest|icon|preload)"/.test(tag)) continue;
    add(/\bhref="([^"]+)"/.exec(tag)?.[1]);
  }

  // Manifest order, not insertion order — the two lists stay diff-friendly.
  return assets.filter((f) => boot.has(f));
}

/** Everything else: full offline coverage, fetched after activate, not during install. */
export function splitAssets(root = process.cwd()) {
  const assets = collectAssets(root);
  const boot = collectBootAssets(root, assets);
  const bootSet = new Set(boot);
  return { assets, boot, warm: assets.filter((f) => !bootSet.has(f)) };
}

/** sha1 of the manifest, platform-independent — rules in scripts/sw-digest.mjs. */
export function digestFor(assetsArray, root = process.cwd()) {
  return computeDigest(assetsArray, (p) => fs.readFileSync(path.join(root, p)));
}

const listBlock = (name, arr) =>
  `const ${name} = [\n  ` + arr.map(f => `'${f}'`).join(',\n  ') + '\n];';

/**
 * sw.js with ASSETS, ASSETS_WARM and CACHE_NAME replaced. Pure: takes the
 * current source, returns the new one. The guard compares its output with the
 * file on disk.
 *
 * `split` is `{ boot, warm }` from splitAssets(): ASSETS is the install phase,
 * ASSETS_WARM the post-activate one (card PRECACHE-1).
 */
export function renderSw(swSource, split, digest) {
  let out = swSource.replace(/const ASSETS = \[[\s\S]*?\];/, listBlock('ASSETS', split.boot));
  out = out.replace(/const ASSETS_WARM = \[[\s\S]*?\];/, listBlock('ASSETS_WARM', split.warm));

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
  const split = splitAssets(root);
  // Digest covers the whole offline set, not just the install phase: moving a
  // file between the phases must invalidate the cache too.
  const digest = digestFor(split.assets, root);
  return {
    assets: split.assets,
    boot: split.boot,
    warm: split.warm,
    digest,
    swPath,
    current: fs.readFileSync(swPath, 'utf8'),
    get expected() { return renderSw(this.current, split, digest); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const built = buildSw();
  fs.writeFileSync(built.swPath, built.expected);
  console.log(
    `[SW Build] Injected ${built.boot.length} boot assets + ${built.warm.length} warm; ` +
    `CACHE_NAME digest ${built.digest}.`
  );
}
