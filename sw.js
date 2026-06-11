/* ════════════════════════════════════════════════════════
   sw.js — Athlete Pro | Phase 1 architecture
   Service Worker: cache-first + offline fallback
   Privacy-aware: never caches /api/*. Honors air-gapped mode
   by short-circuiting all /api/* requests with 503.
════════════════════════════════════════════════════════ */

const CACHE_NAME = 'athlete-pro-v40';

// eslint-disable-next-line no-unused-vars
const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/exercises-library.json',
  '/js/app.js',
  '/js/shell.js',
  '/js/db.js',
  '/js/workout-plans.js',
  '/js/version.js',
  '/js/sync.js',
  '/js/locale.store.js',
  '/js/supabase-check.js',
  '/js/timer.js',
  '/js/rest-timer.js',
  '/js/dashboard.js',
  '/js/workout.store.js',
  '/js/workout.view.js',
  '/js/analytics.store.js',
  '/js/analytics.view.js',
  '/js/claude.store.js',
  '/js/claude.view.js',
  '/js/profile.js',
  '/js/profile.store.js',
  '/js/profile.view.js',
  '/js/profile.view/passport-hero.js',
  '/js/profile.view/bento.js',
  '/js/profile.view/hexagon-radar.js',
  '/js/profile.view/lift-bars.js',
  '/js/privacy.store.js',
  '/js/privacy.view.js',
  '/js/strength-engine.js',
  '/js/insights.engine.js',
  '/js/progressive-overload.js',
  '/js/supabase.js',
  '/js/workout-ai.view.js',
  '/js/intel.store.js',
  '/js/intel.view.js',
  '/js/shared/dynamic-island.js',
  '/js/body-stats.js',
  '/js/plate-calc.js',
  '/js/ui/drum-picker.js',
  '/js/onboarding.js',
  '/js/features/wake-lock.js',
  '/css/base.css',
  '/css/dashboard.css',
  '/css/workout.css',
  '/css/analytics.css',
  '/css/profile.css',
  '/css/claude.css',
  '/css/body-stats.css',
  '/css/intel.css',
  '/assets/panda-idle.mp4',
  '/assets/panda-idle.webm',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/push.svg',
  '/icons/pull.svg',
  '/icons/legs.svg',
];

/* ── Privacy mode — synced from main thread via postMessage ── */
let privacyMode = 'cloud'; // default; updated when client posts message

self.addEventListener('message', (e) => {
  if (e.data?.type === 'privacy-mode') {
    privacyMode = e.data.mode || 'cloud';
  }
});

/* ── Install: Precache all assets and skip waiting ── */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use allSettled so one missing file doesn't crash the whole cache
      return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(err => console.warn('SW cache add failed:', url, err))));
    })
  );
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

  // Static assets: cache-first
  // Solid 9 Fix: Normalize URL to prevent Cache DOS and O(N) lookup
  const parsedUrl = new URL(e.request.url);
  const cleanPath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  const cleanReq = new Request(parsedUrl.origin + cleanPath);

  e.respondWith(
    caches.match(cleanReq).then((cached) => {
      if (cached) return cached;

      return fetch(e.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const cacheControl = response.headers.get('cache-control') || '';
          if (cacheControl.includes('no-store') || response.headers.has('set-cookie')) {
            return response; // Protect against Web Cache Poisoning
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cleanReq, clone));
          return response;
        })
        .catch(async () => {
          if (e.request.destination === 'document') {
            const fallback = await caches.match('/index.html');
            return fallback || new Response('Offline', { status: 200, headers: {'Content-Type': 'text/html'} });
          }
          return new Response('Network error', { status: 408 });
        });
    })
  );
});

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
