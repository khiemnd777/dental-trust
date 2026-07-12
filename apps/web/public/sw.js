const VERSION = 'dental-trust-public-v1';
const PUBLIC_SHELL = [
  '/vi',
  '/en',
  '/vi/clinics',
  '/en/clinics',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];
const PRIVATE_PATH = /^\/(?:vi|en)\/(?:app|clinic|concierge|verification-admin|admin|auth)(?:\/|$)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PUBLIC_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    PRIVATE_PATH.test(url.pathname) ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) => cached || caches.match(url.pathname.startsWith('/en') ? '/en' : '/vi'),
            ),
        ),
    );
  }
});
