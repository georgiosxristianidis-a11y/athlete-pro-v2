/* ════════════════════════════════════════════════════════
   sw.js — Athlete Pro | Block 7 (fixed)
   Service Worker: cache-first + offline fallback
════════════════════════════════════════════════════════ */

'use strict';

const CACHE_NAME = 'athlete-pro-v2';

const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/js/db.js',
  '/js/timer.js',
  '/js/dashboard.js',
  '/js/workout.js',
  '/js/analytics.js',
  '/js/profile.js',
  '/js/claude.js',
  '/js/body-stats.js',
  '/js/plate-calc.js',
  '/css/dashboard.css',
  '/css/workout.css',
  '/css/analytics.css',
  '/css/profile.css',
  '/css/claude.css',
  '/css/body-stats.css',
  '/icons/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

/* ── Install ── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
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

/* ── Fetch: cache-first, network fallback ── */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension')) return;

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
