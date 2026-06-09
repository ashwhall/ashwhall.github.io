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

  const sameOrigin = new URL(req.url).origin === location.origin;

  // App shell = our own HTML/JS/CSS. Served network-first so a deploy lands on
  // the next online load, not after the service worker swaps itself. Cache is
  // the offline fallback only.
  const isShell =
    sameOrigin &&
    (req.mode === 'navigate' ||
      req.destination === 'document' ||
      req.destination === 'script' ||
      req.destination === 'style');

  if (isShell) {
    event.respondWith(
      // `no-cache` forces revalidation (ETag), so GitHub Pages' HTTP cache
      // can't hand back a stale asset behind our back.
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((c) => c || caches.match('./index.html')),
        ),
    );
    return;
  }

  // Cache-first for everything else (icons, fonts, third-party) — rarely
  // changes, and speed/offline matter more than instant freshness.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Opportunistically cache same-origin assets we didn't pre-list.
          if (res.ok && sameOrigin) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
