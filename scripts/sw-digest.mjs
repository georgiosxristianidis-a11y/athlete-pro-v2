/**
 * Content digest of the service-worker precache manifest.
 *
 * Lives apart from build-sw.mjs for one reason: build-sw.mjs is a script with
 * top-level side effects (it rewrites sw.js on import), so nothing there can be
 * unit-tested. The digest is the part that must not drift, hence it is pure.
 *
 * Line endings must not leak into the digest. `core.autocrlf` is true and
 * .gitattributes carries no rule for *.css / *.js / *.html, so the working copy
 * is CRLF on Windows and LF on Linux/CI. Hashing raw bytes therefore gave two
 * different CACHE_NAMEs for the same commit (measured 2026-08-06 on one
 * checkout: a4e8351e as-on-disk, 8ee4c365 normalized). The service worker did
 * not care — any change of the string invalidates the cache equally — but the
 * digest stopped being a hash of the *content*: two agents on different OS ran
 * `npm run build:sw` over identical files and got a phantom diff in sw.js plus
 * noise on every rebase. In a repo worked by three agents at once that is a
 * recurring tax, so normalize CRLF -> LF before hashing.
 *
 * Binaries must never be normalized: a woff2/png byte sequence containing 0D 0A
 * is data, not a line break, and rewriting it would hash a file that does not
 * exist. Hence a whitelist of text extensions, not a blacklist of binary ones —
 * an unknown extension is treated as binary, which is the safe default (it only
 * costs the platform-stability we already had, it cannot corrupt anything).
 */
import crypto from 'node:crypto';

/** Extensions whose bytes are text and whose line endings are incidental. */
export const TEXT_ASSET_RE = /\.(?:html|htm|json|webmanifest|js|mjs|cjs|ts|css|svg|txt|xml)$/i;

/** Bytes of one asset as they should enter the hash: text normalized to LF, binaries untouched. */
export function bytesForHash(webPath, buf) {
  if (!TEXT_ASSET_RE.test(webPath)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

/**
 * sha1 over the sorted manifest: each web path, then its normalized content.
 * `readFile` takes a filesystem path (no leading slash) and returns a Buffer;
 * it may throw for a missing file — the path alone still enters the hash.
 */
export function computeDigest(assetPaths, readFile) {
  const hash = crypto.createHash('sha1');
  for (const webPath of [...assetPaths].sort()) {
    hash.update(webPath);
    try {
      hash.update(bytesForHash(webPath, readFile(webPath.slice(1))));
    } catch { /* missing file: path still hashed */ }
  }
  return hash.digest('hex').slice(0, 8);
}
