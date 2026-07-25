#!/usr/bin/env node
/* ════════════════════════════════════════════════════════
   smoke-prod.mjs — прод-зонд после релиза (карточка O-2)

   Отвечает на один вопрос: релиз ДОЕХАЛ до прода или нет.
   Ненулевой exit = не доехал (или доехал сломанным кешем).

   Проверяет:
     1. /js/version.js  → VERSION == package.json (релиз на месте)
     2. /js/version.js  → нет ETag/Last-Modified + no-cache (корень 304-заморозки)
     3. /                → no-store, без валидаторов (app shell не морозится)
     4. /assets/*        → ETag + max-age, условный запрос даёт 304 (медиа не качается заново)
     5. /sw.js           → CACHE_NAME совпал с репом (SW-бамп доехал)

   Запуск:
     npm run smoke:prod
     node scripts/smoke-prod.mjs https://staging.example.app
     node scripts/smoke-prod.mjs --wait 180   # поллить, пока Vercel докатывает
   ════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://athlete-pro-v7.vercel.app';
const MEDIA_PATH = '/assets/panda-poster.jpg';

// ── args: [url] [--wait <sec>]
const argv = process.argv.slice(2);
let baseUrl = process.env.PROD_URL || DEFAULT_URL;
let waitSec = 0;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--wait') waitSec = Number(argv[++i] ?? 0);
  else if (a.startsWith('--wait=')) waitSec = Number(a.slice(7));
  else if (!a.startsWith('--')) baseUrl = a;
}
baseUrl = baseUrl.replace(/\/+$/, '');

// ── ожидания берём из рабочего дерева, а не из головы
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const localVersionSrc = fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8');
const localVersion = localVersionSrc.match(/VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const localCacheName = fs
  .readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  .match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/)?.[1];

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const fail = (name, detail) => results.push({ name, pass: false, detail });

async function get(pathname, headers = {}) {
  const res = await fetch(baseUrl + pathname, {
    headers: { 'Cache-Control': 'no-cache', ...headers },
    redirect: 'follow',
  });
  return { res, body: res.body ? await res.text() : '' };
}

const hasMaxAge = (cc) => /max-age=(\d+)/.test(cc) && Number(cc.match(/max-age=(\d+)/)[1]) > 0;

async function runChecks() {
  results.length = 0;

  // 0. локальная сверка: version.js и package.json не разъехались
  if (localVersion && localVersion === pkg.version) {
    ok('local: version.js == package.json', localVersion);
  } else {
    fail('local: version.js == package.json', `version.js=${localVersion} package.json=${pkg.version}`);
  }

  // 1-2. код: свежая версия + никаких валидаторов
  try {
    const { res, body } = await get('/js/version.js');
    const prodVersion = body.match(/VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const cc = res.headers.get('cache-control') || '';
    const etag = res.headers.get('etag');
    const lastMod = res.headers.get('last-modified');

    if (res.status !== 200) fail('prod: /js/version.js 200', `HTTP ${res.status}`);
    else if (prodVersion === localVersion) ok('prod: VERSION совпал', prodVersion);
    else fail('prod: VERSION совпал', `прод=${prodVersion} ожидали=${localVersion} — релиз не доехал`);

    if (!etag && !lastMod && cc.includes('no-cache')) {
      ok('prod: код без валидаторов', `cache-control: ${cc}`);
    } else {
      fail(
        'prod: код без валидаторов',
        `etag=${etag ?? '—'} last-modified=${lastMod ?? '—'} cache-control=${cc || '—'} — риск 304-заморозки`
      );
    }
  } catch (e) {
    fail('prod: /js/version.js', e.message);
  }

  // 3. app shell: no-store, без валидаторов
  try {
    const { res } = await get('/');
    const cc = res.headers.get('cache-control') || '';
    const etag = res.headers.get('etag');
    const lastMod = res.headers.get('last-modified');
    if (res.status === 200 && cc.includes('no-store') && !etag && !lastMod) {
      ok('prod: index.html no-store', `cache-control: ${cc}`);
    } else {
      fail(
        'prod: index.html no-store',
        `HTTP ${res.status} cache-control=${cc || '—'} etag=${etag ?? '—'} last-modified=${lastMod ?? '—'}`
      );
    }
  } catch (e) {
    fail('prod: index.html', e.message);
  }

  // 4. медиа: ETag + max-age, условный запрос → 304
  try {
    const { res } = await get(MEDIA_PATH);
    const cc = res.headers.get('cache-control') || '';
    const etag = res.headers.get('etag');
    if (res.status !== 200) {
      fail('prod: медиа 200', `${MEDIA_PATH} → HTTP ${res.status}`);
    } else if (!etag || !hasMaxAge(cc)) {
      fail('prod: медиа ETag + max-age', `etag=${etag ?? '—'} cache-control=${cc || '—'} — перекачка вместо 304`);
    } else {
      ok('prod: медиа ETag + max-age', `${etag} · ${cc}`);
      const cond = await fetch(baseUrl + MEDIA_PATH, { headers: { 'If-None-Match': etag } });
      if (cond.status === 304) ok('prod: медиа условный → 304', 'If-None-Match');
      else fail('prod: медиа условный → 304', `HTTP ${cond.status} — тело качается целиком`);
    }
  } catch (e) {
    fail('prod: медиа', e.message);
  }

  // 5. service worker: CACHE_NAME доехал
  try {
    const { res, body } = await get('/sw.js');
    const prodCache = body.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/)?.[1];
    if (res.status !== 200) fail('prod: /sw.js 200', `HTTP ${res.status}`);
    else if (prodCache && prodCache === localCacheName) ok('prod: CACHE_NAME совпал', prodCache);
    else fail('prod: CACHE_NAME совпал', `прод=${prodCache ?? '—'} ожидали=${localCacheName ?? '—'}`);
  } catch (e) {
    fail('prod: /sw.js', e.message);
  }

  return results.every((r) => r.pass);
}

function report(passed) {
  console.log(`\nПрод-смоук: ${baseUrl}\n`);
  for (const r of results) {
    console.log(`  ${r.pass ? 'OK  ' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(
    passed
      ? `\nЗелёный: релиз ${localVersion} на проде, кеш-политика цела.\n`
      : `\nКрасный: релиз НЕ подтверждён. Ожидали ${localVersion} / ${localCacheName}.\n`
  );
}

const deadline = Date.now() + waitSec * 1000;
let passed = await runChecks();
while (!passed && Date.now() < deadline) {
  const left = Math.ceil((deadline - Date.now()) / 1000);
  console.log(`  … прод ещё не догнал, ретрай через 15с (осталось ~${left}с)`);
  await new Promise((r) => setTimeout(r, 15000));
  passed = await runChecks();
}

report(passed);
process.exit(passed ? 0 : 1);
