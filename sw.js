// Prime — service worker
// Bump CACHE_VERSION on every deploy that changes cached files.
const CACHE_VERSION = 'prime-v4';
const CACHE_NAME = `prime-cache-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  // {cache:'reload'} bypasses the browser's own HTTP cache for these fetches, so a fresh
  // install always pulls the real current files rather than whatever the browser happened
  // to have cached from a previous visit (see note on the fetch handler below for why this
  // matters).
  const coreRequests = CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(coreRequests))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('prime-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Lets the page force an already-installed-but-waiting worker to activate immediately,
// used by the "Sprawdź aktualizację" button in Settings so updating doesn't depend on
// the browser's own background timing.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Cache-first would mean a deploy fix can stay invisible for an extra reload or more (the
// browser only checks sw.js itself for changes, and control only transfers to a new worker
// after activation completes — by then the page has usually already loaded from the old
// worker's cache). Network-first avoids that entirely: whenever the device is online, the
// freshest files are always used, and the cache is refreshed alongside; offline, it falls
// back to whatever was last cached, so the app still works with no signal.
//
// `cache: 'no-store'` on the fetch itself is important, not just cosmetic: a plain fetch()
// still consults the browser's own HTTP cache (separate from the Cache Storage this worker
// manages), so without it a host that doesn't send strict Cache-Control headers could still
// hand back a stale response even though this code is asking the network fresh every time.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const freshReq = new Request(req, { cache: 'no-store' });

  event.respondWith(
    fetch(freshReq)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
