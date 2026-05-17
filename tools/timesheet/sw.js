---
# Front matter makes Jekyll render this file. `site.time` is the build time,
# so every GitHub Pages deploy gets a fresh CACHE_VERSION automatically.
---
// Timesheet service worker — cache-first for app shell.
// CACHE_VERSION is injected at build time by Jekyll/GitHub Pages.

const CACHE_VERSION = 'timesheet-{{ site.time | date: "%s" }}';
const APP_SHELL = [
  './',
  './index.html',
  './pico.min.css',
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
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.ok && new URL(event.request.url).origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
