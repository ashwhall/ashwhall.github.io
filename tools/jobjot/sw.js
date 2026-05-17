---
# Front matter makes Jekyll render this file. `site.time` is the build time,
# so every GitHub Pages deploy gets a fresh CACHE_VERSION automatically.
---
// JobJot service worker — cache-first for app shell.
// CACHE_VERSION is injected at build time by Jekyll/GitHub Pages.

const CACHE_VERSION = 'jobjot-{{ site.time | date: "%s" }}';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './pico.min.css',
  './app.js',
  './manifest.json',
  './build.json',
  '/public/favicon.ico',
  '/public/favicon-16x16.png',
  '/public/favicon-32x32.png',
  '/public/favicon-192x192.png',
  '/public/favicon-512x512.png',
  '/public/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNav = req.mode === 'navigate' || req.destination === 'document';

  if (isNav) {
    // Network-first for HTML so deployed updates land on the next online visit.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Opportunistically cache same-origin assets we didn't pre-list.
          if (res.ok && new URL(req.url).origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
