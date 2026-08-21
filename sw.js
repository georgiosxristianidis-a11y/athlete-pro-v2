/* ════════════════════════════════════════════════════════
   sw.js — Athlete Pro | Phase 1 architecture
   Service Worker: cache-first + offline fallback
   Privacy-aware: never caches /api/*. Honors air-gapped mode
   by short-circuiting all /api/* requests with 503.
════════════════════════════════════════════════════════ */

const CACHE_NAME = 'athlete-pro-v121-4a8ec60c';

/* ── Two-phase precache (card PRECACHE-1) ──
   ASSETS — бут-замыкание: то, что index.html просит сам на холодном старте
   (entry-скрипты, modulepreload, нелениво подключённые стили, шрифты, иконки).
   Только оно едет в `install`, то есть цена установки по сотовой = цена первого
   открытия, а не всего офлайн-набора.

   ASSETS_WARM — остальной офлайн: экраны, до которых пользователь может не
   дойти ни разу. Прогревается после `activate`, в фоне, не блокируя ни
   установку, ни навигацию. Офлайн полный — набор тот же, сдвинут во времени.

   Оба списка генерит `npm run build:sw` (scripts/build-sw.mjs), руками не
   трогать: сторожит test/sw-cache-name.test.js. */
const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/js/app.js',
  '/js/boot.js',
  '/js/claude.store.js',
  '/js/dashboard.js',
  '/js/db/backup.js',
  '/js/db/core.js',
  '/js/db/events.js',
  '/js/db/metrics.js',
  '/js/db/nutrition.js',
  '/js/db/onerm.js',
  '/js/db/planned.js',
  '/js/db/settings.js',
  '/js/db/workouts.js',
  '/js/db.js',
  '/js/events.js',
  '/js/features/pip.js',
  '/js/flags.js',
  '/js/island-profile.store.js',
  '/js/locale.store.js',
  '/js/privacy.store.js',
  '/js/privacy.view.js',
  '/js/profile.store.js',
  '/js/profile.view/lift-bars.js',
  '/js/rest-timer.js',
  '/js/shared/athlete-room.js',
  '/js/shared/chamber-pill.js',
  '/js/shared/confirm.js',
  '/js/shared/cryptoClient.js',
  '/js/shared/dynamic-island.js',
  '/js/shared/errors-ui.js',
  '/js/shared/exercise-shorthand.js',
  '/js/shared/format.js',
  '/js/shared/integrity.js',
  '/js/shared/island-tracker.js',
  '/js/shared/lazy-css.js',
  '/js/shared/lift-map.js',
  '/js/shared/panda-mood.js',
  '/js/shared/panda-video.js',
  '/js/shared/ppl-gauge.js',
  '/js/shared/sparkline.js',
  '/js/shared/spring.js',
  '/js/shared/sw-update.js',
  '/js/shared/sync-dot.js',
  '/js/shared/sync-secrets.js',
  '/js/shared/theme.js',
  '/js/shared/utils.js',
  '/js/shell.js',
  '/js/strength-engine.js',
  '/js/theme-boot.js',
  '/js/timer.js',
  '/js/ui/factory.js',
  '/js/version.js',
  '/js/workout.store.js',
  '/css/base.css',
  '/css/dashboard.css',
  '/icons/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-64.png',
  '/fonts/instrument-sans-latin.woff2',
  '/fonts/manrope-cyrillic.woff2',
  '/fonts/manrope-latin.woff2'
];

const ASSETS_WARM = [
  '/exercises-library.json',
  '/js/analytics.store.js',
  '/js/analytics.strength-curves.js',
  '/js/analytics.view.js',
  '/js/body-stats.core.js',
  '/js/body-stats.js',
  '/js/claude.view.js',
  '/js/features/wake-lock.js',
  '/js/insights.engine.js',
  '/js/intel.engine.js',
  '/js/intel.store.js',
  '/js/intel.view.js',
  '/js/island-settings.view.js',
  '/js/journal.store.js',
  '/js/journal.view.js',
  '/js/onboarding.js',
  '/js/plate-calc.js',
  '/js/profile.js',
  '/js/profile.view/bento.js',
  '/js/profile.view/hexagon-radar.js',
  '/js/profile.view/passport-hero.js',
  '/js/profile.view/settings.js',
  '/js/profile.view.js',
  '/js/progressive-overload.js',
  '/js/shared/air-markdown.js',
  '/js/shared/block-ticks.js',
  '/js/shared/csv-export.js',
  '/js/shared/download.js',
  '/js/shared/lww.js',
  '/js/shared/ppl-color.js',
  '/js/shared/sync-merge.js',
  '/js/shared/txt-export.js',
  '/js/supabase-check.js',
  '/js/supabase.js',
  '/js/sync.js',
  '/js/ui/drag-number.js',
  '/js/ui/drum-picker.js',
  '/js/ui/gravity-submit.js',
  '/js/ui/receipt.js',
  '/js/usage.js',
  '/js/workers/crypto.worker.js',
  '/js/workout-ai.view.js',
  '/js/workout.view/handlers.js',
  '/js/workout.view/modals.js',
  '/js/workout.view/render.js',
  '/js/workout.view/summary.js',
  '/js/workout.view.js',
  '/css/analytics.css',
  '/css/athlete-room.css',
  '/css/body-stats.css',
  '/css/claude.css',
  '/css/dynamic-island.css',
  '/css/intel.css',
  '/css/journal.css',
  '/css/privacy.css',
  '/css/profile.css',
  '/css/summary.css',
  '/css/workout.css',
  '/assets/panda-poster.jpg',
  '/fonts/orbitron-latin.woff2'
];

/* Media lives outside ASSETS (card F-7) — see scripts/build-sw.mjs. Kept in
   sync with the exclusion list there. */
const MEDIA_RE = /\.(?:mp4|webm|m4a|mp3|ogg|mov)$/i;

/* ── Privacy mode — synced from main thread via postMessage ── */
let privacyMode = 'cloud'; // default; updated when client posts message

self.addEventListener('message', (e) => {
  if (e.data?.type === 'privacy-mode') {
    privacyMode = e.data.mode || 'cloud';
  }
  // Honest "apply now" handshake: the page's Update action posts this so a
  // waiting SW activates immediately → activate/claim → controllerchange → reload.
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ── Concurrency-limited precache ──
   Adding ~90 assets with one fetch each, all at once, used to swamp the dev
   server right as the page made its own dynamic imports → aborted requests →
   failed module loads. Cap concurrency so install never starves page traffic. */
async function precache(cache, urls, concurrency = 6, skipCached = false) {
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        // Прогрев может стартовать заново после сна воркера (PRECACHE-1) —
        // без этой проверки он качал бы уже лежащее в кеше по второму разу.
        if (skipCached && await cache.match(url)) continue;
        await cache.add(url);
      }
      catch (err) { console.warn('SW cache add failed:', url, err); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/* ── Warm phase (PRECACHE-1) ──
   Второй список качается ПОСЛЕ активации и намеренно не висит в waitUntil:
   иначе воркер остаётся в состоянии `activating`, пока не докачает всё, а на
   это ждёт `navigator.serviceWorker.ready` — приватность (js/privacy.store.js)
   постит режим именно через него. Прогрев в фоне ничего не блокирует.

   Идемпотентно и самолечится: воркер могут усыпить посреди прогрева, поэтому
   первый же fetch добирает недокачанное, а неудача сбрасывает флаг — следующий
   запрос попробует снова. Что не успело лечь в кеш, всё равно ляжет туда через
   runtime-кеширование в fetch-обработчике. */
let warming = null;

function warmCache() {
  if (warming) return warming;
  warming = caches
    .open(CACHE_NAME)
    // Concurrency 2, не 6: прогрев идёт параллельно с живой навигацией, и его
    // задача — не мешать ей, а доехать.
    .then((cache) => precache(cache, ASSETS_WARM, 2, true))
    .catch((err) => {
      console.warn('SW warm precache failed:', err);
      warming = null;
    });
  return warming;
}

/* ── Install: precache the boot closure only, skip waiting ── */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => precache(cache, ASSETS)));
});

/* ── Activate: prune old caches, then warm the rest in the background ── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => { warmCache(); })
  );
});

/* ── Fetch: cache-first, network fallback. /api/* never cached. ── */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension')) return;

  // Воркер, разбуженный запросом после сна, продолжает прогрев с того места,
  // где его прервали (PRECACHE-1). Проверка — булев флаг, не работа.
  if (!warming) warmCache();

  const url = new URL(e.request.url);

  // /_vercel/* — платформенные эндпоинты (Web Analytics, js/usage.js). Мимо
  // воркера целиком: путь networkFirst закешировал бы script.js и после
  // отключения счётчика оффлайн-копия продолжила бы подниматься из кеша.
  if (url.pathname.startsWith('/_vercel/')) return;

  // Cross-origin (Google Fonts, jsDelivr CDN) → don't intercept; let the browser
  // fetch it directly. Routing opaque cross-origin responses through our
  // network-first/cache logic produced "FetchEvent ... network error" noise and
  // net::ERR_FAILED under Save-Data / adblock / offline.
  if (url.origin !== self.location.origin) return;

  const isApi = url.pathname.startsWith('/api/');

  if (isApi) {
    // Air-gapped mode: short-circuit /api/* with synthetic 503
    if (privacyMode === 'airgap') {
      e.respondWith(
        new Response(
          JSON.stringify({ error: 'air-gapped: network blocked', code: 'airgap' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      );
      return;
    }
    // Otherwise: pass through, never cache
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ error: 'network error' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // Normalize URL to prevent Cache DOS and O(N) lookup
  const cleanPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const cleanReq = new Request(url.origin + cleanPath);

  const dest = e.request.destination;
  // Code (JS/CSS/HTML) → network-first so refactors appear immediately instead
  // of being masked by a stale cache. Everything else (json/img/media/font) →
  // cache-first for speed; it rarely changes.
  const isCode = dest === 'script' || dest === 'style' || dest === 'document' ||
    /\.(?:js|mjs|css|html)$/.test(cleanPath);

  // Media is out of the precache (F-7) and gets its own cache-first path,
  // because a <video> asks with Range and the plain path would never store it.
  if (!isCode && (dest === 'video' || dest === 'audio' || MEDIA_RE.test(cleanPath))) {
    e.respondWith(mediaCacheFirst(e.request, cleanReq));
    return;
  }

  e.respondWith(isCode ? networkFirst(e.request, cleanReq, dest) : cacheFirst(e.request, cleanReq));
});

/* Cache a successful, non-private response without blocking the return. */
function maybeCache(response, cleanReq) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cacheControl = response.headers.get('cache-control') || '';
  if (cacheControl.includes('no-store') || response.headers.has('set-cookie')) return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(cleanReq, clone));
}

async function networkFirst(request, cleanReq, dest) {
  try {
    const response = await fetch(request);
    maybeCache(response, cleanReq);
    return response;
  } catch {
    const cached = await caches.match(cleanReq, { ignoreVary: true });
    if (cached) return cached;
    if (dest === 'document') {
      const fallback = await caches.match('/index.html', { ignoreVary: true });
      if (fallback) return fallback;
    }
    // Honest network failure — NOT a synthetic 408. A fake 408 made import()
    // fail hard with no retry; Response.error() surfaces the real condition.
    return Response.error();
  }
}

/* ── Media: cache-first, filled on first real playback ──
   Serving a whole cached 200 to a ranged request is what the precached videos
   already did before F-7 — the media element treats it as a non-seekable
   stream and plays it, so nothing about playback changes.
   Storing is the part that needs care: a media element asks with
   `Range: bytes=0-`, the server answers 206, and maybeCache() drops it
   (status !== 200). A 206 spanning the entire file is a complete body, so it
   is re-labelled 200 and stored under the range-free key; a genuinely partial
   response is left alone and the next full request warms the cache instead. */
async function mediaCacheFirst(request, cleanReq) {
  const cached = await caches.match(cleanReq, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    cacheWholeMedia(response, cleanReq);
    return response;
  } catch {
    return Response.error();
  }
}

function cacheWholeMedia(response, cleanReq) {
  if (!response || response.type === 'opaque') return;
  if (response.status === 200) { maybeCache(response, cleanReq); return; }
  if (response.status !== 206) return;
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!m || m[1] !== '0' || Number(m[2]) !== Number(m[3]) - 1) return;
  const clone = response.clone();
  clone.blob().then((body) => {
    const headers = new Headers(clone.headers);
    headers.delete('content-range');
    headers.set('content-length', String(body.size));
    return caches.open(CACHE_NAME).then((cache) =>
      cache.put(cleanReq, new Response(body, { status: 200, statusText: 'OK', headers }))
    );
  }).catch(() => { /* body already consumed or quota exceeded — stay uncached */ });
}

async function cacheFirst(request, cleanReq) {
  const cached = await caches.match(cleanReq, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    maybeCache(response, cleanReq);
    return response;
  } catch {
    return Response.error();
  }
}

/* ── Notifications — Background rest alarm ── */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
