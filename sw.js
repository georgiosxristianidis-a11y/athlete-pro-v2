/* ════════════════════════════════════════════════════════
   sw.js — Athlete Pro | Phase 1 architecture
   Service Worker: cache-first + offline fallback
   Privacy-aware: never caches /api/*. Honors air-gapped mode
   by short-circuiting all /api/* requests with 503.
════════════════════════════════════════════════════════ */

const CACHE_NAME = 'athlete-pro-v93';

// eslint-disable-next-line no-unused-vars
const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/exercises-library.json',
  '/js/analytics.store.js',
  '/js/analytics.strength-curves.js',
  '/js/analytics.view.js',
  '/js/app.js',
  '/js/body-stats.js',
  '/js/boot.js',
  '/js/claude.store.js',
  '/js/claude.view.js',
  '/js/dashboard.js',
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
  '/js/features/wake-lock.js',
  '/js/flags.js',
  '/js/insights.engine.js',
  '/js/intel.store.js',
  '/js/intel.view.js',
  '/js/locale.store.js',
  '/js/onboarding.js',
  '/js/plate-calc.js',
  '/js/privacy.store.js',
  '/js/privacy.view.js',
  '/js/profile.js',
  '/js/profile.store.js',
  '/js/profile.view/bento.js',
  '/js/profile.view/hexagon-radar.js',
  '/js/profile.view/lift-bars.js',
  '/js/profile.view/passport-hero.js',
  '/js/profile.view/settings.js',
  '/js/profile.view.js',
  '/js/progressive-overload.js',
  '/js/rest-timer.js',
  '/js/shared/athlete-room.js',
  '/js/shared/chamber-pill.js',
  '/js/shared/confirm.js',
  '/js/shared/cryptoClient.js',
  '/js/shared/csv-export.js',
  '/js/shared/dynamic-island.js',
  '/js/shared/errors-ui.js',
  '/js/shared/format.js',
  '/js/shared/integrity.js',
  '/js/shared/island-tracker.js',
  '/js/shared/lww.js',
  '/js/shared/ppl-gauge.js',
  '/js/shared/sparkline.js',
  '/js/shared/spring.js',
  '/js/shared/sync-dot.js',
  '/js/shared/sync-merge.js',
  '/js/shared/utils.js',
  '/js/shell.js',
  '/js/strength-engine.js',
  '/js/supabase-check.js',
  '/js/supabase.js',
  '/js/sync.js',
  '/js/timer.js',
  '/js/types.d.ts',
  '/js/ui/drag-number.js',
  '/js/ui/drum-picker.js',
  '/js/ui/factory.js',
  '/js/ui/gravity-submit.js',
  '/js/ui/receipt.js',
  '/js/version.js',
  '/js/workers/crypto.worker.js',
  '/js/workout-ai.view.js',
  '/js/workout-plans.js',
  '/js/workout.store.js',
  '/js/workout.view/handlers.js',
  '/js/workout.view/modals.js',
  '/js/workout.view/render.js',
  '/js/workout.view/summary.js',
  '/js/workout.view.js',
  '/css/analytics.css',
  '/css/athlete-room.css',
  '/css/base.css',
  '/css/body-stats.css',
  '/css/claude.css',
  '/css/dashboard.css',
  '/css/dynamic-island.css',
  '/css/intel.css',
  '/css/privacy.css',
  '/css/profile.css',
  '/css/summary.css',
  '/css/workout.css',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/legs.svg',
  '/icons/pull.svg',
  '/icons/push.svg',
  '/assets/panda-idle.mp4',
  '/assets/panda-idle.webm'
];

/* ── Privacy mode — synced from main thread via postMessage ── */
let privacyMode = 'cloud'; // default; updated when client posts message

self.addEventListener('message', (e) => {
  if (e.data?.type === 'privacy-mode') {
    privacyMode = e.data.mode || 'cloud';
  }
});

/* ── Concurrency-limited precache ──
   Adding ~90 assets with one fetch each, all at once, used to swamp the dev
   server right as the page made its own dynamic imports → aborted requests →
   failed module loads. Cap concurrency so install never starves page traffic. */
async function precache(cache, urls, concurrency = 6) {
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try { await cache.add(url); }
      catch (err) { console.warn('SW cache add failed:', url, err); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/* ── Install: Precache all assets and skip waiting ── */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => precache(cache, ASSETS)));
});

/* ── Activate: prune old caches ── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first, network fallback. /api/* never cached. ── */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension')) return;

  const url = new URL(e.request.url);

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
