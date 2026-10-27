// Prime Life Maxing — service worker
// Bump CACHE_VERSION on every deploy that changes any cached file.
const CACHE_VERSION = 'plm-v2';
const CACHE_NAME = `prime-cache-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

// Must all exist: the app cannot start without them.
const CORE = [
  './', './index.html', './css/style.css',
  './js/dates.js', './js/schema.js', './js/storage.js', './js/state.js', './js/ui.js', './js/charts.js',
  './js/nutrition.js', './js/habits.js', './js/workouts.js', './js/growth.js', './js/social.js', './js/finance.js',
  './js/photos.js', './js/gamification.js', './js/lifemax.js', './js/trackers.js', './js/today.js',
  './js/goals.js', './js/life.js', './js/stats.js', './js/settings.js', './js/app.js',
];
// Nice to have: a missing one must not break the install.
const OPTIONAL = ['./manifest.json', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  // No skipWaiting() here: the page asks for it (SKIP_WAITING) so an update never
  // swaps code under a user who is in the middle of typing.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL.map(async (u) => {
      try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r && r.ok) await cache.put(u, r); } catch (e) { /* optional */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('prime-cache-') && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Network first (fresh code when online), cache when offline or slow.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fetchWithTimeout(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await cache.match('./index.html'); if (idx) return idx; }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
