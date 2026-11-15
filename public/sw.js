// Tempest service worker: keeps the app's own files on the device so it opens
// fast and without signal. Map files and weather are not handled here; they
// go through the app's store (saved areas, M3 and M8). No background work: the
// worker only answers requests the open app makes.
const CACHE = 'tempest-app-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.headers.has('range') || url.pathname.includes('/tiles/')) return;

  // Pages and the manifest: newest first, the saved copy without signal.
  if (req.mode === 'navigate' || url.pathname.endsWith('.webmanifest')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) ?? (await cache.match('./')) ?? Response.error();
      }
    })());
    return;
  }

  // Built files carry a content hash in their name, so a saved copy is never stale.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});
