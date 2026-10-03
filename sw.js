const CACHE_NAME = 'zidan-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Only our own files. Never touch other sites (e.g. the Google Sheet listings feed).
  if (new URL(req.url).origin !== self.location.origin) return;

  // Always go to the network first, bypassing the browser cache, so every visit gets the latest version.
  event.respondWith(
    fetch(req.url, { cache: 'no-store' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
