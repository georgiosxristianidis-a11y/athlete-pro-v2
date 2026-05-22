/* ════════════════════════════════════════════════════════
   sw.js — Athlete Pro | Phase 1 architecture
   Service Worker: cache-first + offline fallback
   Privacy-aware: never caches /api/*. Honors air-gapped mode
   by short-circuiting all /api/* requests with 503.
════════════════════════════════════════════════════════ */

const CACHE_NAME = 'athlete-pro-v12';

const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/exercises-library.json',
  '/js/app.js',
  '/js/shell.js',
  '/js/db.js',
  '/js/db-firebase.js',
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
  '/js/body-stats.js',
  '/js/plate-calc.js',
  '/js/ui/drum-picker.js',
  '/js/onboarding.js',
  '/css/base.css',
  '/css/dashboard.css',
  '/css/workout.css',
  '/css/analytics.css',
  '/css/profile.css',
  '/css/claude.css',
  '/css/body-stats.css',
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

/* ── Install: skip waiting immediately to force new version ── */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.delete('/index.html').catch(() => {}))
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
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => {
          if (e.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
