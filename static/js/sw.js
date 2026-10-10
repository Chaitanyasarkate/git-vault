/**
 * Git-Vault Progressive Web App (PWA) Service Worker
 * Provides offline caching for application shell, static assets, and instant startup.
 */

const CACHE_NAME = 'git-vault-shell-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/static/css/gitpass.css',
  '/static/js/gitpass.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // NEVER cache POST requests or sensitive dynamic API/auth endpoints
  if (req.method !== 'GET') {
    return;
  }
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/vault/export') ||
    url.pathname.includes('/vault/raw') ||
    url.pathname.includes('/health')
  ) {
    return;
  }

  // Cache-first for static assets
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        return cached || fetch(req).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for navigation HTML
  event.respondWith(
    fetch(req).catch(() => {
      return caches.match(req).then((cached) => {
        return cached || caches.match('/');
      });
    })
  );
});
