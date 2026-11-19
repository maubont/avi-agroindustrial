'use strict';

const CACHE_NAME = 'avi-alejandra-shell-v2';
const SHELL_ASSETS = [
  '/',
  '/styles.css',
  '/app.js',
  '/shared/causal-twin-engine.js',
  '/manifest.json',
  '/icons/avi-icon.svg',
  '/icons/avi-icon-192.png',
  '/icons/avi-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/events' || url.pathname === '/health') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && SHELL_ASSETS.includes(url.pathname)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
