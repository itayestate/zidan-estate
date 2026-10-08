const CACHE_NAME = 'zidan-v5';

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
  const url = new URL(req.url);
  // Never touch other sites (e.g. the Google Sheet listings feed).
  if (url.origin !== self.location.origin) return;

  // Update checks always hit the network and are never stored.
  if (url.searchParams.has('v')) {
    event.respondWith(fetch(req.url, { cache: 'no-store' }));
    return;
  }

  // Images (hero photo, icons): serve the saved copy instantly, refresh it in the background.
  if (/\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const refresh = fetch(req.url).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await refresh) || Response.error();
    })());
    return;
  }

  const isPage = req.mode === 'navigate';
  // Every page address (?p=...) shares one cached copy for offline use.
  const key = isPage ? new Request(url.origin + url.pathname) : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Pages: network first, bypassing the browser cache, so every open gets the latest version.
    const network = fetch(req.url, { cache: 'no-store', redirect: isPage ? 'manual' : 'follow' }).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    });
    network.catch(() => {});
    const cached = await cache.match(key);
    if (!cached) return network;
    // On a very slow connection, fall back to the saved copy after 4 seconds.
    try {
      return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, 4000))]);
    } catch (e) {
      return cached;
    }
  })());
});
